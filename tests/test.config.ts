import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';

const TEST_ROOT = path.join(os.tmpdir(), 'claude-flow-tests');
const TEMP_DIR = path.join(TEST_ROOT, 'tmp');
const DATA_DIR = path.join(TEST_ROOT, 'data');
const MEMORY_DIR = path.join(TEST_ROOT, 'memory');

export const TEST_CONFIG = {
  directories: {
    root: TEST_ROOT,
    tmp: TEMP_DIR,
    data: DATA_DIR,
    memory: MEMORY_DIR,
  },
  environment: {
    CLAUDE_FLOW_ENV: 'test',
    NODE_ENV: 'test',
  },
};

async function ensureDirectory(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

export async function setupTestEnv(): Promise<void> {
  await ensureDirectory(TEST_ROOT);
  await Promise.all([
    ensureDirectory(TEMP_DIR),
    ensureDirectory(DATA_DIR),
    ensureDirectory(MEMORY_DIR),
  ]);

  for (const [key, value] of Object.entries(TEST_CONFIG.environment)) {
    process.env[key] = value;
  }
}

export async function cleanupTestEnv(): Promise<void> {
  if (fs.existsSync(TEST_ROOT)) {
    await fsp.rm(TEST_ROOT, { recursive: true, force: true });
  }
}

export function resolveTestPath(...segments: string[]): string {
  return path.join(TEST_ROOT, ...segments);
}
