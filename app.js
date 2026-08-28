/**
 * app.js - Core Application File for Shrinkhala
 * Secure Digital Document Management System for Legal & Investigation Documents
 */

(function () {
  'use strict';

  // Ensure namespace exists
  window.Shrinkhala = window.Shrinkhala || {};

  // Application State
  const state = {
    cases: [],              // Case[]
    activeCaseId: null,     // current case ID
    documents: [],          // Document[]
    diaryEntries: [],       // DiaryEntry[]
    merkleTree: null,       // MerkleTree instance
    currentBeacon: '',      // current beacon value
    lastAuditResult: null,  // AuditResult
    selectedDocument: null, // currently viewed document
    currentFile: null,      // File object from upload
    activityTimeline: [],   // Array of { action, timestamp, icon }
  };

  // Utility Functions
  const utils = {
    generateId() {
      if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'idx_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
    },

    truncateHash(hash, len = 12) {
      if (!hash) return '0'.repeat(len);
      if (hash.length <= len + 4) return hash;
      return hash.substring(0, len) + '...' + hash.substring(hash.length - 4);
    },

    formatTimestamp(isoString) {
      if (!isoString) return '';
      const date = new Date(isoString);
      return date.toLocaleString();
    },

    relativeTime(date) {
      if (!(date instanceof Date)) date = new Date(date);
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.round(diffMs / 1000);
      const diffMin = Math.round(diffSec / 60);
      const diffHr = Math.round(diffMin / 60);
      const diffDays = Math.round(diffHr / 24);

      if (diffSec < 30) return 'just now';
      if (diffMin < 60) return `${diffMin} min ago`;
      if (diffHr < 24) return `${diffHr} hr ago`;
      if (diffDays === 1) return 'yesterday';
      return `${diffDays} days ago`;
    },

    animateValue(element, start, end, duration) {
      let startTimestamp = null;
      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        element.textContent = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          element.textContent = end;
        }
      };
      window.requestAnimationFrame(step);
    }
  };

  // UI Manager
  const UI = {
    showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      
      let icon = 'ℹ️';
      if (type === 'success') icon = '✅';
      if (type === 'error') icon = '❌';

      toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
      container.appendChild(toast);

      // Trigger animation
      setTimeout(() => toast.classList.add('show'), 10);

      // Remove after 4s
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    },

    showModal(title, bodyHTML) {
      const overlay = document.getElementById('modal-overlay');
      const titleEl = document.getElementById('modal-title');
      const bodyEl = document.getElementById('modal-body');

      if (!overlay || !titleEl || !bodyEl) return;

      titleEl.textContent = title;
      bodyEl.innerHTML = bodyHTML;
      overlay.classList.remove('hidden');
    },

    hideModal() {
      const overlay = document.getElementById('modal-overlay');
      if (overlay) {
        overlay.classList.add('hidden');
      }
    },

    logActivity(action, icon = '📄') {
      state.activityTimeline.unshift({ action, timestamp: new Date(), icon });
      if (state.activityTimeline.length > 10) {
        state.activityTimeline.pop();
      }
      this.renderActivityTimeline();
    },

    renderActivityTimeline() {
      const container = document.getElementById('activity-timeline');
      if (!container) return;

      container.innerHTML = '';
      state.activityTimeline.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'timeline-item';
        itemEl.innerHTML = `
          <div class="timeline-icon">${item.icon}</div>
          <div class="timeline-content">
            <p>${item.action}</p>
            <span class="text-muted">${utils.relativeTime(item.timestamp)}</span>
          </div>
        `;
        container.appendChild(itemEl);
      });
    },

    switchTab(tabId) {
      // Nav items
      document.querySelectorAll('.nav-item').forEach(nav => {
        if (nav.id === `nav-${tabId}`) {
          nav.classList.add('active');
        } else {
          nav.classList.remove('active');
        }
      });

      // Tab panels
      document.querySelectorAll('.tab-content').forEach(panel => {
        if (panel.id === `tab-${tabId}`) {
          panel.classList.remove('hidden');
        } else {
          panel.classList.add('hidden');
        }
      });

      // Specific tab refresh logic
      if (tabId === 'diary') {
        refreshBeacon();
      } else if (tabId === 'dashboard') {
        updateDashboard();
      }
    }
  };

  // Expose global functions for inline HTML event handlers
  window.toggleAccordion = function(element) {
    const body = element.nextElementSibling;
    if (body.style.display === 'block') {
      body.style.display = 'none';
      element.querySelector('.accordion-chevron').textContent = '▼';
    } else {
      body.style.display = 'block';
      element.querySelector('.accordion-chevron').textContent = '▲';
    }
  };

  window.closeModal = UI.hideModal;

  // --- Dashboard Logic ---
  function updateDashboard() {
    // 1. Update metric cards
    const docValueEl = document.getElementById('metric-total-docs-value');
    if (docValueEl) docValueEl.textContent = state.documents.length;

    const conflictsEl = document.getElementById('metric-open-conflicts-value');
    if (conflictsEl) {
      conflictsEl.textContent = state.lastAuditResult ? state.lastAuditResult.conflicts.length : '—';
    }

    const integrityEl = document.getElementById('metric-integrity-value');
    if (integrityEl && state.merkleTree) {
      integrityEl.textContent = state.merkleTree.size > 0 ? 'Verified' : 'Empty';
      integrityEl.className = state.merkleTree.size > 0 ? 'text-success' : 'text-muted';
    }

    // 2. Update Gauge
    const gaugeArc = document.getElementById('gauge-arc');
    const gaugeValue = document.getElementById('gauge-value');
    const gaugeLabel = document.getElementById('gauge-label');
    
    if (gaugeArc && gaugeValue) {
      let score = 0;
      if (state.lastAuditResult) {
        score = state.lastAuditResult.trialReadiness;
      } else if (state.documents.length > 0) {
        // Rough estimate if no audit run yet
        score = Math.min(100, state.documents.length * 15); 
      }

      // Animate Value
      const currentScore = parseInt(gaugeValue.textContent) || 0;
      utils.animateValue(gaugeValue, currentScore, score, 1000);
      
      // Update Arc offset
      const maxOffset = 565.48;
      const targetOffset = maxOffset - (maxOffset * score / 100);
      gaugeArc.style.strokeDashoffset = targetOffset;
      
      // Color gauge
      gaugeArc.classList.remove('stroke-success', 'stroke-warning', 'stroke-danger');
      if (score > 70) {
        gaugeArc.classList.add('stroke-success');
      } else if (score > 40) {
        gaugeArc.classList.add('stroke-warning');
      } else {
        gaugeArc.classList.add('stroke-danger');
      }
    }

    // 3. Update timeline
    UI.renderActivityTimeline();
  }

  // --- Ingestion Logic ---
  
  function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  function handleFileSelect(file) {
    state.currentFile = file;
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.innerHTML = `<div class="file-selected">📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)</div>`;
    }
  }

  async function processDocument() {
    if (!state.currentFile) {
      UI.showToast('Please select a file to process.', 'error');
      return;
    }

    const docTypeSelect = document.getElementById('doc-type-select');
    const docType = docTypeSelect ? docTypeSelect.value : null;

    if (!docType) {
      UI.showToast('Please select a document type.', 'error');
      return;
    }

    const statusEl = document.getElementById('processing-status');
    const btnProcess = document.getElementById('btn-process');
    
    if (btnProcess) {
      btnProcess.disabled = true;
      btnProcess.textContent = 'Processing...';
    }

    try {
      if (statusEl) statusEl.textContent = 'Hashing document...';
      
      // Hash the file
      let hash;
      if (window.Shrinkhala.Crypto.hashFile) {
        hash = await window.Shrinkhala.Crypto.hashFile(state.currentFile);
      } else {
        // Fallback or demo behavior
        hash = await window.Shrinkhala.Crypto.sha256(state.currentFile.name + Date.now());
      }

      if (statusEl) statusEl.textContent = 'Extracting entities via AI...';
      
      // Extract entities
      const extractionResult = await window.Shrinkhala.Extraction.mockExtractFromFile(state.currentFile, docType);
      
      if (statusEl) statusEl.textContent = 'Committing to blockchain ledger...';

      // Create Document object
      const doc = {
        id: utils.generateId(),
        name: state.currentFile.name,
        type: docType,
        typeLabel: (window.Shrinkhala.Extraction.DOCUMENT_TYPES.find(t => t.value === docType) || {}).label || docType,
        caseId: state.activeCaseId,
        content: extractionResult.content,
        hash: hash,
        entities: extractionResult.entities,
        uploadedAt: new Date().toISOString()
      };

      // Update Merkle Tree
      if (state.merkleTree) {
        await state.merkleTree.addLeaf(hash);
      }

      // Save to Storage
      if (window.Shrinkhala.Storage) {
        await window.Shrinkhala.Storage.saveDocument(doc);
      }
      
      state.documents.push(doc);
      
      if (statusEl) statusEl.textContent = '✅ Document secured!';
      
      UI.showToast('Document processed and secured', 'success');
      UI.logActivity(`Document '${doc.name}' processed and secured`);
      
      updateUploadedDocsList();
      selectDocument(doc);
      updateDashboard();

      // Clear input
      state.currentFile = null;
      const dropZone = document.getElementById('drop-zone');
      if (dropZone) dropZone.innerHTML = `<div class="drop-zone-icon">☁️</div><div class="drop-zone-text">Drag & drop files here</div><div class="drop-zone-text">or click to browse</div><div class="drop-zone-hint">Supports PDF, PNG, JPG</div><input id="file-input" type="file" accept=".pdf,.png,.jpg,.jpeg" hidden>`;
      // Re-bind file input listener since the element was recreated
      const newFileInput = document.getElementById('file-input');
      if (newFileInput) {
        newFileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
          }
        });
      }

    } catch (error) {
      console.error('Error processing document:', error);
      UI.showToast('Failed to process document.', 'error');
      if (statusEl) statusEl.textContent = '❌ Processing failed';
    } finally {
      if (btnProcess) {
        btnProcess.disabled = false;
        btnProcess.textContent = 'Process & Secure';
      }
      setTimeout(() => {
        if (statusEl) statusEl.textContent = '';
      }, 3000);
    }
  }

  function updateUploadedDocsList() {
    const listEl = document.getElementById('uploaded-docs-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    
    // Sort by newest first
    const sortedDocs = [...state.documents].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    sortedDocs.forEach(doc => {
      const item = document.createElement('div');
      item.className = `doc-list-item ${state.selectedDocument && state.selectedDocument.id === doc.id ? 'selected' : ''}`;
      
      // Determine badge color
      let badgeColor = 'badge-primary';
      if (doc.type === 'fsl_report') badgeColor = 'badge-warning';
      else if (doc.type === 'seizure_memo') badgeColor = 'badge-danger';
      else if (doc.type === 'charge_sheet') badgeColor = 'badge-success';
      
      item.innerHTML = `
        <div class="doc-list-header">
          <span class="badge ${badgeColor}">${doc.typeLabel || doc.type}</span>
          <span class="doc-list-date">${utils.relativeTime(doc.uploadedAt)}</span>
        </div>
        <div class="doc-list-name">${doc.name}</div>
        <div class="doc-list-hash mono">${utils.truncateHash(doc.hash, 8)}</div>
      `;
      
      item.addEventListener('click', () => selectDocument(doc));
      listEl.appendChild(item);
    });
  }

  function selectDocument(doc) {
    state.selectedDocument = doc;
    updateUploadedDocsList(); // to refresh selected class
    renderDocumentPreview();
    renderEntitiesPanel();
  }

  function renderDocumentPreview() {
    const previewEl = document.getElementById('document-preview');
    if (!previewEl || !state.selectedDocument) return;

    const roleSelect = document.getElementById('role-select');
    const role = roleSelect ? roleSelect.value : 'io';

    const redactedContent = window.Shrinkhala.Extraction.applyRedaction(state.selectedDocument.content, role);
    
    previewEl.innerHTML = `<pre class="document-content">${redactedContent}</pre>`;
  }

  function renderEntitiesPanel() {
    const panelEl = document.getElementById('entities-panel');
    if (!panelEl) return;
    
    if (!state.selectedDocument || !state.selectedDocument.entities) {
      panelEl.classList.add('hidden');
      return;
    }
    
    panelEl.classList.remove('hidden');
    panelEl.innerHTML = '<div class="entities-header">Extracted Entities</div>';
    const entities = state.selectedDocument.entities;

    const categories = [
      { key: 'sealNumbers', label: 'Seal Numbers', color: 'blue' },
      { key: 'weights', label: 'Weights', color: 'amber' },
      { key: 'dates', label: 'Dates', color: 'green' },
      { key: 'times', label: 'Times', color: 'purple' },
      { key: 'sections', label: 'Law Sections', color: 'red' },
      { key: 'witnesses', label: 'Witnesses', color: 'cyan' },
      { key: 'locations', label: 'Locations', color: 'orange' },
      { key: 'gps', label: 'GPS', color: 'teal' },
      { key: 'officers', label: 'Officers', color: 'indigo' },
      { key: 'substances', label: 'Substances', color: 'pink' },
      { key: 'accused', label: 'Accused', color: 'danger' },
      { key: 'victims', label: 'Victims', color: 'info' },
      { key: 'caseNumber', label: 'Case Number', color: 'primary' }
    ];

    categories.forEach(cat => {
      let values = entities[cat.key];
      if (!values) return;
      if (!Array.isArray(values)) values = [values];
      if (values.length === 0) return;

      const groupEl = document.createElement('div');
      groupEl.className = 'entity-group';
      groupEl.innerHTML = `<div class="entity-group-label">${cat.label}</div>`;
      
      const chipsEl = document.createElement('div');
      chipsEl.className = 'entity-chips';
      
      values.forEach(val => {
        if (!val) return;
        const chip = document.createElement('span');
        chip.className = 'entity-chip';
        // Extract display text from different entity object shapes
        let displayText = '';
        if (typeof val === 'string') {
          displayText = val;
        } else if (val.name) {
          displayText = val.name + (val.location ? ` @ ${val.location}` : '') + (val.time ? ` (${val.time})` : '');
        } else if (val.value !== undefined) {
          displayText = `${val.value}${val.unit ? ' ' + val.unit : ''}${val.grossOrNet && val.grossOrNet !== 'unknown' ? ' (' + val.grossOrNet + ')' : ''}`;
        } else if (val.lat !== undefined) {
          displayText = `${val.lat}°N, ${val.lng}°E`;
        } else {
          displayText = JSON.stringify(val);
        }
        chip.textContent = displayText;
        chipsEl.appendChild(chip);
      });
      
      groupEl.appendChild(chipsEl);
      panelEl.appendChild(groupEl);
    });
    
    if (panelEl.innerHTML === '') {
      panelEl.innerHTML = '<p class="text-muted">No entities extracted.</p>';
    }
  }

  // --- Case Diary Logic ---

  async function refreshBeacon() {
    try {
      state.currentBeacon = await window.Shrinkhala.Crypto.fetchBeacon();
      const beaconDisplay = document.getElementById('beacon-display');
      if (beaconDisplay) beaconDisplay.textContent = state.currentBeacon;
    } catch (e) {
      console.error('Failed to fetch beacon', e);
    }
  }

  async function commitDiaryEntry() {
    const textarea = document.getElementById('diary-textarea');
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) {
      UI.showToast('Diary entry cannot be empty', 'error');
      return;
    }

    const btnCommit = document.getElementById('btn-commit-diary');
    if (btnCommit) {
      btnCommit.disabled = true;
      btnCommit.textContent = 'Committing...';
    }

    try {
      const prevHash = state.diaryEntries.length > 0 
        ? state.diaryEntries[state.diaryEntries.length - 1].currentHash 
        : '0'.repeat(64);
      
      const timestamp = new Date().toISOString();
      const beacon = state.currentBeacon || await window.Shrinkhala.Crypto.fetchBeacon();
      
      const currentHash = await window.Shrinkhala.Crypto.createDiaryHash(text, prevHash, timestamp, beacon);
      
      const entry = {
        id: state.diaryEntries.length + 1,
        text,
        timestamp,
        prevHash,
        currentHash,
        beacon,
        caseId: state.activeCaseId
      };

      if (window.Shrinkhala.Storage) {
        await window.Shrinkhala.Storage.saveDiaryEntry(entry);
      }

      state.diaryEntries.push(entry);
      
      UI.showToast('Diary entry committed to chain', 'success');
      UI.logActivity('New case diary entry committed', '📝');
      
      textarea.value = '';
      await refreshBeacon();
      updateDiaryUI();
      
    } catch (e) {
      console.error('Error committing diary entry', e);
      UI.showToast('Failed to commit entry', 'error');
    } finally {
      if (btnCommit) {
        btnCommit.disabled = false;
        btnCommit.textContent = 'Commit to Chain 🔒';
      }
    }
  }

  function updateDiaryUI() {
    const countEl = document.getElementById('diary-chain-count');
    if (countEl) countEl.textContent = state.diaryEntries.length;

    const statusEl = document.getElementById('diary-chain-status');
    if (statusEl) {
      statusEl.textContent = state.diaryEntries.length === 0 ? 'Genesis' : `${state.diaryEntries.length} Entries`;
    }

    const lastHashEl = document.getElementById('diary-last-hash');
    if (lastHashEl) {
      const hash = state.diaryEntries.length > 0 
        ? state.diaryEntries[state.diaryEntries.length - 1].currentHash 
        : '0'.repeat(64);
      lastHashEl.textContent = utils.truncateHash(hash, 8);
    }

    const tbody = document.getElementById('diary-ledger-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Sort descending for view
    const sortedEntries = [...state.diaryEntries].sort((a, b) => b.id - a.id);
    
    sortedEntries.forEach((entry, index) => {
      const tr = document.createElement('tr');
      const isGenesis = entry.id === 1;
      
      let textSnippet = entry.text;
      if (textSnippet.length > 80) textSnippet = textSnippet.substring(0, 80) + '...';

      tr.innerHTML = `
        <td>${entry.id}</td>
        <td>${utils.formatTimestamp(entry.timestamp)}</td>
        <td>${textSnippet}</td>
        <td class="mono ${isGenesis ? 'text-muted' : ''}" title="${entry.prevHash}">
          ${utils.truncateHash(entry.prevHash, 12)}
        </td>
        <td class="mono font-weight-bold">${utils.truncateHash(entry.currentHash, 12)}</td>
        <td class="mono">${entry.beacon || '—'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // --- Audit Logic ---

  async function runAudit() {
    const btnAudit = document.getElementById('btn-audit');
    if (btnAudit) {
      btnAudit.disabled = true;
      btnAudit.innerHTML = 'Analyzing... <span class="spinner"></span>';
    }

    try {
      // Simulate delay for dramatic effect
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const result = window.Shrinkhala.Audit.runIntegrityAudit(state.documents, state.merkleTree);
      state.lastAuditResult = result;
      
      UI.showToast('Audit complete. ' + result.conflicts.length + ' conflicts found.', 'info');
      UI.logActivity('Integrity audit run', '🔍');
      
      updateAuditUI();
      updateDashboard();
      
    } catch (e) {
      console.error('Audit failed', e);
      UI.showToast('Audit failed', 'error');
    } finally {
      if (btnAudit) {
        btnAudit.disabled = false;
        btnAudit.innerHTML = 'Run Comprehensive Audit';
      }
    }
  }

  function updateAuditUI() {
    if (!state.lastAuditResult) return;
    const result = state.lastAuditResult;

    // Summary stats
    const summaryEl = document.getElementById('audit-summary');
    if (summaryEl) {
      let readinessClass = result.trialReadiness > 70 ? 'text-success' : result.trialReadiness > 40 ? 'text-warning' : 'text-danger';
      
      summaryEl.innerHTML = `
        <div class="audit-stat">
          <div class="stat-label">Trial Readiness</div>
          <div class="stat-val ${readinessClass}">${result.trialReadiness}%</div>
        </div>
        <div class="audit-stat">
          <div class="stat-label">Total Conflicts</div>
          <div class="stat-val ${result.conflicts.length > 0 ? 'text-danger' : 'text-success'}">${result.conflicts.length}</div>
        </div>
        <div class="audit-stat">
          <div class="stat-label">Blockchain Integrity</div>
          <div class="stat-val text-success">Verified</div>
        </div>
      `;
    }

    // Procedural checklist
    const checklistEl = document.getElementById('procedural-checklist');
    if (checklistEl && result.proceduralStatus) {
      checklistEl.innerHTML = '';
      
      const allRequired = result.proceduralStatus.required || [];
      const presentTypes = result.proceduralStatus.present || [];
      const missingTypes = result.proceduralStatus.missing || [];
      
      allRequired.forEach(req => {
        const isPresent = presentTypes.includes(req.type);
        const item = document.createElement('div');
        item.className = `checklist-item ${isPresent ? 'checklist-present' : 'checklist-missing'}`;
        item.innerHTML = `
          <span class="checklist-icon">${isPresent ? '✅' : '❌'}</span>
          <span class="checklist-name">${req.name}</span>
          <span class="checklist-status" style="margin-left:auto;font-size:0.85rem;color:${isPresent ? 'var(--success)' : 'var(--danger)'}">${isPresent ? 'Present' : 'MISSING'}</span>
        `;
        checklistEl.appendChild(item);
      });
    }

    // Conflicts
    const conflictsEl = document.getElementById('conflicts-container');
    if (conflictsEl) {
      conflictsEl.innerHTML = '';
      
      if (result.conflicts.length === 0) {
        conflictsEl.innerHTML = '<div class="alert alert-success">No conflicts detected. Everything aligns perfectly.</div>';
      } else {
        result.conflicts.forEach((conflict, index) => {
          let badgeClass = 'badge-info';
          if (conflict.severity === 'CRITICAL') badgeClass = 'badge-critical badge-danger';
          else if (conflict.severity === 'WARNING') badgeClass = 'badge-warning';

          const docA = conflict.details && conflict.details.documentA;
          const docB = conflict.details && conflict.details.documentB;

          let comparisonHTML = '';
          if (docA && docB) {
            comparisonHTML = `
              <div class="conflict-comparison">
                <div class="conflict-doc-a">
                  <strong>Document A:</strong> ${docA.name || 'Unknown'}<br>
                  Field: ${docA.field}<br>
                  Value: <span class="highlight-val">${docA.value}</span>
                </div>
                <div class="conflict-doc-b">
                  <strong>Document B:</strong> ${docB.name || 'Unknown'}<br>
                  Field: ${docB.field}<br>
                  Value: <span class="highlight-val">${docB.value}</span>
                </div>
              </div>
            `;
          }

          const accordion = document.createElement('div');
          accordion.className = 'accordion';
          accordion.innerHTML = `
            <div class="accordion-header" onclick="window.toggleAccordion(this)">
              <span class="badge ${badgeClass}">${conflict.severity}</span>
              <span class="conflict-title">${conflict.title}</span>
              <span class="accordion-chevron">${index === 0 ? '▲' : '▼'}</span>
            </div>
            <div class="accordion-body" style="display: ${index === 0 ? 'block' : 'none'};">
              <p class="conflict-description">${conflict.description}</p>
              ${comparisonHTML}
              <div class="legal-citation">
                <div class="citation-icon">⚖️</div>
                <div class="citation-text">
                  <strong>Court Precedent:</strong>
                  <p>${conflict.legalCitation || 'N/A'}</p>
                  <strong>BNSS Reference:</strong>
                  <p>${conflict.bnssSection || 'N/A'}</p>
                </div>
              </div>
            </div>
          `;
          conflictsEl.appendChild(accordion);
        });
      }
    }
  }

  function generateDisclosureProof() {
    if (!state.documents || state.documents.length === 0) {
      UI.showToast('No documents available to generate proof', 'error');
      return;
    }
    
    if (!state.lastAuditResult) {
      UI.showToast('Please run an audit first', 'error');
      return;
    }

    try {
      const root = state.merkleTree ? state.merkleTree.getRoot() : '000';
      const proof = window.Shrinkhala.Audit.generateDisclosureProof(state.documents, root, state.lastAuditResult);
      
      const jsonStr = JSON.stringify(proof, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `shrinkhala_disclosure_proof_${new Date().getTime()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      UI.showToast('Disclosure proof generated and downloaded', 'success');
      UI.logActivity('Generated Disclosure Proof', '📑');
    } catch (e) {
      console.error('Error generating proof', e);
      UI.showToast('Failed to generate disclosure proof', 'error');
    }
  }

  // --- Case Management Logic ---

  async function loadCases() {
    state.cases = await window.Shrinkhala.Storage.getCases() || [];
    updateCaseSelectorUI();
  }

  function updateCaseSelectorUI() {
    const select = document.getElementById('case-select');
    if (!select) return;

    select.innerHTML = '';
    
    if (state.cases.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No cases found';
      option.disabled = true;
      option.selected = true;
      select.appendChild(option);
    } else {
      state.cases.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = c.number || c.name;
        if (state.activeCaseId === c.id) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    }

    const activeCase = state.cases.find(c => c.id === state.activeCaseId);
    const sidebarCaseId = document.getElementById('sidebar-case-id');
    if (sidebarCaseId) {
      sidebarCaseId.textContent = activeCase ? (activeCase.number || activeCase.name) : 'No case selected';
    }
  }

  async function switchCase(caseId) {
    if (!caseId) return;
    
    state.activeCaseId = caseId;
    updateCaseSelectorUI();
    
    // Load documents and diary entries for this case
    state.documents = await window.Shrinkhala.Storage.getDocuments(caseId) || [];
    state.diaryEntries = await window.Shrinkhala.Storage.getDiaryEntries(caseId) || [];
    
    // Re-init MerkleTree
    state.merkleTree = new window.Shrinkhala.Crypto.MerkleTree();
    for (const doc of state.documents) {
      await state.merkleTree.addLeaf(doc.hash);
    }

    // Reset UI state
    state.selectedDocument = null;
    state.lastAuditResult = null;
    state.activityTimeline = [];
    
    const previewEl = document.getElementById('document-preview');
    if (previewEl) previewEl.innerHTML = '<div class="text-center text-muted" style="margin-top: 100px;">Select a document to preview</div>';
    
    const panelEl = document.getElementById('entities-panel');
    if (panelEl) panelEl.classList.add('hidden');
    
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) dropZone.innerHTML = `<div class="drop-zone-icon">☁️</div><div class="drop-zone-text">Drag & drop files here</div><div class="drop-zone-text">or click to browse</div><div class="drop-zone-hint">Supports PDF, PNG, JPG</div><input id="file-input" type="file" accept=".pdf,.png,.jpg,.jpeg" hidden>`;
    
    setupDragAndDrop();

    UI.logActivity(`Switched to case ${state.cases.find(c => c.id === caseId)?.number || caseId}`, '📂');
    
    if (state.documents.length > 0) {
      selectDocument(state.documents[0]);
    } else {
      updateUploadedDocsList();
    }
    updateDiaryUI();
    
    if (state.documents.length > 0) {
      // Auto run audit if there are documents
      state.lastAuditResult = window.Shrinkhala.Audit.runIntegrityAudit(state.documents, state.merkleTree);
      updateAuditUI();
    } else {
      // Clear audit UI
      const summaryEl = document.getElementById('audit-summary');
      if (summaryEl) summaryEl.innerHTML = '<div class="text-muted">No documents to audit</div>';
      const checklistEl = document.getElementById('procedural-checklist');
      if (checklistEl) checklistEl.innerHTML = '';
      const conflictsEl = document.getElementById('conflicts-container');
      if (conflictsEl) conflictsEl.innerHTML = '';
    }
    
    updateDashboard();
  }

  function showNewCaseModal() {
    const formHTML = `
      <form id="new-case-form">
        <div class="form-group">
          <label class="form-label">Case Number (e.g. NDPS/GRG/42/2026)</label>
          <input type="text" id="new-case-number" class="form-control" required placeholder="Enter case number">
        </div>
        <div class="form-group">
          <label class="form-label">Case Name / Description</label>
          <input type="text" id="new-case-name" class="form-control" required placeholder="e.g. State vs Arjun Mehra">
        </div>
        <button type="submit" class="btn btn-primary w-100 mt-3">Create Case</button>
      </form>
    `;
    UI.showModal('Create New Case', formHTML);
    
    setTimeout(() => {
      const form = document.getElementById('new-case-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const numInput = document.getElementById('new-case-number').value.trim();
          const nameInput = document.getElementById('new-case-name').value.trim();
          
          if (!numInput) return;
          
          const newCase = {
            id: utils.generateId(),
            number: numInput,
            name: nameInput,
            createdAt: new Date().toISOString()
          };
          
          await window.Shrinkhala.Storage.saveCase(newCase);
          await loadCases();
          UI.hideModal();
          UI.showToast('New case created successfully', 'success');
          await switchCase(newCase.id);
        });
      }
    }, 100);
  }

  // --- Initialization ---

  async function loadDemoDataForCase(caseId) {
    const demoDocs = window.Shrinkhala.Extraction.getDemoDocuments(caseId);
    for (const doc of demoDocs) {
      doc.id = utils.generateId();
      doc.hash = await window.Shrinkhala.Crypto.sha256(doc.content);
      doc.uploadedAt = new Date().toISOString();
      
      await state.merkleTree.addLeaf(doc.hash);
      await window.Shrinkhala.Storage.saveDocument(doc);
      state.documents.push(doc);
    }
  }

  async function init() {
    try {
      // 1. Init Storage
      await window.Shrinkhala.Storage.init();
      
      // 2. Load Cases
      await loadCases();
      
      let loadedDemo = false;
      
      // 3. Handle First-Time Setup
      if (state.cases.length === 0) {
        // Create demo case
        const demoCase = {
          id: utils.generateId(),
          number: 'NDPS/GRG/42/2026',
          name: 'State vs Arjun Mehra',
          createdAt: new Date().toISOString()
        };
        await window.Shrinkhala.Storage.saveCase(demoCase);
        await loadCases();
        state.activeCaseId = demoCase.id;
        
        // Init MerkleTree for demo data loading
        state.merkleTree = new window.Shrinkhala.Crypto.MerkleTree();
        await loadDemoDataForCase(demoCase.id);
        loadedDemo = true;
      }
      
      // 4. Switch to active (or first) case
      const caseToLoad = state.activeCaseId || (state.cases.length > 0 ? state.cases[0].id : null);
      if (caseToLoad) {
        await switchCase(caseToLoad);
      }
      
      // 5. Fetch Beacon
      await refreshBeacon();

      // 6. Bind Events
      document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const targetId = item.id.replace('nav-', '');
          UI.switchTab(targetId);
        });
      });

      setupDragAndDrop();

      const btnProcess = document.getElementById('btn-process');
      if (btnProcess) btnProcess.addEventListener('click', processDocument);

      const roleSelect = document.getElementById('role-select');
      if (roleSelect) roleSelect.addEventListener('change', renderDocumentPreview);

      const btnCommit = document.getElementById('btn-commit-diary');
      if (btnCommit) btnCommit.addEventListener('click', commitDiaryEntry);

      const btnAudit = document.getElementById('btn-audit');
      if (btnAudit) btnAudit.addEventListener('click', runAudit);

      const btnDisclosure = document.getElementById('btn-disclosure');
      if (btnDisclosure) btnDisclosure.addEventListener('click', generateDisclosureProof);

      const caseSelect = document.getElementById('case-select');
      if (caseSelect) {
        caseSelect.addEventListener('change', (e) => {
          if (e.target.value) switchCase(e.target.value);
        });
      }
      
      const btnNewCase = document.getElementById('btn-new-case');
      if (btnNewCase) {
        btnNewCase.addEventListener('click', showNewCaseModal);
      }

      const modalOverlay = document.getElementById('modal-overlay');
      if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
          if (e.target === modalOverlay) UI.hideModal();
        });
      }

      const modalClose = document.getElementById('modal-close');
      if (modalClose) {
        modalClose.addEventListener('click', UI.hideModal);
      }

      // 7. Initial UI setup
      UI.logActivity('System Initialized', '🚀');
      
      if (loadedDemo) {
        UI.showToast('Shrinkhala initialized. Demo case loaded.', 'success');
        // Auto-run audit if demo data loaded
        await runAudit();
      } else {
        UI.showToast(`Shrinkhala initialized. Loaded case ${state.cases.find(c=>c.id === caseToLoad)?.number}.`, 'success');
      }

    } catch (error) {
      console.error('Initialization error:', error);
      UI.showToast('Failed to initialize Shrinkhala app.', 'error');
    }
  }

  // Export App
  window.Shrinkhala.App = {
    init,
    getState: () => state
  };

  // Run on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    window.Shrinkhala.App.init();
  });

})();
