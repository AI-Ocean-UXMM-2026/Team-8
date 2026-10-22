import {createDemoHub,type DemoAction} from '../../../../shared/api/demo-sync';
export const dynamic='force-dynamic';
export const runtime='nodejs';
// Public fictitious preview only. Never reads/writes live shipment or GPS tables.
// One shared demo per server process; restarts reset it. Production RBAC is separate.
const globalDemo=globalThis as typeof globalThis&{parcelcareDemoHub?:ReturnType<typeof createDemoHub>};
const hub=globalDemo.parcelcareDemoHub??=createDemoHub();
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function GET(){return json(hub.read());}
export async function POST(request:Request){
 if(request.headers.get('origin')&&new URL(request.headers.get('origin')!).host!==request.headers.get('host'))return json({error:'ORIGIN_DENIED'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'INVALID_REQUEST'},400);
 try{const text=await request.text();if(text.length>2048)return json({error:'TOO_LARGE'},413);const body=JSON.parse(text);if(!['advance','arrive','receive','reset','settings'].includes(body.action)||!Number.isInteger(body.revision)||body.revision<0||typeof body.key!=='string'||!/^[0-9a-f-]{36}$/i.test(body.key))return json({error:'INVALID_REQUEST'},400);return json(hub.command(body as {action:DemoAction;revision:number;key:string}));}catch(error){const message=error instanceof Error?error.message:'INVALID_REQUEST';return json({error:['STALE_DEMO','DEMO_DISABLED','ACTION_NOT_READY','KEY_CONFLICT'].includes(message)?message:'INVALID_REQUEST'},['STALE_DEMO','DEMO_DISABLED','ACTION_NOT_READY','KEY_CONFLICT'].includes(message)?409:400);}
}
