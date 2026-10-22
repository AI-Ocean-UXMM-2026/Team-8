export type CapturedPosition={coords:{latitude:number;longitude:number;accuracy:number};timestamp:number};
export function positionPayload(p:CapturedPosition){
 const {latitude,longitude,accuracy}=p.coords;
 if(![latitude,longitude,accuracy,p.timestamp].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0)throw new Error('GPS position could not be verified.');
 return {latitude,longitude,accuracy_m:accuracy,recorded_at:new Date(p.timestamp).toISOString()};
}
export async function startWithFirstPosition(options:{position:CapturedPosition;active:()=>boolean;open:()=>Promise<string>;opened:(id:string)=>void;send:(id:string,p:ReturnType<typeof positionPayload>)=>Promise<unknown>;stop:(id:string)=>Promise<void>}){
 const payload=positionPayload(options.position);
 if(!options.active())return null;
 const id=await options.open();options.opened(id);
 if(!options.active()){await options.stop(id);return null;}
 // Publish the position already obtained with consent, not a future watch callback.
 await options.send(id,payload);
 if(!options.active()){await options.stop(id);return null;}
 return id;
}
