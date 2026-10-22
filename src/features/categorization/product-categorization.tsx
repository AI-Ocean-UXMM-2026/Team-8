'use client';
import {useRef,useState} from 'react';
import {useSession} from '../auth/session';
import {ApiError,type Schemas} from '../../shared/api';
import {Button,Input,Badge} from '../../shared/ui';
import {ErrorPanel,Loading,useResource,dateTime} from '../warehouse/shared';
import './categorization.css';
type State=Schemas['CategoryState'];
type Metadata=Schemas['Metadata'];
const fields=[['description','Product description',2000],['material','Material / ingredients',300],['intended_use','Intended use',500],['storage_notes','Storage / handling notes',500]] as const;
export function ProductCategorization({productId}:{productId:string}){
 const {api,warehouseId,demo}=useSession();
 const resource=useResource(`${warehouseId}:${productId}`,async signal=>{
  if(demo)return null;
  const [state,options]=await Promise.all([api!.getProductCategory(productId,warehouseId,signal),api!.getCategoryOptions(warehouseId,signal)]);
  return {state,options};
 });
 if(demo)return <section className="categoryPanel"><h3>AI-assisted stock categorization</h3><p>Sign in to the live warehouse to save product metadata, request an AI suggestion and verify its category.</p></section>;
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 return <CategoryEditor key={`${productId}:${resource.data.state.revision}`} initial={resource.data.state} options={resource.data.options} reload={resource.reload}/>;
}
function CategoryEditor({initial,options,reload}:{initial:State;options:Schemas['CategoryOptions'];reload:()=>void}){
 const {api,warehouseId}=useSession();
 const [state,setState]=useState(initial),[metadata,setMetadata]=useState<Metadata>(initial.metadata);
 const [category,setCategory]=useState<NonNullable<State['category']>|''>(initial.category??initial.suggestion?.category??'');
 const [note,setNote]=useState(''),[ack,setAck]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const locked=useRef(false),retry=useRef<{payload:string;key:string}|null>(null);
 const dirty=fields.some(([key])=>(metadata[key]??'')!==(state.metadata[key]??''));
 const suggestion=state.suggestion;
 const flags=[...fields.filter(([key])=>!(state.metadata[key]??'').trim()).map(([,label])=>`${label} is missing`),
 ...(suggestion?.uncertain_attributes??[]).map(key=>`${fields.find(([field])=>field===key)?.[1]??key} needs verification`),
 ...(!suggestion?['No AI suggestion has been recorded']:[]),
 ...(suggestion&&suggestion.confidence<0.8?['AI confidence is below the 80% review threshold']:[]),
 ...(suggestion?.category==='other'?['AI could not choose a specific category']:[])];
 async function run(kind:'metadata'|'analyze'|'review'){
  if(locked.current)return;
  locked.current=true;setBusy(kind);setError('');setMessage('');
  const body=kind==='metadata'?{...metadata,expected_revision:state.revision}:kind==='review'?{expected_revision:state.revision,category:category as NonNullable<State['category']>,note,acknowledge_flags:ack}:{expected_revision:state.revision};
  const payload=JSON.stringify({kind,body});
  if(retry.current?.payload!==payload)retry.current={payload,key:crypto.randomUUID()};
  const request={warehouseId,idempotencyKey:retry.current!.key};
  try{
   const next=kind==='metadata'?await api!.saveProductMetadata(state.product_id,body as Schemas['MetadataCommand'],request):kind==='analyze'?await api!.analyzeProductCategory(state.product_id,body as Schemas['AnalyzeCommand'],request):await api!.reviewProductCategory(state.product_id,body as Schemas['ReviewCommand'],request);
   if(next.product_id!==state.product_id||next.warehouse_id!==warehouseId)throw new Error('The saved product could not be verified. Reload this product.');
   setState(next);setMetadata(next.metadata);setCategory(next.category??next.suggestion?.category??'');setAck(false);setNote('');retry.current=null;
   setMessage(kind==='metadata'?'Metadata saved. Request a new suggestion or verify manually.':kind==='analyze'?'AI suggestion saved. Human verification is required.':'Category verified and saved.');
  }catch(e){setError(e instanceof ApiError&&e.status===409?'This product changed or the request conflicted. Reload the saved record before continuing.':e instanceof Error?e.message:'Unable to save categorization.');}
  finally{setBusy('');locked.current=false;}
 }
 return <section className="categoryPanel" aria-labelledby="category-title"><div className="categoryHeading"><div><h3 id="category-title">AI-assisted stock categorization</h3><p>Classify this product from its description and metadata. Stock quantities stay unchanged.</p></div><Badge>{state.status==='verified'?'Category verified':'Needs human verification'}</Badge></div>
 <div className="categoryColumns"><div><h4>Product facts</h4><p className="categoryHint">Enter known facts in English or Myanmar. Leave unknown attributes blank; do not guess. Product name and these fields are sent to {options.provider==='groq'?'Groq (hosted AI)':'your configured Ollama server'} when you request a suggestion.</p>
 <fieldset disabled={!!busy} className="categoryFields">{fields.map(([key,label,max])=><label key={key}>{label}{key==='description'?<textarea rows={4} maxLength={max} value={metadata[key]??''} onChange={e=>setMetadata({...metadata,[key]:e.target.value})}/>:<Input maxLength={max} value={metadata[key]??''} onChange={e=>setMetadata({...metadata,[key]:e.target.value})}/>}</label>)}</fieldset>
 <div className="categoryActions"><Button disabled={!!busy||!dirty} onClick={()=>void run('metadata')}>{busy==='metadata'?'Savingâ€¦':'Save product facts'}</Button><Button variant="outline" disabled={!!busy||dirty||!options.ai_available} onClick={()=>void run('analyze')}>{busy==='analyze'?'Classifyingâ€¦':'Suggest category with AI'}</Button></div>
 {dirty&&<p role="status" className="categoryHint">Save your changes before classifying or verifying. Saving facts clears the previous suggestion and verification.</p>}
 {!options.ai_available&&<p role="status" className="categoryHint">AI is not configured on this server. You can still choose and verify a category manually.</p>}</div>
 <div><h4>Suggestion and verification</h4>{suggestion?<div className="categorySuggestion"><strong>{options.categories[suggestion.category]}</strong><p>AI confidence: {Math.round(suggestion.confidence*100)}% Â· heuristic, not a guarantee</p><p data-user-content>{suggestion.rationale}</p><p className="categoryHint">Model: {suggestion.model}</p></div>:<p>No AI suggestion yet.</p>}
 {flags.length>0&&<div className="categoryFlags"><h4>Check before verifying</h4><ul>{flags.map((flag,i)=><li key={`${flag}:${i}`}>{flag}</li>)}</ul></div>}
 <fieldset disabled={!!busy||dirty} className="categoryFields"><label>Verified category<select aria-label="Verified category" value={category} onChange={e=>setCategory(e.target.value as typeof category)}><option value="">Choose a category</option>{Object.entries(options.categories).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Verification note<Input value={note} minLength={5} maxLength={1000} placeholder="What did you check or correct?" onChange={e=>setNote(e.target.value)}/></label>{flags.length>0&&<label className="categoryAcknowledge"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I reviewed the flags and recorded any unresolved details in my note.</label>}
 <Button disabled={!category||note.trim().length<5||(flags.length>0&&!ack)} onClick={()=>void run('review')}>{busy==='review'?'Verifyingâ€¦':'Verify category'}</Button></fieldset>
 {state.status==='verified'&&<p className="categoryVerified" role="status">Saved category: {state.category&&options.categories[state.category]}<br/>Verified {state.reviewed_at&&dateTime(state.reviewed_at)} Â· {state.reviewed_by}<br/><span data-user-content>{state.review_note}</span></p>}</div></div>
 {error&&<div role="alert" className="categoryFlags"><p>{error}</p><Button variant="outline" onClick={reload} disabled={!!busy}>Reload saved record</Button><p className="categoryHint">Reload discards unsaved form edits. Retry an unchanged action to reuse its request key.</p></div>}{message&&<p role="status">{message}</p>}
 </section>;
}
