window.Shrinkhala = window.Shrinkhala || {};
window.Shrinkhala.Crypto = (function() {
    async function sha256(str) {
        const buf = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function hashFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const buffer = e.target.result;
                const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                resolve(hashArray.map(b => b.toString(16).padStart(2, '0')).join(''));
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    async function createDiaryHash(text, prevHash, timestamp, beacon) {
        const payload = `${text}|${prevHash}|${timestamp}|${beacon}`;
        return await sha256(payload);
    }

    async function verifyDiaryChain(entries) {
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const computed = await createDiaryHash(entry.text, entry.prevHash, entry.timestamp, entry.beacon);
            if (computed !== entry.currentHash) {
                return { valid: false, brokenAt: entry.id };
            }
            if (i > 0 && entry.prevHash !== entries[i-1].currentHash) {
                return { valid: false, brokenAt: entry.id };
            }
        }
        return { valid: true, brokenAt: null };
    }

    async function fetchBeacon() {
        try {
            const response = await fetch('https://blockchain.info/q/latesthash');
            if (response.ok) {
                const hash = await response.text();
                return hash.substring(0, 8);
            }
        } catch (e) {
            // ignore and fallback
        }
        const randomValues = new Uint32Array(2);
        crypto.getRandomValues(randomValues);
        const hex = Array.from(new Uint8Array(randomValues.buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        return hex.substring(0, 8);
    }

    class MerkleTree {
        constructor() {
            this.leaves = [];
            this.layers = [];
            this._currentRoot = '0'.repeat(64);
        }

        async addLeaf(hash) {
            this.leaves.push(hash);
            await this._buildTree();
        }

        async _buildTree() {
            if (this.leaves.length === 0) {
                this._currentRoot = '0'.repeat(64);
                return;
            }
            this.layers = [this.leaves.slice()];
            let currentLayer = this.layers[0];
            
            while (currentLayer.length > 1) {
                const nextLayer = [];
                for (let i = 0; i < currentLayer.length; i += 2) {
                    const left = currentLayer[i];
                    const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
                    const combined = await sha256(left + right);
                    nextLayer.push(combined);
                }
                this.layers.push(nextLayer);
                currentLayer = nextLayer;
            }
            this._currentRoot = currentLayer[0];
        }

        getRoot() {
            return this._currentRoot;
        }

        getProof(index) {
            let proof = [];
            let pos = index;
            for (let i = 0; i < this.layers.length - 1; i++) {
                const layer = this.layers[i];
                const isLeft = pos % 2 === 0;
                const pairIndex = isLeft ? pos + 1 : pos - 1;
                
                if (pairIndex < layer.length) {
                    proof.push({ hash: layer[pairIndex], position: isLeft ? 'right' : 'left' });
                } else {
                    proof.push({ hash: layer[pos], position: 'right' });
                }
                pos = Math.floor(pos / 2);
            }
            return proof;
        }

        async verifyProof(hash, proof, root) {
            let computed = hash;
            for (let p of proof) {
                if (p.position === 'right') {
                    computed = await sha256(computed + p.hash);
                } else {
                    computed = await sha256(p.hash + computed);
                }
            }
            return computed === root;
        }

        get size() {
            return this.leaves.length;
        }
    }

    return {
        sha256,
        hashFile,
        createDiaryHash,
        verifyDiaryChain,
        fetchBeacon,
        MerkleTree
    };
})();
