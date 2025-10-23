/**
 * Shared test utilities for the Claude-Flow repository.
 *
 * The goal of this module is to provide a small set of helpers that mimic
 * the behaviour that the higher level tests expect while keeping the
 * implementation lightweight.  Most of the tests in this repository are
 * currently scaffolding, so these helpers intentionally focus on
 * predictability and ergonomics rather than absolute performance.
 */

import {
  describe,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  expect as jestExpect,
  jest,
} from '@jest/globals';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  jestExpect(actual).toEqual(expected);
}

export function assertExists<T>(value: T, message?: string): void {
  jestExpect(value, message ?? 'Expected value to be defined').toBeDefined();
}

export async function assertRejects<T extends Error>(
  action: Promise<unknown> | (() => Promise<unknown>),
  expectedError?: new (...args: any[]) => T,
  message?: string,
): Promise<void> {
  const runner = typeof action === 'function' ? action() : action;
  if (expectedError) {
    await jestExpect(runner).rejects.toBeInstanceOf(expectedError);
  } else {
    await jestExpect(runner).rejects.toThrow();
  }
}

export function assertThrows<T extends Error>(
  fn: () => unknown,
  expectedError?: new (...args: any[]) => T,
  message?: string,
): void {
  if (expectedError) {
    jestExpect(fn).toThrow(expectedError);
  } else {
    jestExpect(fn).toThrow();
  }
}

export function assertStringIncludes(value: string, substring: string, message?: string): void {
  jestExpect(value, message ?? `Expected "${value}" to include "${substring}"`).toContain(substring);
}

// Re-export Jest testing utilities so the test suites can continue to import
// everything from a single module.
export {
  describe,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  jest,
};

// Provide an expectation helper that preserves the default expect behaviour
// while allowing us to extend it in the future.
export const expect = jestExpect;

// ---------------------------------------------------------------------------
// Spy helpers
// ---------------------------------------------------------------------------

function enhanceMock<T extends jest.Mock>(mockFn: T): T & { calls: Array<{ args: unknown[] }> } {
  Object.defineProperty(mockFn, 'calls', {
    configurable: true,
    enumerable: false,
    get() {
      return mockFn.mock.calls.map((args) => ({ args }));
    },
  });
  return mockFn as T & { calls: Array<{ args: unknown[] }> };
}

export const spy = (...args: Parameters<typeof jest.fn>) => enhanceMock(jest.fn(...args));
export const stub = (...args: Parameters<typeof jest.fn>) => enhanceMock(jest.fn(...args));

export function assertSpyCall(mockFn: jest.Mock, callIndex: number, expectedArgs?: any[]): void {
  const calls = (mockFn as any).calls ?? mockFn.mock.calls.map((args: unknown[]) => ({ args }));
  const call = calls[callIndex];
  jestExpect(call).toBeDefined();
  if (expectedArgs) {
    jestExpect(call.args ?? call).toEqual(expectedArgs);
  }
}

export function assertSpyCalls(mockFn: jest.Mock, expectedCalls: number): void {
  jestExpect(mockFn.mock.calls.length).toBe(expectedCalls);
}

// ---------------------------------------------------------------------------
// Fake time controller
// ---------------------------------------------------------------------------

export class FakeTime {
  private originalNow = Date.now;
  private now: number;

  constructor(initialTime?: number | Date) {
    this.now = initialTime instanceof Date ? initialTime.getTime() : initialTime ?? Date.now();
    Date.now = () => this.now;
  }

  tick(ms: number): void {
    this.now += ms;
  }

  restore(): void {
    Date.now = this.originalNow;
  }
}

// ---------------------------------------------------------------------------
// Fixtures & asynchronous helpers
// ---------------------------------------------------------------------------

export function createFixture<T>(factory: () => T): {
  get(): T;
  reset(): void;
} {
  let instance: T | undefined;
  return {
    get(): T {
      if (instance === undefined) {
        instance = factory();
      }
      return instance;
    },
    reset(): void {
      instance = undefined;
    },
  };
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 50;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for condition');
}

export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function captureConsole(): {
  getOutput(): string[];
  getErrors(): string[];
  restore(): void;
} {
  const output: string[] = [];
  const errors: string[] = [];

  const original = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  console.log = (...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  };
  console.info = (...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  };
  console.debug = (...args: unknown[]) => {
    output.push(args.map(String).join(' '));
  };

  return {
    getOutput: () => [...output],
    getErrors: () => [...errors],
    restore: () => {
      console.log = original.log;
      console.error = original.error;
      console.warn = original.warn;
      console.info = original.info;
      console.debug = original.debug;
    },
  };
}

export async function createTestFile(filePath: string, content: string): Promise<string> {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'claude-flow-'));
  const fullPath = path.join(tempDir, filePath);
  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, content, 'utf8');
  return fullPath;
}

export function runCommand(
  args: string[],
  options: { stdin?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['src/cli/main.ts', ...args], {
      stdio: 'pipe',
      env: { ...process.env, ...options.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    child.on('error', reject);

    if (options.stdin) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Structured test data builders
// ---------------------------------------------------------------------------

export class TestDataBuilder {
  static agentProfile(overrides: Record<string, unknown> = {}) {
    return {
      id: 'agent-1',
      name: 'Test Agent',
      type: 'general',
      capabilities: ['research', 'code'],
      systemPrompt: 'You are a helpful assistant.',
      maxConcurrentTasks: 5,
      priority: 10,
      environment: {},
      workingDirectory: '/tmp',
      shell: '/bin/bash',
      metadata: {},
      ...overrides,
    };
  }

  static task(overrides: Record<string, unknown> = {}) {
    return {
      id: 'task-1',
      type: 'generic',
      description: 'Test task',
      priority: 50,
      dependencies: [],
      status: 'pending',
      input: {},
      createdAt: new Date(),
      metadata: {},
      ...overrides,
    };
  }

  static config(overrides: Record<string, unknown> = {}) {
    const base = {
      orchestrator: {
        maxConcurrentAgents: 5,
        taskQueueSize: 100,
        healthCheckInterval: 30000,
        shutdownTimeout: 30000,
        metricsInterval: 60000,
        persistSessions: false,
        dataDir: './tests/tmp/data',
      },
      terminal: {
        type: 'native',
        poolSize: 5,
        recycleAfter: 10,
        healthCheckInterval: 60000,
        commandTimeout: 300000,
      },
      memory: {
        backend: 'sqlite',
        cacheSizeMB: 10,
        syncInterval: 5000,
        retentionDays: 1,
        sqlitePath: ':memory:',
        markdownDir: './tests/tmp/memory',
      },
      coordination: {
        maxRetries: 3,
        retryDelay: 100,
        deadlockDetection: true,
        resourceTimeout: 60000,
        messageTimeout: 30000,
      },
      mcp: {
        transport: 'stdio',
        port: 8081,
        tlsEnabled: false,
      },
      logging: {
        level: 'error',
        format: 'json',
        destination: 'console',
      },
    };
    return {
      ...base,
      ...overrides,
    };
  }
}

// Export Node's assert for the few tests that still rely on it directly.
export { assert };
