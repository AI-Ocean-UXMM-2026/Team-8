export type DemoRole = 'warehouse' | 'sme' | 'rider' | 'manager';
export const demoRoleKey = 'parcelcare.demo.role.v1';
export const demoHomes: Record<DemoRole,string> = {
  warehouse:'/demo/warehouse',sme:'/demo/sme',rider:'/demo/courier',manager:'/demo/manager',
};
export function demoRole(value: unknown): DemoRole | null {
  return value==='warehouse'||value==='sme'||value==='rider'||value==='manager'?value:null;
}
export function demoRouteRole(pathname:string,params:URLSearchParams):DemoRole|null {
  for(const [prefix,role] of [['warehouse','warehouse'],['sme','sme'],['courier','rider'],['manager','manager']] as const){
    if(pathname===`/demo/${prefix}`||pathname.startsWith(`/demo/${prefix}/`))return role;
  }
  if(pathname==='/demo/workspace'){
    const value=params.get('workspace');
    return value==='manager'?'manager':value==='warehouse'?'warehouse':value==='rider'?'rider':value==='sme'||!value?'sme':null;
  }
  if(pathname==='/demo/delivery-preview'){
    const value=params.get('role');
    return value==='courier'?'rider':value==='warehouse'?'warehouse':value==='sme'||!value?'sme':null;
  }
  return null;
}
export function canEnterDemo(selected:unknown,requested:DemoRole|null){return requested!==null&&demoRole(selected)===requested;}
