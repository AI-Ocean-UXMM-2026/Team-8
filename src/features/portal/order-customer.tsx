'use client';
import {useSession} from '../auth/session';
import {useResource,ErrorPanel,Loading} from '../warehouse/shared';
import {Card} from '../../shared/ui';
import {googleMapsUrl} from '../../shared/api/orders';
export function OrderCustomer({shipmentId}:{shipmentId:string}){
 const {api,demo}=useSession();
 const resource=useResource(shipmentId,signal=>demo?Promise.resolve(null):api!.getOrderCustomer(shipmentId,signal));
 if(demo)return null;
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(resource.loading)return <Loading/>;
 const c=resource.data;if(!c)return null;
 return <Card className="my-5"><h2 className="font-semibold">Customer · လက်ခံသူ</h2><p>{c.customer_name} · {c.customer_phone}</p><p>{c.address}</p><p>{c.notes}</p><a className="inline-flex min-h-11 items-center text-brand underline" href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`} target="_blank" rel="noreferrer">Open confirmed delivery pin ↗</a>{c.maps_url&&googleMapsUrl(c.maps_url)&&<a className="ml-4 inline-flex min-h-11 items-center text-brand underline" href={c.maps_url} target="_blank" rel="noreferrer">Customer Maps link ↗</a>}</Card>;
}
