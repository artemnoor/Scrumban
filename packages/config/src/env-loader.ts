import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

let hasLoadedNodeEnv = false;

function findClosestEnvPath(startDirectory: string): string | null {
  let currentDirectory = resolve(startDirectory);

  while (true) {
    const candidate = resolve(currentDirectory, '.env');

    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDirectory = resolve(currentDirectory, '..');

    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

export function loadNodeEnv() {
  if (hasLoadedNodeEnv) {
    return;
  }

  hasLoadedNodeEnv = true;

  const envPath = findClosestEnvPath(process.cwd());

  if (!envPath) {
    console.info('[FIX][config/env-loader] No local .env file found', {
      searchRoot: process.cwd()
    });
    return;
  }

  const result = loadDotenv({
    path: envPath,
    override: true
  });

  if (result.error) {
    console.error('[FIX][config/env-loader] Failed to load local .env file', {
      envPath,
      message: result.error.message
    });
    return;
  }

  console.info('[FIX][config/env-loader] Loaded local .env file with override', {
    envPath
  });
}
