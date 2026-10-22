// Public HTTP smoke checks only. This does NOT execute browser JavaScript or GPS.
import assert from 'node:assert/strict';
const base=process.env.PARCELCARE_TEST_URL||'https://parcelcare-team8.onrender.com';
const origin=new URL(base).origin;
async function get(path,status=200){const r=await fetch(origin+path,{signal:AbortSignal.timeout(75000)});assert.equal(r.status,status,`${path}: ${r.status}`);return r;}
for(const path of ['/demo/warehouse/tracking','/demo/sme/tracking','/demo/courier']){
 const r=await get(path);assert.match(r.headers.get('content-type')||'',/text\/html/);const body=await r.text();assert.ok(body.includes('ParcelCare'));
 const scripts=[...body.matchAll(/<script[^>]+src="([^\"]+)"/g)].map(m=>m[1]).filter(p=>p.startsWith('/_next/')&&p.includes('/app/demo/'));
 assert.ok(scripts.length,`${path}: missing route bundle`);for(const asset of scripts)await get(asset);
 console.log('PASS public page and route bundle:',path);
}
const js=await get('/vendor/leaflet.js');assert.ok((await js.text()).includes('Leaflet'));
const css=await get('/vendor/leaflet.css');assert.ok((await css.text()).includes('.leaflet-container'));
const health=await get('/api/health');assert.match(health.headers.get('content-type')||'',/application\/json/);
const tile=await fetch('https://tile.openstreetmap.org/11/1571/926.png',{signal:AbortSignal.timeout(20000)});assert.equal(tile.status,200);assert.match(tile.headers.get('content-type')||'',/image\/png/);
for(const path of ['/api/tracking/10000000-0000-4000-8000-000000000073/live','/api/deliveries/10000000-0000-4000-8000-000000000022/route'])await get(path,401);
console.log('PASS Leaflet assets, one Yangon map tile, health and unauthenticated GPS/route denial.');
console.log('NOT RUN: browser rendering, phone permissions, authenticated routing and cross-account GPS delivery.');
