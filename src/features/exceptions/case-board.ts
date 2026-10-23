import {ApiError,type Schemas} from '../../shared/api';

export const boardColumns=[
 {id:'new',label:'New'},
 {id:'investigating',label:'Investigating'},
 {id:'waiting',label:'Waiting'},
 {id:'resolved',label:'Resolved'},
] as const;
export function caseColumn(status:string){
 if(status==='resolved'||status==='closed')return 'resolved';
 if(status.startsWith('awaiting_'))return 'waiting';
 if(status==='new')return 'new';
 return 'investigating';
}
const priorities=['critical','high','normal','low'];
export function sortBoardCases(items:Schemas['CaseSummary'][]){
 return [...items].sort((a,b)=>priorities.indexOf(a.priority)-priorities.indexOf(b.priority)||(b.risk_score??0)-(a.risk_score??0)||a.id.localeCompare(b.id));
}
// A board represents the whole filtered queue, not only the table's current page.
export async function loadCaseBoard(fetchPage:(cursor?:string)=>Promise<Schemas['CasePage']>,signal?:AbortSignal):Promise<Schemas['CasePage']>{
 const items:Schemas['CaseSummary'][]=[];const cursors=new Set<string>(),ids=new Set<string>();let cursor:string|undefined;let summary:Schemas['CasePage']['summary'];
 do{
  signal?.throwIfAborted();const page=await fetchPage(cursor);summary=page.summary;signal?.throwIfAborted();
  for(const item of page.items){if(ids.has(item.id))throw new ApiError(409,'QUEUE_CHANGED','The case queue changed while loading. Refresh the board.');ids.add(item.id);items.push(item);}
  cursor=page.next_cursor||undefined;
  if(cursor){if(cursors.has(cursor))throw new ApiError(502,'INVALID_RESPONSE','The case queue returned a repeated page. Refresh the board.');cursors.add(cursor);}
 }while(cursor);
 return {items,next_cursor:null,summary};
}
