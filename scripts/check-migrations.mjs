import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const files = (await readdir('supabase/migrations')).sort();
const seen = new Set();
for (const file of files) {
  assert.match(file, /^\d{14}_be[12]_[a-z0-9_]+\.sql$/, `Invalid migration name: ${file}`);
  const timestamp = file.slice(0, 14);
  assert.ok(!seen.has(timestamp), `Duplicate migration timestamp: ${timestamp}`);
  seen.add(timestamp);
  const content = await readFile(`supabase/migrations/${file}`, 'utf8');
  const statements = content.replace(/^(?:\s|--[^\n]*(?:\n|$))*/, '');
  assert.match(statements, /^begin;/i, `${file}: migration must be transactional`);
  assert.match(content.trim(), /commit;$/i, `${file}: missing transaction commit`);
  assert.ok(!content.includes('tests/bootstrap.sql'), 'Test bootstrap cannot be a migration');
}
console.log(`PASS ${files.length} migration names, unique ordering and transaction boundaries`);
