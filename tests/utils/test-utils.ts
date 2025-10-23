import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { jest } from '@jest/globals';

export const AsyncTestUtils = {
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 50,
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await this.delay(interval);
    }
    throw new Error('Timeout waiting for condition');
  },

  async withTimeout<T>(promise: Promise<T>, timeout: number, message?: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(message ?? `Operation timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  },
};

export const MemoryTestUtils = {
  async checkMemoryLeak<T>(fn: () => Promise<T>): Promise<{ leaked: boolean; delta: number }> {
    global.gc?.();
    const before = process.memoryUsage().heapUsed;
    await fn();
    global.gc?.();
    const after = process.memoryUsage().heapUsed;
    const delta = after - before;
    return { leaked: delta > 1024 * 1024, delta };
  },
};

function calculateStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((acc, value) => acc + value, 0);
  const mean = sum / samples.length;
  const percentile = (p: number) => {
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  };
  return {
    samples,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean,
    median: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
  };
}

export const PerformanceTestUtils = {
  async benchmark<T>(
    fn: () => Promise<T>,
    options: { iterations?: number } = {},
  ): Promise<{ results: T[]; stats: ReturnType<typeof calculateStats> }> {
    const iterations = options.iterations ?? 5;
    const durations: number[] = [];
    const results: T[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      results.push(await fn());
      durations.push(performance.now() - start);
    }

    return { results, stats: calculateStats(durations) };
  },

  async loadTest(
    worker: (index: number) => Promise<unknown>,
    options: { concurrency?: number; iterations?: number } = {},
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
  }> {
    const concurrency = options.concurrency ?? os.cpus().length;
    const iterations = options.iterations ?? concurrency * 5;
    let successful = 0;
    let failed = 0;
    const durations: number[] = [];

    await Promise.all(
      Array.from({ length: iterations }, async (_, index) => {
        const start = performance.now();
        try {
          await worker(index);
          successful += 1;
        } catch {
          failed += 1;
        } finally {
          durations.push(performance.now() - start);
        }
      }),
    );

    const stats = calculateStats(durations);
    return {
      totalRequests: iterations,
      successfulRequests: successful,
      failedRequests: failed,
      averageResponseTime: stats.mean,
    };
  },
};

export const TestAssertions = {
  async assertThrowsAsync(
    fn: () => Promise<unknown>,
    errorCtor?: new (...args: any[]) => Error,
    message?: string,
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      if (errorCtor && !(error instanceof errorCtor)) {
        throw new Error(message ?? `Expected error to be instance of ${errorCtor.name}`);
      }
      return;
    }
    throw new Error(message ?? 'Expected function to throw');
  },

  assertInRange(value: number, min: number, max: number, message?: string): void {
    if (value < min || value > max) {
      throw new Error(message ?? `Value ${value} is not in range [${min}, ${max}]`);
    }
  },

  async assertCompletesWithin(
    fn: () => Promise<unknown>,
    timeout: number,
    message?: string,
  ): Promise<void> {
    await AsyncTestUtils.withTimeout(fn(), timeout, message);
  },
};

export const FileSystemTestUtils = {
  async createTempDir(prefix = 'claude-flow-'): Promise<string> {
    const base = path.join(os.tmpdir(), prefix);
    return await fsp.mkdtemp(base);
  },

  async cleanup(target: string | string[]): Promise<void> {
    const targets = Array.isArray(target) ? target : [target];
    await Promise.all(
      targets.map(async (entry) => {
        if (!entry) return;
        if (fs.existsSync(entry)) {
          await fsp.rm(entry, { recursive: true, force: true });
        }
      }),
    );
  },
};

export const TestDataGenerator = {
  randomString(length = 16): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  },

  largeDataset(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      id: `item-${index}`,
      data: this.randomString(32),
      timestamp: Date.now() + index,
    }));
  },
};

export const MockFactory = {
  createMock<T extends Record<string, any>>(definition: T): T {
    const entries = Object.entries(definition).map(([key, value]) => {
      const fn = jest.fn(value as (...args: any[]) => any);
      Object.defineProperty(fn, 'calls', {
        get() {
          return fn.mock.calls.map((args) => ({ args }));
        },
      });
      return [key, fn];
    });
    return Object.fromEntries(entries) as T;
  },
};
