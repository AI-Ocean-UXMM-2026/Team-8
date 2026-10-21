const handlers=new Set<()=>Promise<void>>();
export function registerSessionCleanup(handler:()=>Promise<void>){handlers.add(handler);return()=>{handlers.delete(handler);};}
export async function cleanupSession(){await Promise.allSettled([...handlers].map(handler=>handler()));}
