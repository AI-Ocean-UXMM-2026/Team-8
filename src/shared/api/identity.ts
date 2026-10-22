import {ApiError} from './transport';
// Only the read-only identity lookup retries. Password exchange and mutations never do.
export async function loadWorkspaceIdentity<T>(load:(signal:AbortSignal)=>Promise<T>,options:{signal?:AbortSignal;onWaiting?:()=>void;budgetMs?:number;now?:()=>number;wait?:(ms:number,signal:AbortSignal)=>Promise<void>}={}):Promise<T>{
 const budget=options.budgetMs??120000,clock=options.now??Date.now,started=clock();
 const timeout=AbortSignal.timeout(budget),signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
 const wait=options.wait??((ms:number,s:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);reject(s.reason)};
  const timer=setTimeout(()=>{s.removeEventListener('abort',abort);resolve()},ms);
  s.addEventListener('abort',abort,{once:true});if(s.aborted)abort();
 }));
 const unavailable=()=>new ApiError(503,'WORKSPACE_STARTUP_TIMEOUT','The workspace is taking too long to start. Please try again shortly. Your data has not been changed.');
 while(true){
  if(options.signal?.aborted)throw options.signal.reason;
  if(signal.aborted||clock()-started>=budget)throw unavailable();
  try{return await load(signal)}catch(error){
   if(options.signal?.aborted)throw options.signal.reason;
   if(signal.aborted)throw unavailable();
   const transient=error instanceof ApiError&&([502,503,504].includes(error.status)||(error.status===0&&['NETWORK_ERROR','REQUEST_TIMEOUT'].includes(error.code)))&&!/not configured/i.test(error.message);
   if(!transient)throw error;
   const remaining=budget-(clock()-started);if(remaining<=0)throw unavailable();
   options.onWaiting?.();
   try{await wait(Math.min(2000,remaining),signal)}catch{if(options.signal?.aborted)throw options.signal.reason;throw unavailable()}
  }
 }
}
