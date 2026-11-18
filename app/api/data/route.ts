import { env } from 'cloudflare:workers';
import { getSession } from '@/lib/auth';
import { canPerform,canViewFinance } from '@/lib/permissions';
import { validateOrder, editOrderDetails, amount, METHODS, nextStatus, day } from '@/lib/domain';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const depositBalance = `SELECT COALESCE(SUM(p.deposit_change),0)
 FROM payments p JOIN orders source ON source.id=p.order_id WHERE source.phone=o.phone`;
const outstanding = `o.total-COALESCE((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0)`;

function applyDeposit(db:D1Database, orderId:string, created:string, actor:string) {
 return db.prepare(`INSERT INTO payments (id,order_id,amount,method,created,actor,deposit_change)
  SELECT ?,id,used,'Deposit',?,?,-used FROM (
   SELECT o.id,MIN(o.total,MAX(0,(${depositBalance}))) AS used
   FROM orders o WHERE o.id=? AND o.phone<>''
  ) WHERE used>0`).bind(orderId+'-deposit',created,actor,orderId);
}

function recordPayment(db:D1Database, orderId:string, paymentId:string, received:number, method:string, saveChange:boolean, created:string, actor:string) {
 return db.prepare(`INSERT INTO payments (id,order_id,amount,method,created,actor,deposit_change)
  SELECT ?,id,MIN(?,remaining),?,?,?,
    CASE WHEN ? AND phone<>'' THEN MAX(0,?-remaining) ELSE 0 END
  FROM (SELECT o.id,o.phone,${outstanding} AS remaining FROM orders o WHERE o.id=? AND o.status<>'Dibatalkan')
  WHERE remaining>=0 AND (remaining>0 OR (? AND phone<>''))
  ON CONFLICT(id) DO NOTHING`).bind(paymentId,received,method,created,actor,Number(saveChange),received,orderId,Number(saveChange));
}

type OrderRow={id:string;items:string;history:string;total:number;phone:string;created:string};
type PaymentRow={id:string;order_id:string;amount:number;method:string;created:string;actor:string};
type StatusRow={id:string;items:string;history:string;status:string;total:number};
type RequestBody={action?:string;id:string;orderId:string;history?:string;amount?:unknown;method?:unknown;saveChange?:unknown;status?:string;category?:unknown;note?:unknown;customer?:unknown;phone?:unknown;items?:unknown;extra?:unknown;discount?:unknown;paid?:unknown;due?:unknown;packages?:unknown;notes?:unknown};
async function snapshot(role:string){
 const db=env.DB!;
 const [os,ps,es,cs]=await db.batch([db.prepare(`SELECT o.*, CASE WHEN o.phone<>'' THEN (${depositBalance}) ELSE 0 END AS deposit FROM orders o ORDER BY created DESC`),db.prepare('SELECT * FROM payments ORDER BY created'),db.prepare(canViewFinance(role)?'SELECT * FROM expenses ORDER BY created DESC':'SELECT * FROM expenses WHERE 0'),db.prepare(`SELECT o.id,o.name,o.phone,(${depositBalance}) AS deposit FROM customers o ORDER BY name`)]);
 const paymentsByOrder=new Map<string,PaymentRow[]>();
 for(const item of ps.results as PaymentRow[]){const list=paymentsByOrder.get(item.order_id);if(list)list.push(item);else paymentsByOrder.set(item.order_id,[item]);}
 return {orders:os.results.map(value=>{const o=value as OrderRow;const payments=(paymentsByOrder.get(o.id)??[]).map(item=>{const {order_id,...rest}=item;return {...rest,orderId:order_id};});return {...o,items:JSON.parse(o.items),history:JSON.parse(o.history),payments,paid:payments.reduce((sum,p)=>sum+p.amount,0)};}),expenses:es.results,customers:cs.results};
}
export async function GET(){
 try{const u=await getSession();if(!u)return json({error:'Silakan masuk terlebih dahulu.'},401);return json(await snapshot(u.role));}
 catch(e){console.error('Read failed',e);return json({error:'Data belum dapat dimuat. Coba lagi sebentar.'},500);}
}
export async function POST(request:Request){
 try{
 const u=await getSession();if(!u)return json({error:'Silakan masuk terlebih dahulu.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Permintaan tidak diizinkan.'},403);
 const b=await request.json() as RequestBody; if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Permintaan tidak valid.'); const db=env.DB!,now=new Date().toISOString(),actor=u.name;
 if(!canPerform(u.role,b.action))return json({error:'Akses ini hanya tersedia untuk owner.'},403);
 if(typeof b.id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(b.id))throw Error('Identitas transaksi tidak valid. Muat ulang halaman.');
 if(b.action==='create'){
  const existing=await db.prepare('SELECT id FROM orders WHERE id=?').bind(b.id).first();
  if(existing)return json({...(await snapshot(u.role)),selectedId:b.id});
  const o=validateOrder(b);
  const prefix='RN-'+day(now).replaceAll('-','')+'-';
  // Allocate and insert in one statement so simultaneous orders cannot take the same number.
  const statements=[db.prepare(`
   INSERT INTO orders (id,number,customer,phone,items,total,discount,extra,status,due,created,notes,packages,rack,history)
   VALUES (?, ? || (
    SELECT printf('%03d', COALESCE(MAX(CAST(substr(number,13) AS INTEGER)),0)+1)
    FROM orders
    WHERE number >= ? AND number < ?
      AND length(substr(number,13)) BETWEEN 3 AND 7
      AND substr(number,13) NOT GLOB '*[^0-9]*'
   ), ?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(b.id,prefix,prefix,prefix.slice(0,-1)+'.',o.customer,o.phone,JSON.stringify(o.items),o.total,o.discount,o.extra,'Diterima',o.due,now,o.notes,o.packages,'',JSON.stringify([{status:'Diterima',at:now,actor}]))];
  statements.push(applyDeposit(db,b.id,now,actor));
  if(o.paid) statements.push(recordPayment(db,b.id,b.id+'-initial',o.paid,o.method,b.saveChange===true,now,actor));
  try{
   await db.batch(statements);
  }catch(error){
   // A concurrent retry may already have committed this same order and its payment.
   if(!await db.prepare('SELECT id FROM orders WHERE id=?').bind(b.id).first())throw error;
  }
  return json({...(await snapshot(u.role)),selectedId:b.id});
 }
 if(b.action==='edit'){
  const order = await db.prepare('SELECT items,history FROM orders WHERE id=?').bind(b.orderId)
   .first<{items:string;history:string}>();
  if(!order)throw Error('Pesanan tidak ditemukan.');
  const history = JSON.parse(order.history);
  if(JSON.stringify(history)!==b.history)throw Error('Pesanan sudah berubah. Muat ulang sebelum menyimpan.');
  const edited = editOrderDetails(b,JSON.parse(order.items));
  const updated = await db.prepare(`UPDATE orders SET items=?,extra=?,discount=?,total=?,notes=?,history=?
   WHERE id=? AND history=? AND ? >= COALESCE((SELECT SUM(amount) FROM payments WHERE order_id=orders.id),0)`)
   .bind(JSON.stringify(edited.items),edited.extra,edited.discount,edited.total,edited.notes,
    JSON.stringify([...history,{status:'Rincian pesanan diedit',at:now,actor}]),b.orderId,order.history,edited.total).run();
  if(!updated.meta.changes)throw Error('Pesanan sudah berubah atau total baru lebih kecil dari pembayaran tercatat.');
 }
 else if(b.action==='payment'){
  const n=Number(b.amount);
  if(!Number.isFinite(n)||n<=0||n>100000000||Math.abs(n*100-Math.round(n*100))>0.00001||typeof b.method!=='string'||!METHODS.includes(b.method))throw Error('Isi nominal dan metode pembayaran yang valid.');
  const existing=await db.prepare('SELECT id FROM payments WHERE id=?').bind(b.id).first();
  if(!existing){
   const r=await recordPayment(db,b.orderId,b.id,n,b.method,b.saveChange===true,now,actor).run();
   if(!r.meta.changes&&!await db.prepare('SELECT id FROM payments WHERE id=?').bind(b.id).first())throw Error('Pesanan sudah lunas atau tidak tersedia. Muat ulang data.');
  }
 }
 else if(b.action==='status'){
  const o=await db.prepare('SELECT * FROM orders WHERE id=?').bind(b.orderId).first<StatusRow>();if(!o)throw Error('Pesanan tidak ditemukan.');
  const parsed={...o,items:JSON.parse(o.items)};const next=nextStatus(parsed);if(!next||next!==b.status)throw Error('Tahapan pesanan sudah berubah. Muat ulang data.');
  const history=[...JSON.parse(o.history),{status:next,at:now,actor}];
  const r=await db.prepare('UPDATE orders SET status=?,history=? WHERE id=? AND status=? AND (? != ? OR total <= (SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=orders.id))').bind(next,JSON.stringify(history),o.id,o.status,next,'Selesai').run();
  if(!r.meta.changes)throw Error('Lunasi pembayaran sebelum menyerahkan cucian, atau muat ulang jika status berubah.');
 }
 else if(b.action==='expense'){
  const n=amount(b.amount);if(!n||typeof b.category!=='string'||!['Deterjen','Pewangi','Air','Listrik','Gaji','Sewa','Kemasan','Perawatan','Lainnya'].includes(b.category))throw Error('Isi kategori dan nominal pengeluaran.');
  await db.prepare('INSERT INTO expenses (id,category,amount,note,created,actor) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(b.id,b.category,n,String(b.note??'').slice(0,300),now,actor).run();
 }
 else throw Error('Aksi tidak dikenali.');
 return json(await snapshot(u.role));
 }catch(e){const message=e instanceof Error?e.message:'';if(/D1_|SQLITE|constraint|database/i.test(message)){console.error('Write failed',e);return json({error:'Transaksi belum berhasil disimpan. Coba lagi; jangan tutup formulir.'},500);}return json({error:message||'Transaksi gagal. Silakan coba kembali.'},400);}
}
