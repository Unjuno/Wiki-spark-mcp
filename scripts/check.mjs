import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const scan = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (entry.name.endsWith('.mjs')) {
      const check = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (check.status !== 0) process.exit(check.status ?? 1);
    }
  }
};
for (const dir of ['src', 'test', 'scripts']) await scan(dir);
console.log('Syntax checks passed.');
