import { env } from 'cloudflare:workers';
import type {Order,Payment} from './domain';
type OrderRow=Omit<Order,'items'|'history'|'payments'|'paid'>&{items:string;history:string};
type PaymentRow=Omit<Payment,'orderId'>&{order_id:string};
export async function getReceiptOrder(id:string):Promise<Order|null>{
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))return null;
 const [os,ps]=await env.DB!.batch([env.DB!.prepare('SELECT * FROM orders WHERE id=?').bind(id),env.DB!.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY created').bind(id)]);
 const row=os.results[0] as OrderRow|undefined;if(!row)return null;
 const payments=ps.results.map(value=>{const {order_id,...rest}=value as PaymentRow;return {...rest,orderId:order_id};}) as Payment[];
 return {...row,items:JSON.parse(row.items),history:JSON.parse(row.history),payments,paid:payments.reduce((sum,p)=>sum+p.amount,0)};
}
