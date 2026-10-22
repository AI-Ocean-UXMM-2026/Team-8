export type PreviewRole='warehouse'|'sme'|'courier';
export type DeliveryStage='transit'|'arrived'|'delivered';
export function previewRole(value:unknown):PreviewRole{return value==='warehouse'||value==='courier'?value:'sme';}
export function previewState({role,stage,ready,busy,moving,step,canArrive,enabled}:{role:PreviewRole;stage:DeliveryStage;ready:boolean;busy:boolean;moving:boolean;step:number;canArrive:boolean;enabled:boolean}){
 const locked=!ready||busy||!enabled;
 return {canMove:role==='courier'&&stage==='transit'&&step<10&&!moving&&!locked,canArrive:role==='courier'&&stage==='transit'&&canArrive&&!moving&&!locked,canReceive:role==='sme'&&stage==='arrived'&&!locked,
 title:stage==='delivered'?'Delivery complete':stage==='arrived'?'Your delivery has arrived':'Your delivery is on the way',
 label:stage==='delivered'?'Received by SME':stage==='arrived'?'Awaiting SME confirmation':'In transit'};
}
