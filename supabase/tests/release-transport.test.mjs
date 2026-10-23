import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {testWorkflows} from './workflows.test.mjs';
const db=new PGlite();
try{
 await db.exec(await readFile(new URL('./bootstrap.sql',import.meta.url),'utf8'));
 const dir=new URL('../migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
 await db.exec(await readFile(new URL('../seed.sql',import.meta.url),'utf8'));
 await testWorkflows(db,{autoRelease:true});
 console.log('PASS SME release to transport: automatic acceptance/replay and reservation -> pick/pack -> rider assignment/acceptance/pickup -> verified dispatch -> GPS arrival -> proof -> SME-only receipt, with stock deducted once');
}finally{await db.close()}
