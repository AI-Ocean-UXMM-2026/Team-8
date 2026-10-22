import assert from 'node:assert/strict';
import fs from 'node:fs';
import './prepare-ui.mjs';

// Preserve baseline behavior/assets; the shadcn theme intentionally overrides visuals.
const baseline = fs.readFileSync('dist/index.html', 'utf8').replaceAll('\r\n', '\n');
const read = (file) => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
// Branding is intentionally replaced; preserve the remaining shell contract.
const withoutBrand = html => html.replace(/<a href="(?:#|\/)"[^>]*>.*?<\/a>/s, '');
assert.equal(withoutBrand(read('src/features/workspace/shell.html')), withoutBrand(baseline.match(/<body>(.*?)<script>/s)[1]));
assert.equal(read('src/features/workspace/styles.css'), baseline.match(/<style>(.*?)<\/style>/s)[1]);
// The empty-state illustration adds only a CSS hook; all runtime behavior stays intact.
const runtime = read('src/features/workspace/runtime.js');
const baselineRuntime = baseline.match(/<body>.*?<script>(.*?)<\/script>/s)[1];
const baselineEmptyClass = 'class="text-center muted py-10">No matching orders.';
assert.ok(baselineRuntime.includes(baselineEmptyClass), 'Baseline empty-state markup changed');
assert.equal(runtime, baselineRuntime.replace(baselineEmptyClass, 'class="pc-legacy-empty text-center muted py-10">No matching orders.'));
const features = {
  reports: 'reports', 'rider-map': 'deliveries', 'rule-catalog': 'policies',
  'rule-engine': 'policies', 'rule-controls': 'policies', 'priority-engine': 'priority',
  'priority-controls': 'priority', 'sme-workspace': 'workspace', 'maker-checker': 'exceptions',
};
for (const [name, feature] of Object.entries(features)) {
  assert.equal(read(`src/features/${feature}/${name}.js`), read(`dist/${name}.js`), `${name} behavior changed`);
}
console.log('PASS: baseline markup/styles and feature behavior are preserved beneath the shadcn theme.');
