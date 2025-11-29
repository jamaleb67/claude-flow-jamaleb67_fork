import { AgentDBBackend } from '../memory/backends/agentdb.js';
export class TruthDBAdapter {
    backend;
    initialized = false;
    initPromise = null;
    constructor(){
        this.backend = new AgentDBBackend({
            dbPath: '.agentdb/truth-scores.db',
            enableHNSW: true,
            quantization: 'scalar'
        });
    }
    async initialize() {
        if (this.initialized) {
            return true;
        }
        if (this.initPromise) {
            await this.initPromise;
            return this.initialized;
        }
        this.initPromise = this._doInitialize();
        await this.initPromise;
        return this.initialized;
    }
    async _doInitialize() {
        try {
            await this.backend.initialize();
            this.initialized = true;
            console.error(`[${new Date().toISOString()}] INFO [TruthDBAdapter] Initialized at .agentdb/truth-scores.db`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] ERROR [TruthDBAdapter] Initialization failed:`, error.message);
            this.initialized = false;
        }
    }
    isReady() {
        return this.initialized;
    }
    async saveContext(taskId, data) {
        if (!this.initialized) {
            await this.initialize();
        }
        if (!this.initialized) {
            console.warn(`[TruthDBAdapter] Not initialized, skipping save for ${taskId}`);
            return;
        }
        const key = `truth:${taskId}`;
        const embedding = this.generateEmbedding(data);
        try {
            await this.backend.storeVector(key, embedding, {
                ...data,
                _type: 'truth_score',
                _storedAt: Date.now(),
                _version: 1
            });
        } catch (error) {
            console.error(`[TruthDBAdapter] Failed to save context ${taskId}:`, error.message);
            throw error;
        }
    }
    async getContext(taskId) {
        if (!this.initialized) {
            await this.initialize();
        }
        if (!this.initialized) {
            return null;
        }
        const key = `truth:${taskId}`;
        try {
            const result = await this.backend.getVector(key);
            if (!result || !result.metadata) {
                return null;
            }
            return result.metadata;
        } catch (error) {
            console.error(`[TruthDBAdapter] Failed to get context ${taskId}:`, error.message);
            return null;
        }
    }
    async deleteContext(taskId) {
        if (!this.initialized) {
            return false;
        }
        const key = `truth:${taskId}`;
        try {
            return await this.backend.deleteVector(key);
        } catch (error) {
            console.error(`[TruthDBAdapter] Failed to delete ${taskId}:`, error.message);
            return false;
        }
    }
    async saveSnapshot(taskId, snapshot) {
        if (!this.initialized) {
            await this.initialize();
        }
        if (!this.initialized) {
            return;
        }
        const key = `snapshot:${taskId}:${snapshot.snapshotId}`;
        const embedding = this.generateSnapshotEmbedding(snapshot);
        try {
            await this.backend.storeVector(key, embedding, {
                ...snapshot,
                _type: 'snapshot',
                _storedAt: Date.now()
            });
        } catch (error) {
            console.error(`[TruthDBAdapter] Failed to save snapshot:`, error.message);
        }
    }
    async getSnapshots(taskId) {
        if (!this.initialized) {
            return [];
        }
        try {
            const queryEmbedding = this.generateSnapshotEmbedding({
                snapshotId: '',
                taskId,
                timestamp: Date.now(),
                phase: 'query',
                state: null,
                metadata: {}
            });
            const results = await this.backend.search(queryEmbedding, {
                k: 100,
                filter: {
                    taskId,
                    _type: 'snapshot'
                }
            });
            return results.map((r)=>r.metadata).filter((s)=>s && s.snapshotId).sort((a, b)=>a.timestamp - b.timestamp);
        } catch (error) {
            console.error(`[TruthDBAdapter] Failed to get snapshots for ${taskId}:`, error.message);
            return [];
        }
    }
    async searchSimilar(query, k = 10) {
        if (!this.initialized) {
            return [];
        }
        try {
            const embedding = this.generateEmbedding(query);
            const results = await this.backend.search(embedding, {
                k
            });
            return results.map((r)=>r.metadata).filter((d)=>d && d._type === 'truth_score');
        } catch (error) {
            console.error(`[TruthDBAdapter] Search failed:`, error.message);
            return [];
        }
    }
    async getStats() {
        if (!this.initialized) {
            return {
                initialized: false,
                error: 'Not initialized'
            };
        }
        try {
            const stats = await this.backend.getStats();
            return {
                initialized: true,
                vectorCount: stats.vectorCount,
                dbPath: '.agentdb/truth-scores.db'
            };
        } catch (error) {
            return {
                initialized: true,
                error: error.message
            };
        }
    }
    async close() {
        if (this.initialized) {
            await this.backend.close();
            this.initialized = false;
        }
    }
    generateEmbedding(doc) {
        const embedding = new Array(128).fill(0);
        embedding[0] = doc.accuracyScore ?? 0;
        embedding[1] = doc.confidenceScore ?? 0;
        embedding[2] = doc.passed ? 1 : 0;
        embedding[3] = Math.min((doc.errorCount ?? 0) / 10, 1);
        embedding[4] = Math.min((doc.checksPassed?.length ?? 0) / 20, 1);
        embedding[5] = Math.min((doc.checksFailed?.length ?? 0) / 20, 1);
        const timestamp = doc.timestamp ?? Date.now();
        const dayNorm = timestamp % 86400000 / 86400000;
        embedding[16] = dayNorm;
        embedding[17] = Math.sin(dayNorm * 2 * Math.PI);
        embedding[18] = Math.cos(dayNorm * 2 * Math.PI);
        const phases = [
            'pre-task',
            'execution',
            'post-task',
            'validation',
            'complete',
            'failed'
        ];
        const phaseIndex = phases.indexOf(doc.phase ?? 'pre-task');
        if (phaseIndex >= 0 && phaseIndex < 16) {
            embedding[32 + phaseIndex] = 1;
        }
        if (doc.taskId) {
            const hash = this.hashString(doc.taskId);
            for(let i = 0; i < 16; i++){
                embedding[48 + i] = hash >> i & 1 ? 0.5 : -0.5;
            }
        }
        if (doc.sessionId) {
            const hash = this.hashString(doc.sessionId);
            for(let i = 0; i < 16; i++){
                embedding[64 + i] = hash >> i & 1 ? 0.5 : -0.5;
            }
        }
        return embedding;
    }
    generateSnapshotEmbedding(snapshot) {
        const embedding = new Array(128).fill(0);
        const timestamp = snapshot.timestamp ?? Date.now();
        embedding[0] = timestamp % 86400000 / 86400000;
        const phases = [
            'pre-task',
            'execution',
            'post-task',
            'validation',
            'complete',
            'failed'
        ];
        const phaseIndex = phases.indexOf(snapshot.phase ?? 'pre-task');
        if (phaseIndex >= 0 && phaseIndex < 16) {
            embedding[32 + phaseIndex] = 1;
        }
        if (snapshot.taskId) {
            const hash = this.hashString(snapshot.taskId);
            for(let i = 0; i < 16; i++){
                embedding[48 + i] = hash >> i & 1 ? 0.5 : -0.5;
            }
        }
        if (snapshot.snapshotId) {
            const hash = this.hashString(snapshot.snapshotId);
            for(let i = 0; i < 16; i++){
                embedding[80 + i] = hash >> i & 1 ? 0.5 : -0.5;
            }
        }
        return embedding;
    }
    hashString(str) {
        let hash = 0;
        for(let i = 0; i < str.length; i++){
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
}
export const truthDBAdapter = new TruthDBAdapter();

//# sourceMappingURL=truth-db-adapter.js.map