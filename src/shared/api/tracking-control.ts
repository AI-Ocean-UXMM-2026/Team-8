import {ApiError} from './transport';
export type TrackingSettings={live_gps_enabled:boolean;demo_simulation_enabled:boolean};
export type Arrival={shipment_id:string;arrived_at:string;latitude:number;longitude:number;delivered:boolean};
export function checkedSettings(value:unknown):TrackingSettings{const v=value as TrackingSettings;if(!v||typeof v.live_gps_enabled!=='boolean'||typeof v.demo_simulation_enabled!=='boolean')throw new ApiError(502,'INVALID_RESPONSE','Tracking settings could not be verified.');return v;}
export function checkedArrival(value:unknown,id:string):Arrival|null{if(value===null)return null;const v=value as Arrival;if(!v||v.shipment_id!==id||!Number.isFinite(Date.parse(v.arrived_at))||!Number.isFinite(v.latitude)||Math.abs(v.latitude)>90||!Number.isFinite(v.longitude)||Math.abs(v.longitude)>180||typeof v.delivered!=='boolean')throw new ApiError(502,'INVALID_RESPONSE','Arrival confirmation could not be verified.');return v;}
