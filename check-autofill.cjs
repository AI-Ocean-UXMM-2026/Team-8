const fs=require('fs'),vm=require('vm'),assert=require('assert');
const handlers=[],toasts=[];
const chain=new Proxy(function(){return chain},{get:(_,key)=>key==='length'?0:key==='on'?(event,selector,fn)=>{handlers.push({event,selector,fn});return chain}:()=>chain});
const context={structuredClone,Date,localStorage:{getItem:()=>null,setItem:()=>{}},orders:[],save(){},render(){},detail(){},role:'sme',document:{},$:()=>chain,note:message=>toasts.push(message)};vm.createContext(context);
for(const file of ['reports.js','rule-catalog.js','rule-engine.js','maker-checker.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8').replace(/render\(\);\s*$/,''),context);
vm.runInContext('render=()=>{};reports=[];',context);
function clickAutofill(){const matched=handlers.filter(h=>h.event==='click'&&h.selector==='#autofillReport');assert.equal(matched.length,2,'original form autofill and review generation handlers');matched.forEach(h=>h.fn.call({}));}
clickAutofill();
vm.runInContext(`globalThis.firstBatch=reports.map(r=>({id:r.id,status:r.status,rules:r.ai.routing.matches.map(x=>x.id),route:r.ai.routing.review}));for(const r of reports){const current=evaluateRules(r,reports);if(current.review!==r.ai.routing.review)throw Error('Stored route differs from business rules');if(r.ai.state!==current.review+' Review')throw Error('Queue differs from evaluated route');if(current.review==='AI'&&current.matches.some(x=>x.review==='Human'))throw Error('Human rule bypassed');}`,context);
assert.equal(context.firstBatch.filter(r=>r.route==='Human').length,5);assert.equal(context.firstBatch.filter(r=>r.route==='AI').length,5);
assert(toasts.at(-1).includes('Human 5 | AI 5'),'First toast must report current totals');
clickAutofill();assert(toasts.at(-1).includes('Human 10 | AI 10'),'Second toast must report cumulative totals');
vm.runInContext(`if(reports.length!==20||new Set(reports.map(r=>r.id)).size!==20)throw Error('Repeated generation IDs/count');`,context);
console.log('PASS: actual Autofill click handlers generate 5 Human + 5 AI each time, business rules agree, no human-rule bypass, unique IDs, toast totals 5/5 then 10/10');
console.log('First batch routing:',JSON.stringify(context.firstBatch.map(r=>({route:r.route,rules:r.rules}))));
