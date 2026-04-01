import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadNodeEnv } from '@scrumbun/config';

loadNodeEnv();

const currentFilePath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(currentFilePath), '..');
const prismaArgs = process.argv.slice(2);
const pnpmCommand = 'pnpm';
const isDbPushWithoutReset =
  prismaArgs[0] === 'db' &&
  prismaArgs[1] === 'push' &&
  !prismaArgs.includes('--force-reset');

console.info('[FIX][packages/db/prisma-command] Running Prisma command with local .env', {
  prismaArgs,
  packageRoot
});

const child = spawn(pnpmCommand, ['exec', 'prisma', ...prismaArgs], {
  cwd: packageRoot,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32'
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error('[FIX][packages/db/prisma-command] Prisma command terminated', {
      signal
    });
    process.exitCode = 1;
    return;
  }

  if ((code ?? 1) !== 0 && isDbPushWithoutReset) {
    console.error(
      '[FIX][packages/db/prisma-command] db push failed. If this database contains the old task-status schema, run `pnpm db:reset` to recreate the local dev schema, then `pnpm db:seed`.'
    );
  }

  process.exitCode = code ?? 1;
});
