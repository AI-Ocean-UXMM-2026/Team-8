import assert from 'node:assert/strict';
import fs from 'node:fs';
import './prepare-ui.mjs';

// Independent preserved baseline protects the explicit unchanged-interface contract.
const baseline = fs.readFileSync('dist/index.html', 'utf8');
const read = (file) => fs.readFileSync(file, 'utf8');
assert.equal(read('src/features/workspace/shell.html'), baseline.match(/<body>(.*?)<script>/s)[1]);
assert.equal(read('src/features/workspace/styles.css'), baseline.match(/<style>(.*?)<\/style>/s)[1]);
assert.equal(read('src/features/workspace/runtime.js'), baseline.match(/<body>.*?<script>(.*?)<\/script>/s)[1]);
const features = {
  reports: 'reports', 'rider-map': 'deliveries', 'rule-catalog': 'policies',
  'rule-engine': 'policies', 'rule-controls': 'policies', 'priority-engine': 'priority',
  'priority-controls': 'priority', 'sme-workspace': 'workspace', 'maker-checker': 'exceptions',
};
for (const [name, feature] of Object.entries(features)) {
  assert.equal(read(`src/features/${feature}/${name}.js`), read(`dist/${name}.js`), `${name} behavior changed`);
}
console.log('PASS: migrated markup, styles, and feature behavior match the preserved prototype.');
