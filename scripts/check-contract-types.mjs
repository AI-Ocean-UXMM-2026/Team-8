import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import openapiTS, { astToString } from 'openapi-typescript';

const generated = astToString(await openapiTS(new URL('../contracts/openapi.json', import.meta.url)));
// Match openapi-typescript CLI header so committed output can be checked exactly.
const committed = readFileSync(new URL('../contracts/generated/api.d.ts', import.meta.url), 'utf8');
assert.equal(committed.slice(committed.indexOf('export interface paths')), generated.slice(generated.indexOf('export interface paths')), 'Generated DTO drift: npm run contracts:generate');
console.log('PASS generated TypeScript DTO drift');
