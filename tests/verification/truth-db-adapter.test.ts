/**
 * TruthDBAdapter Test Suite
 *
 * Comprehensive tests for the TruthDBAdapter persistence layer.
 * Coverage: Initialization, CRUD operations, snapshots, embeddings,
 * concurrency, error scenarios, and performance.
 *
 * @module tests/verification/truth-db-adapter.test
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';

// Mock AgentDBBackend to avoid requiring external database dependencies
const mockStoreVector = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetVector = jest.fn<() => Promise<{ metadata: Record<string, unknown> } | null>>();
const mockDeleteVector = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockSearch = jest.fn<() => Promise<Array<{ metadata: Record<string, unknown> }>>>().mockResolvedValue([]);
const mockGetStats = jest.fn<() => Promise<{ vectorCount: number }>>().mockResolvedValue({ vectorCount: 0 });
const mockInitialize = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/memory/backends/agentdb.js', () => ({
  AgentDBBackend: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    storeVector: mockStoreVector,
    getVector: mockGetVector,
    deleteVector: mockDeleteVector,
    search: mockSearch,
    getStats: mockGetStats,
    close: mockClose
  }))
}));

// Import after mock setup
const { TruthDBAdapter, TruthScoreDocument, SnapshotDocument } = await import('../../src/verification/truth-db-adapter.js');

describe('TruthDBAdapter', () => {
  let adapter: InstanceType<typeof TruthDBAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new TruthDBAdapter();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
  });

  // ========================================
  // INITIALIZATION TESTS (6 tests)
  // ========================================

  describe('Initialization and Graceful Fallback', () => {
    test('should initialize successfully', async () => {
      const result = await adapter.initialize();

      expect(result).toBe(true);
      expect(adapter.isReady()).toBe(true);
      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    test('should return true on multiple initialize calls (idempotent)', async () => {
      await adapter.initialize();
      const secondInit = await adapter.initialize();

      expect(secondInit).toBe(true);
      // Should only call backend initialize once
      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    test('should handle concurrent initialization calls', async () => {
      const results = await Promise.all([
        adapter.initialize(),
        adapter.initialize(),
        adapter.initialize()
      ]);

      // All should succeed
      expect(results.every(r => r === true)).toBe(true);
      // Backend initialize should only be called once
      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    test('should gracefully handle initialization failure', async () => {
      mockInitialize.mockRejectedValueOnce(new Error('DB connection failed'));

      const newAdapter = new TruthDBAdapter();
      const result = await newAdapter.initialize();

      // Should return false but not throw
      expect(result).toBe(false);
      expect(newAdapter.isReady()).toBe(false);
    });

    test('should report not ready before initialization', () => {
      const newAdapter = new TruthDBAdapter();
      expect(newAdapter.isReady()).toBe(false);
    });

    test('should close database connection cleanly', async () => {
      await adapter.initialize();
      await adapter.close();

      expect(adapter.isReady()).toBe(false);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // CONTEXT SAVE/RETRIEVE/DELETE TESTS (8 tests)
  // ========================================

  describe('Context Save/Retrieve/Delete Operations', () => {
    const sampleDocument: TruthScoreDocument = {
      taskId: 'task-001',
      sessionId: 'session-001',
      timestamp: Date.now(),
      phase: 'validation',
      accuracyScore: 0.95,
      confidenceScore: 0.88,
      passed: true,
      checksPassed: ['syntax', 'logic', 'format'],
      checksFailed: [],
      errorCount: 0,
      metadata: { environment: 'test' }
    };

    test('should save context successfully', async () => {
      await adapter.initialize();
      await adapter.saveContext('task-001', sampleDocument);

      expect(mockStoreVector).toHaveBeenCalledTimes(1);
      expect(mockStoreVector).toHaveBeenCalledWith(
        'truth:task-001',
        expect.any(Array),
        expect.objectContaining({
          ...sampleDocument,
          _type: 'truth_score',
          _storedAt: expect.any(Number),
          _version: 1
        })
      );
    });

    test('should auto-initialize when saving context if not initialized', async () => {
      await adapter.saveContext('task-002', sampleDocument);

      expect(mockInitialize).toHaveBeenCalledTimes(1);
      expect(mockStoreVector).toHaveBeenCalledTimes(1);
    });

    test('should retrieve context successfully', async () => {
      mockGetVector.mockResolvedValueOnce({
        metadata: sampleDocument
      });

      await adapter.initialize();
      const result = await adapter.getContext('task-001');

      expect(mockGetVector).toHaveBeenCalledWith('truth:task-001');
      expect(result).toEqual(sampleDocument);
    });

    test('should return null for non-existent context', async () => {
      mockGetVector.mockResolvedValueOnce(null);

      await adapter.initialize();
      const result = await adapter.getContext('non-existent');

      expect(result).toBeNull();
    });

    test('should delete context successfully', async () => {
      await adapter.initialize();
      const result = await adapter.deleteContext('task-001');

      expect(result).toBe(true);
      expect(mockDeleteVector).toHaveBeenCalledWith('truth:task-001');
    });

    test('should return false when deleting without initialization', async () => {
      const newAdapter = new TruthDBAdapter();
      const result = await newAdapter.deleteContext('task-001');

      expect(result).toBe(false);
      expect(mockDeleteVector).not.toHaveBeenCalled();
    });

    test('should handle save errors gracefully', async () => {
      mockStoreVector.mockRejectedValueOnce(new Error('Storage failed'));

      await adapter.initialize();

      await expect(adapter.saveContext('task-error', sampleDocument)).rejects.toThrow('Storage failed');
    });

    test('should skip save when not initialized and initialization fails', async () => {
      mockInitialize.mockRejectedValueOnce(new Error('Init failed'));

      const newAdapter = new TruthDBAdapter();
      // Should not throw, just skip
      await newAdapter.saveContext('task-skip', sampleDocument);

      expect(mockStoreVector).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // SNAPSHOT SAVE/RETRIEVE TESTS (6 tests)
  // ========================================

  describe('Snapshot Save/Retrieve Operations', () => {
    const sampleSnapshot: SnapshotDocument = {
      snapshotId: 'snap-001',
      taskId: 'task-001',
      timestamp: Date.now(),
      phase: 'pre-task',
      state: { variables: { count: 0 }, config: {} },
      metadata: { reason: 'initial' }
    };

    test('should save snapshot successfully', async () => {
      await adapter.initialize();
      await adapter.saveSnapshot('task-001', sampleSnapshot);

      expect(mockStoreVector).toHaveBeenCalledTimes(1);
      expect(mockStoreVector).toHaveBeenCalledWith(
        'snapshot:task-001:snap-001',
        expect.any(Array),
        expect.objectContaining({
          ...sampleSnapshot,
          _type: 'snapshot',
          _storedAt: expect.any(Number)
        })
      );
    });

    test('should auto-initialize when saving snapshot', async () => {
      await adapter.saveSnapshot('task-002', sampleSnapshot);

      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    test('should skip snapshot save when not initialized', async () => {
      mockInitialize.mockRejectedValueOnce(new Error('Init failed'));

      const newAdapter = new TruthDBAdapter();
      await newAdapter.saveSnapshot('task-001', sampleSnapshot);

      expect(mockStoreVector).not.toHaveBeenCalled();
    });

    test('should retrieve snapshots for a task', async () => {
      const snapshots = [
        { snapshotId: 'snap-001', taskId: 'task-001', timestamp: 1000, phase: 'pre-task', state: {}, metadata: {} },
        { snapshotId: 'snap-002', taskId: 'task-001', timestamp: 2000, phase: 'execution', state: {}, metadata: {} }
      ];

      mockSearch.mockResolvedValueOnce(
        snapshots.map(s => ({ metadata: s }))
      );

      await adapter.initialize();
      const result = await adapter.getSnapshots('task-001');

      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      // Should be sorted by timestamp
      expect(result[0].timestamp).toBeLessThan(result[1].timestamp);
    });

    test('should return empty array when not initialized', async () => {
      const newAdapter = new TruthDBAdapter();
      const result = await newAdapter.getSnapshots('task-001');

      expect(result).toEqual([]);
      expect(mockSearch).not.toHaveBeenCalled();
    });

    test('should handle snapshot retrieval errors gracefully', async () => {
      mockSearch.mockRejectedValueOnce(new Error('Search failed'));

      await adapter.initialize();
      const result = await adapter.getSnapshots('task-error');

      expect(result).toEqual([]);
    });
  });

  // ========================================
  // EMBEDDING GENERATION TESTS (6 tests)
  // ========================================

  describe('Embedding Generation Consistency', () => {
    test('should generate 128-dimensional embeddings for truth scores', async () => {
      await adapter.initialize();

      const document: TruthScoreDocument = {
        taskId: 'task-embed-001',
        sessionId: 'session-001',
        timestamp: Date.now(),
        phase: 'validation',
        accuracyScore: 0.9,
        confidenceScore: 0.85,
        passed: true,
        checksPassed: ['check1'],
        checksFailed: [],
        errorCount: 0,
        metadata: {}
      };

      await adapter.saveContext('task-embed-001', document);

      // Verify embedding was passed to storeVector
      const storedEmbedding = mockStoreVector.mock.calls[0][1];
      expect(storedEmbedding).toHaveLength(128);
      expect(storedEmbedding.every((v: number) => typeof v === 'number')).toBe(true);
    });

    test('should generate consistent embeddings for same document', async () => {
      await adapter.initialize();

      const document: TruthScoreDocument = {
        taskId: 'task-consistent',
        sessionId: 'session-001',
        timestamp: 1234567890,
        phase: 'validation',
        accuracyScore: 0.9,
        confidenceScore: 0.85,
        passed: true,
        checksPassed: ['check1'],
        checksFailed: [],
        errorCount: 0,
        metadata: {}
      };

      // Save twice with same document
      await adapter.saveContext('test1', document);
      await adapter.saveContext('test2', document);

      const embedding1 = mockStoreVector.mock.calls[0][1];
      const embedding2 = mockStoreVector.mock.calls[1][1];

      // Embeddings should be identical for same input
      expect(embedding1).toEqual(embedding2);
    });

    test('should encode accuracy and confidence scores in embedding', async () => {
      await adapter.initialize();

      const lowScoreDoc: TruthScoreDocument = {
        taskId: 'low',
        sessionId: 'session-001',
        timestamp: Date.now(),
        phase: 'validation',
        accuracyScore: 0.1,
        confidenceScore: 0.1,
        passed: false,
        checksPassed: [],
        checksFailed: ['check1'],
        errorCount: 5,
        metadata: {}
      };

      const highScoreDoc: TruthScoreDocument = {
        taskId: 'high',
        sessionId: 'session-001',
        timestamp: Date.now(),
        phase: 'validation',
        accuracyScore: 1.0,
        confidenceScore: 1.0,
        passed: true,
        checksPassed: ['check1'],
        checksFailed: [],
        errorCount: 0,
        metadata: {}
      };

      await adapter.saveContext('low', lowScoreDoc);
      await adapter.saveContext('high', highScoreDoc);

      const lowEmbedding = mockStoreVector.mock.calls[0][1];
      const highEmbedding = mockStoreVector.mock.calls[1][1];

      // Accuracy score should be in first dimension
      expect(lowEmbedding[0]).toBe(0.1);
      expect(highEmbedding[0]).toBe(1.0);

      // Confidence score should be in second dimension
      expect(lowEmbedding[1]).toBe(0.1);
      expect(highEmbedding[1]).toBe(1.0);
    });

    test('should encode phase correctly in embedding', async () => {
      await adapter.initialize();

      const phases = ['pre-task', 'execution', 'post-task', 'validation', 'complete', 'failed'];

      for (const phase of phases) {
        const doc: TruthScoreDocument = {
          taskId: `task-${phase}`,
          sessionId: 'session-001',
          timestamp: Date.now(),
          phase,
          accuracyScore: 0.5,
          confidenceScore: 0.5,
          passed: true,
          checksPassed: [],
          checksFailed: [],
          errorCount: 0,
          metadata: {}
        };
        await adapter.saveContext(`task-${phase}`, doc);
      }

      // Each phase should have different encoding in dims 32-47
      const embeddings = mockStoreVector.mock.calls.map(call => call[1]);
      const phaseEncodings = embeddings.map((e: number[]) => e.slice(32, 48));

      // Verify unique encodings
      for (let i = 0; i < phases.length; i++) {
        for (let j = i + 1; j < phases.length; j++) {
          expect(phaseEncodings[i]).not.toEqual(phaseEncodings[j]);
        }
      }
    });

    test('should generate 128-dimensional embeddings for snapshots', async () => {
      await adapter.initialize();

      const snapshot: SnapshotDocument = {
        snapshotId: 'snap-embed-001',
        taskId: 'task-001',
        timestamp: Date.now(),
        phase: 'execution',
        state: { data: 'test' },
        metadata: {}
      };

      await adapter.saveSnapshot('task-001', snapshot);

      const storedEmbedding = mockStoreVector.mock.calls[0][1];
      expect(storedEmbedding).toHaveLength(128);
    });

    test('should hash task and session IDs consistently', async () => {
      await adapter.initialize();

      const doc1: TruthScoreDocument = {
        taskId: 'same-task-id',
        sessionId: 'same-session-id',
        timestamp: 1000,
        phase: 'validation',
        accuracyScore: 0.5,
        confidenceScore: 0.5,
        passed: true,
        checksPassed: [],
        checksFailed: [],
        errorCount: 0,
        metadata: {}
      };

      const doc2: TruthScoreDocument = {
        ...doc1,
        timestamp: 2000 // Different timestamp
      };

      await adapter.saveContext('test1', doc1);
      await adapter.saveContext('test2', doc2);

      const embedding1 = mockStoreVector.mock.calls[0][1];
      const embedding2 = mockStoreVector.mock.calls[1][1];

      // Task ID hash (dims 48-63) should be the same
      expect(embedding1.slice(48, 64)).toEqual(embedding2.slice(48, 64));

      // Session ID hash (dims 64-79) should be the same
      expect(embedding1.slice(64, 80)).toEqual(embedding2.slice(64, 80));
    });
  });

  // ========================================
  // CONCURRENT ACCESS TESTS (5 tests)
  // ========================================

  describe('Concurrent Access Handling', () => {
    test('should handle concurrent saves without errors', async () => {
      await adapter.initialize();

      const documents = Array.from({ length: 10 }, (_, i) => ({
        taskId: `concurrent-${i}`,
        sessionId: 'session-001',
        timestamp: Date.now(),
        phase: 'validation' as const,
        accuracyScore: Math.random(),
        confidenceScore: Math.random(),
        passed: true,
        checksPassed: [],
        checksFailed: [],
        errorCount: 0,
        metadata: {}
      }));

      const savePromises = documents.map(doc =>
        adapter.saveContext(doc.taskId, doc)
      );

      await expect(Promise.all(savePromises)).resolves.not.toThrow();
      expect(mockStoreVector).toHaveBeenCalledTimes(10);
    });

    test('should handle concurrent reads without errors', async () => {
      mockGetVector.mockResolvedValue({ metadata: { taskId: 'test' } });

      await adapter.initialize();

      const readPromises = Array.from({ length: 10 }, (_, i) =>
        adapter.getContext(`task-${i}`)
      );

      const results = await Promise.all(readPromises);
      expect(results).toHaveLength(10);
      expect(mockGetVector).toHaveBeenCalledTimes(10);
    });

    test('should handle concurrent mixed operations', async () => {
      mockGetVector.mockResolvedValue({ metadata: { taskId: 'test' } });

      await adapter.initialize();

      const operations = [
        adapter.saveContext('write-1', {
          taskId: 'write-1',
          sessionId: 's1',
          timestamp: Date.now(),
          phase: 'validation',
          accuracyScore: 0.9,
          confidenceScore: 0.9,
          passed: true,
          checksPassed: [],
          checksFailed: [],
          errorCount: 0,
          metadata: {}
        }),
        adapter.getContext('read-1'),
        adapter.deleteContext('delete-1'),
        adapter.saveSnapshot('snap-1', {
          snapshotId: 'snap-1',
          taskId: 'task-1',
          timestamp: Date.now(),
          phase: 'execution',
          state: {},
          metadata: {}
        }),
        adapter.getSnapshots('task-1')
      ];

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });

    test('should handle rapid successive initialization attempts', async () => {
      const initPromises = [];
      for (let i = 0; i < 5; i++) {
        initPromises.push(adapter.initialize());
      }

      const results = await Promise.all(initPromises);

      expect(results.every(r => r === true)).toBe(true);
      // Should only actually initialize once
      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    test('should maintain data integrity under concurrent load', async () => {
      await adapter.initialize();

      const taskIds = ['task-a', 'task-b', 'task-c', 'task-d', 'task-e'];

      // Concurrent writes
      await Promise.all(taskIds.map(taskId =>
        adapter.saveContext(taskId, {
          taskId,
          sessionId: 'session-001',
          timestamp: Date.now(),
          phase: 'validation',
          accuracyScore: 0.8,
          confidenceScore: 0.8,
          passed: true,
          checksPassed: [],
          checksFailed: [],
          errorCount: 0,
          metadata: { unique: taskId }
        })
      ));

      // Verify all writes completed
      expect(mockStoreVector).toHaveBeenCalledTimes(5);

      // Verify unique keys used
      const keys = mockStoreVector.mock.calls.map(call => call[0]);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(5);
    });
  });

  // ========================================
  // ERROR SCENARIOS TESTS (8 tests)
  // ========================================

  describe('Error Scenarios', () => {
    test('should handle DB unavailable during getContext', async () => {
      mockGetVector.mockRejectedValueOnce(new Error('Connection refused'));

      await adapter.initialize();
      const result = await adapter.getContext('task-error');

      expect(result).toBeNull();
    });

    test('should handle DB unavailable during deleteContext', async () => {
      mockDeleteVector.mockRejectedValueOnce(new Error('Connection refused'));

      await adapter.initialize();
      const result = await adapter.deleteContext('task-error');

      expect(result).toBe(false);
    });

    test('should handle DB unavailable during getSnapshots', async () => {
      mockSearch.mockRejectedValueOnce(new Error('Connection refused'));

      await adapter.initialize();
      const result = await adapter.getSnapshots('task-error');

      expect(result).toEqual([]);
    });

    test('should handle malformed metadata on getContext', async () => {
      mockGetVector.mockResolvedValueOnce({
        metadata: null
      });

      await adapter.initialize();
      const result = await adapter.getContext('malformed');

      expect(result).toBeNull();
    });

    test('should handle empty search results for snapshots', async () => {
      mockSearch.mockResolvedValueOnce([]);

      await adapter.initialize();
      const result = await adapter.getSnapshots('empty-task');

      expect(result).toEqual([]);
    });

    test('should filter invalid snapshots from search results', async () => {
      mockSearch.mockResolvedValueOnce([
        { metadata: { snapshotId: 'valid', taskId: 'task-1', timestamp: 1000, phase: 'pre-task', state: {}, metadata: {} } },
        { metadata: { taskId: 'missing-snapshot-id' } }, // Missing snapshotId
        { metadata: null }, // Null metadata
        { metadata: { snapshotId: 'valid2', taskId: 'task-1', timestamp: 2000, phase: 'execution', state: {}, metadata: {} } }
      ]);

      await adapter.initialize();
      const result = await adapter.getSnapshots('task-1');

      expect(result).toHaveLength(2);
      expect(result[0].snapshotId).toBe('valid');
      expect(result[1].snapshotId).toBe('valid2');
    });

    test('should handle getStats when not initialized', async () => {
      const newAdapter = new TruthDBAdapter();
      const stats = await newAdapter.getStats();

      expect(stats.initialized).toBe(false);
      expect(stats.error).toBe('Not initialized');
    });

    test('should handle getStats errors gracefully', async () => {
      mockGetStats.mockRejectedValueOnce(new Error('Stats failed'));

      await adapter.initialize();
      const stats = await adapter.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.error).toBe('Stats failed');
    });
  });

  // ========================================
  // SEARCH FUNCTIONALITY TESTS (4 tests)
  // ========================================

  describe('Search Functionality', () => {
    test('should search similar contexts', async () => {
      const mockResults = [
        { metadata: { taskId: 'similar-1', _type: 'truth_score', accuracyScore: 0.9 } },
        { metadata: { taskId: 'similar-2', _type: 'truth_score', accuracyScore: 0.85 } }
      ];
      mockSearch.mockResolvedValueOnce(mockResults);

      await adapter.initialize();
      const results = await adapter.searchSimilar({ accuracyScore: 0.9 }, 5);

      expect(mockSearch).toHaveBeenCalledWith(
        expect.any(Array),
        { k: 5 }
      );
      expect(results).toHaveLength(2);
    });

    test('should return empty array when not initialized', async () => {
      const newAdapter = new TruthDBAdapter();
      const results = await newAdapter.searchSimilar({ accuracyScore: 0.9 });

      expect(results).toEqual([]);
    });

    test('should filter search results by type', async () => {
      const mockResults = [
        { metadata: { taskId: 'context-1', _type: 'truth_score' } },
        { metadata: { snapshotId: 'snap-1', _type: 'snapshot' } }, // Should be filtered
        { metadata: { taskId: 'context-2', _type: 'truth_score' } }
      ];
      mockSearch.mockResolvedValueOnce(mockResults);

      await adapter.initialize();
      const results = await adapter.searchSimilar({});

      expect(results).toHaveLength(2);
      expect(results.every(r => r._type === 'truth_score')).toBe(true);
    });

    test('should handle search errors gracefully', async () => {
      mockSearch.mockRejectedValueOnce(new Error('Search failed'));

      await adapter.initialize();
      const results = await adapter.searchSimilar({ accuracyScore: 0.9 });

      expect(results).toEqual([]);
    });
  });

  // ========================================
  // STATS TESTS (3 tests)
  // ========================================

  describe('Database Statistics', () => {
    test('should return stats when initialized', async () => {
      mockGetStats.mockResolvedValueOnce({ vectorCount: 100 });

      await adapter.initialize();
      const stats = await adapter.getStats();

      expect(stats.initialized).toBe(true);
      expect(stats.vectorCount).toBe(100);
      expect(stats.dbPath).toBe('.agentdb/truth-scores.db');
    });

    test('should return not initialized status before init', async () => {
      const newAdapter = new TruthDBAdapter();
      const stats = await newAdapter.getStats();

      expect(stats.initialized).toBe(false);
    });

    test('should include db path in stats', async () => {
      mockGetStats.mockResolvedValueOnce({ vectorCount: 0 });

      await adapter.initialize();
      const stats = await adapter.getStats();

      expect(stats.dbPath).toBe('.agentdb/truth-scores.db');
    });
  });
});

// ========================================
// PERFORMANCE TESTS (Separate describe block)
// ========================================

describe('TruthDBAdapter Performance', () => {
  let adapter: InstanceType<typeof TruthDBAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new TruthDBAdapter();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.close();
    }
  });

  test('should generate embeddings quickly for large datasets', async () => {
    await adapter.initialize();

    const iterations = 100;
    const documents = Array.from({ length: iterations }, (_, i) => ({
      taskId: `perf-${i}`,
      sessionId: 'session-001',
      timestamp: Date.now(),
      phase: 'validation' as const,
      accuracyScore: Math.random(),
      confidenceScore: Math.random(),
      passed: Math.random() > 0.5,
      checksPassed: ['check1', 'check2', 'check3'],
      checksFailed: [],
      errorCount: Math.floor(Math.random() * 5),
      metadata: { index: i }
    }));

    const startTime = Date.now();

    for (const doc of documents) {
      await adapter.saveContext(doc.taskId, doc);
    }

    const duration = Date.now() - startTime;
    const avgPerDoc = duration / iterations;

    console.log(`Performance: ${iterations} documents in ${duration}ms (${avgPerDoc.toFixed(2)}ms/doc)`);

    // Should complete within reasonable time
    expect(duration).toBeLessThan(5000); // 5 seconds for 100 docs
  });

  test('should handle large metadata payloads', async () => {
    await adapter.initialize();

    const largeMetadata: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      largeMetadata[`key_${i}`] = `value_${i}_${'x'.repeat(100)}`;
    }

    const document: TruthScoreDocument = {
      taskId: 'large-payload',
      sessionId: 'session-001',
      timestamp: Date.now(),
      phase: 'validation',
      accuracyScore: 0.9,
      confidenceScore: 0.9,
      passed: true,
      checksPassed: Array.from({ length: 50 }, (_, i) => `check_${i}`),
      checksFailed: Array.from({ length: 50 }, (_, i) => `failed_check_${i}`),
      errorCount: 50,
      metadata: largeMetadata
    };

    const startTime = Date.now();
    await adapter.saveContext('large-payload', document);
    const duration = Date.now() - startTime;

    console.log(`Large payload save: ${duration}ms`);

    expect(mockStoreVector).toHaveBeenCalledTimes(1);
    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });

  test('should maintain consistent embedding generation time', async () => {
    await adapter.initialize();

    const times: number[] = [];

    for (let i = 0; i < 50; i++) {
      const startTime = Date.now();

      await adapter.saveContext(`timing-${i}`, {
        taskId: `timing-${i}`,
        sessionId: 'session-001',
        timestamp: Date.now(),
        phase: 'validation',
        accuracyScore: Math.random(),
        confidenceScore: Math.random(),
        passed: true,
        checksPassed: [],
        checksFailed: [],
        errorCount: 0,
        metadata: {}
      });

      times.push(Date.now() - startTime);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    const variance = maxTime - minTime;

    console.log(`Timing stats: avg=${avgTime.toFixed(2)}ms, min=${minTime}ms, max=${maxTime}ms, variance=${variance}ms`);

    // Variance should be relatively low (no outliers)
    expect(variance).toBeLessThan(100); // Within 100ms variance
  });
});
