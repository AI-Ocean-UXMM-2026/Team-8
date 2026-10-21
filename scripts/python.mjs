import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const executable = process.env.PYTHON || (existsSync(local) ? local : process.platform === 'win32' ? 'python' : 'python3');
const result = spawnSync(executable, process.argv.slice(2), { cwd: root, stdio: 'inherit', shell: false });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
