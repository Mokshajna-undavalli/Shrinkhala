window.Shrinkhala = window.Shrinkhala || {};
window.Shrinkhala.Storage = (function() {
    let db = null;
    const DB_NAME = 'ShrinkhalaDB';
    const DB_VERSION = 2;

    function init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const d = e.target.result;
                const tx = e.target.transaction;

                // Cases store (new in v2)
                if (!d.objectStoreNames.contains('cases')) {
                    d.createObjectStore('cases', { keyPath: 'id' });
                }

                // Documents store
                if (!d.objectStoreNames.contains('documents')) {
                    const docStore = d.createObjectStore('documents', { keyPath: 'id' });
                    docStore.createIndex('caseId', 'caseId', { unique: false });
                } else {
                    const docStore = tx.objectStore('documents');
                    if (!docStore.indexNames.contains('caseId')) {
                        docStore.createIndex('caseId', 'caseId', { unique: false });
                    }
                }

                // Diary entries store
                if (!d.objectStoreNames.contains('diaryEntries')) {
                    const diaryStore = d.createObjectStore('diaryEntries', { keyPath: 'id' });
                    diaryStore.createIndex('caseId', 'caseId', { unique: false });
                } else {
                    const diaryStore = tx.objectStore('diaryEntries');
                    if (!diaryStore.indexNames.contains('caseId')) {
                        diaryStore.createIndex('caseId', 'caseId', { unique: false });
                    }
                }
            };

            request.onsuccess = (e) => {
                db = e.target.result;
                resolve();
            };

            request.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }

    function _promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- Cases ---
    function saveCase(caseObj) {
        const tx = db.transaction('cases', 'readwrite');
        return _promisifyRequest(tx.objectStore('cases').put(caseObj));
    }

    function getCases() {
        const tx = db.transaction('cases', 'readonly');
        return _promisifyRequest(tx.objectStore('cases').getAll());
    }

    function deleteCase(id) {
        const tx = db.transaction('cases', 'readwrite');
        return _promisifyRequest(tx.objectStore('cases').delete(id));
    }

    // --- Documents ---
    function saveDocument(doc) {
        const tx = db.transaction('documents', 'readwrite');
        return _promisifyRequest(tx.objectStore('documents').put(doc));
    }

    async function getDocuments(caseId) {
        const tx = db.transaction('documents', 'readonly');
        const store = tx.objectStore('documents');
        if (caseId) {
            const index = store.index('caseId');
            return _promisifyRequest(index.getAll(caseId));
        }
        return _promisifyRequest(store.getAll());
    }

    function deleteDocument(id) {
        const tx = db.transaction('documents', 'readwrite');
        return _promisifyRequest(tx.objectStore('documents').delete(id));
    }

    // --- Diary Entries ---
    function saveDiaryEntry(entry) {
        const tx = db.transaction('diaryEntries', 'readwrite');
        return _promisifyRequest(tx.objectStore('diaryEntries').put(entry));
    }

    async function getDiaryEntries(caseId) {
        const tx = db.transaction('diaryEntries', 'readonly');
        const store = tx.objectStore('diaryEntries');
        let entries;
        if (caseId) {
            const index = store.index('caseId');
            entries = await _promisifyRequest(index.getAll(caseId));
        } else {
            entries = await _promisifyRequest(store.getAll());
        }
        return entries.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    }

    // --- Bulk ---
    async function deleteDocumentsByCase(caseId) {
        const docs = await getDocuments(caseId);
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        for (const doc of docs) {
            store.delete(doc.id);
        }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function deleteDiaryEntriesByCase(caseId) {
        const entries = await getDiaryEntries(caseId);
        const tx = db.transaction('diaryEntries', 'readwrite');
        const store = tx.objectStore('diaryEntries');
        for (const entry of entries) {
            store.delete(entry.id);
        }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function clearAll() {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['cases', 'documents', 'diaryEntries'], 'readwrite');
            tx.objectStore('cases').clear();
            tx.objectStore('documents').clear();
            tx.objectStore('diaryEntries').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    return {
        init,
        saveCase,
        getCases,
        deleteCase,
        saveDocument,
        getDocuments,
        deleteDocument,
        deleteDocumentsByCase,
        saveDiaryEntry,
        getDiaryEntries,
        deleteDiaryEntriesByCase,
        clearAll
    };
})();
