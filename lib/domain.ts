export type Service = {id:string;name:string;group:string;variant:string;unit:string;price:number;hours:number|null;flow:'wash'|'iron'|'fold'};
export const SERVICE_GROUPS = [
 {id:'wash',name:'Cuci + Setrika Wangi',icon:'shirt'},
 {id:'iron',name:'Setrika Wangi',icon:'wind'},
 {id:'fold',name:'Cuci Lipat Wangi',icon:'shirt'},
 {id:'bed',name:'Bedcover',icon:'bed'},
 {id:'sheet',name:'Sprei',icon:'bed'},
 {id:'formal',name:'Pakaian Spesifik / Formal',icon:'shirt'},
 {id:'home',name:'Perlengkapan Rumah Tangga',icon:'wind'},
];
export const SERVICES:Service[] = [
 {id:'wash',group:'wash',variant:'3 hari',unit:'kg',price:6500,hours:72,flow:'wash'},
 {id:'wash-2d',group:'wash',variant:'2 hari',unit:'kg',price:7500,hours:48,flow:'wash'},
 {id:'wash-1d',group:'wash',variant:'1 hari',unit:'kg',price:10000,hours:24,flow:'wash'},
 {id:'wash-3h',group:'wash',variant:'Express 3 jam',unit:'kg',price:14000,hours:3,flow:'wash'},
 {id:'iron',group:'iron',variant:'2 hari',unit:'kg',price:4500,hours:48,flow:'iron'},
 {id:'iron-1d',group:'iron',variant:'1 hari',unit:'kg',price:5500,hours:24,flow:'iron'},
 {id:'iron-4h',group:'iron',variant:'Express 4 jam',unit:'kg',price:7000,hours:4,flow:'iron'},
 {id:'fold',group:'fold',variant:'2 hari',unit:'kg',price:4500,hours:48,flow:'fold'},
 {id:'fold-1d',group:'fold',variant:'1 hari',unit:'kg',price:5500,hours:24,flow:'fold'},
 {id:'fold-4h',group:'fold',variant:'Express 4 jam',unit:'kg',price:7000,hours:4,flow:'fold'},
 {id:'bed',group:'bed',variant:'Kecil / Single + sarung bantal',unit:'pcs',price:12000,hours:null,flow:'wash'},
 {id:'bed-medium',group:'bed',variant:'Sedang + sarung bantal',unit:'pcs',price:24000,hours:null,flow:'wash'},
 {id:'bed-king',group:'bed',variant:'Besar / King',unit:'pcs',price:30000,hours:null,flow:'wash'},
 {id:'sheet-small',group:'sheet',variant:'Set kecil',unit:'pcs',price:10000,hours:null,flow:'wash'},
 {id:'sheet-medium',group:'sheet',variant:'Set sedang',unit:'pcs',price:14000,hours:null,flow:'wash'},
 {id:'sheet-large',group:'sheet',variant:'Set besar',unit:'pcs',price:17000,hours:null,flow:'wash'},
 {id:'formal-suit',group:'formal',variant:'Jas / Blazer 1 set',unit:'set',price:40000,hours:null,flow:'wash'},
 {id:'formal-shirt',group:'formal',variant:'Kemeja kerja',unit:'pcs',price:15000,hours:null,flow:'wash'},
 {id:'formal-jacket',group:'formal',variant:'Sweater / Jaket tebal',unit:'pcs',price:18000,hours:null,flow:'wash'},
 {id:'formal-jeans',group:'formal',variant:'Celana panjang / Jeans',unit:'pcs',price:10000,hours:null,flow:'wash'},
 {id:'home-curtain',group:'home',variant:'Gorden',unit:'pcs',price:15000,hours:null,flow:'wash'},
 {id:'home-towel',group:'home',variant:'Handuk mandi besar',unit:'pcs',price:10000,hours:null,flow:'wash'},
 {id:'home-fleece',group:'home',variant:'Selimut tipis / Fleece',unit:'pcs',price:14000,hours:null,flow:'wash'},
 {id:'home-blanket',group:'home',variant:'Selimut tebal',unit:'pcs',price:24000,hours:null,flow:'wash'},
].map(s=>({...s,name:SERVICE_GROUPS.find(g=>g.id===s.group)!.name+' — '+s.variant})) as Service[];
export function estimatedHours(items:{serviceId:string}[]){if(!items.length)return null;const services=items.map(i=>SERVICES.find(s=>s.id===i.serviceId));return services.some(s=>!s||s.hours===null)?null:Math.max(...services.map(s=>s!.hours!));}
export const STATUSES = ['Diterima','Dicuci','Dikeringkan','Disetrika','Siap Diambil','Selesai'];
export const METHODS = ['Tunai','Transfer','QRIS'];
export const CUSTOM_SERVICE_ID = 'custom';
export const CUSTOM_UNITS = ['pcs', 'set', 'kg'];
export type Item = {serviceId:string;name:string;unit:string;quantity:number;price:number;subtotal:number};
export type Payment = {id:string;orderId:string;amount:number;method:string;created:string;actor:string;deposit_change?:number};
export type Order = {id:string;number:string;customer:string;phone:string;items:Item[];total:number;discount:number;extra:number;status:string;due:string;created:string;notes:string;packages:number;rack:string;history:{status:string;at:string;actor:string}[];payments:Payment[];paid:number;deposit?:number};
export type Expense = {id:string;category:string;amount:number;note:string;created:string;actor:string};
export type Customer = {id:string;name:string;phone:string|null;deposit?:number};
export const money=(n:number)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
export const day=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
export const dateTime=(iso:string)=>new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
type DraftItem={serviceId?:unknown;name?:unknown;unit?:unknown;quantity?:unknown;price?:unknown};
export type OrderInput={customer?:unknown;phone?:unknown;items?:unknown;extra?:unknown;discount?:unknown;paid?:unknown;method?:unknown;due?:unknown;packages?:unknown;notes?:unknown};
type EditLine={originalIndex?:unknown;name?:unknown;unit?:unknown;quantity?:unknown;price?:unknown};
export type EditInput={items?:unknown;extra?:unknown;discount?:unknown;notes?:unknown};
export function validateOrder(input:OrderInput) {
 if(typeof input.customer!=='string'||!input.customer.trim()||input.customer.length>100) throw Error('Isi nama pelanggan (maksimal 100 karakter).');
 const phone=String(input.phone??'').replace(/[\s()+-]/g,'').replace(/^0/,'62');
 if(!/^62\d{8,13}$/.test(phone)) throw Error('Nomor WhatsApp Indonesia tidak valid.');
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>20) throw Error('Tambahkan minimal satu layanan.');
 const items:Item[]=input.items.map((i:DraftItem)=>{
  const custom=i?.serviceId===CUSTOM_SERVICE_ID;
  const s=custom
   ? {id:CUSTOM_SERVICE_ID,name:typeof i.name==='string'?i.name.trim():'',unit:typeof i.unit==='string'?i.unit:'',price:amount(i.price)}
   : SERVICES.find(s=>s.id===i?.serviceId);
  if(custom&&(!s?.name||s.name.length>100||!CUSTOM_UNITS.includes(s.unit)||s.price<=0)){
   throw Error('Isi nama, satuan, dan harga per satuan layanan custom.');
  }
  const q=Number(i?.quantity);
  if(!s||!Number.isFinite(q)||q<=0||q>1000||Math.abs(q*1000-Math.round(q*1000))>0.00001||(s.unit!=='kg'&&!Number.isInteger(q))) throw Error('Kuantitas layanan tidak valid.');
  return {serviceId:s.id,name:s.name,unit:s.unit,quantity:q,price:s.price,subtotal:Math.round(q*s.price)};
 });
 const extra=amount(input.extra??0),discount=amount(input.discount??0);
 const subtotal=items.reduce((a,i)=>a+i.subtotal,0),total=subtotal+extra-discount;
 if(total<=0||total>100000000) throw Error('Total tagihan harus lebih dari nol dan maksimal Rp100 juta.');
 const paid=amount(input.paid??0);
 if(paid>0&&(typeof input.method!=='string'||!METHODS.includes(input.method))) throw Error('Pilih metode pembayaran.');
 const due=new Date(input.due as string|number);
 if(!Number.isFinite(due.getTime())||due.getTime()<Date.now()-60000) throw Error('Estimasi selesai harus setelah waktu sekarang.');
 const packages=Number(input.packages??1);
 if(!Number.isInteger(packages)||packages<1||packages>100) throw Error('Jumlah paket harus 1–100.');
 return {customer:input.customer.trim(),phone,items,total,extra,discount,paid,method:input.method as string,due:due.toISOString(),packages,notes:String(input.notes??'').slice(0,500)};
}
export function amount(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>100000000)throw Error('Nominal harus bilangan rupiah utuh antara 0 dan Rp100 juta.');return n;}
export function editOrderDetails(input: EditInput, originalItems: Item[]) {
 if (!Array.isArray(input.items) || !input.items.length || input.items.length > 20) throw Error('Isi 1–20 layanan.');
 const used = new Set<number>();
 const items: Item[] = input.items.map((line: EditLine) => {
  const index = line?.originalIndex as number | undefined;
  const original = index === undefined ? undefined : originalItems[index];
  if (index !== undefined && (!Number.isInteger(index) || !original || used.has(index))) throw Error('Rincian layanan tidak valid.');
  if (original && index !== undefined) used.add(index);
  const name = typeof line?.name === 'string' ? line.name.trim() : '';
  const unit = line?.unit;
  const quantity = Number(line?.quantity);
  const price = amount(line?.price);
  if (!name || name.length > 100 || typeof unit !== 'string' || !unit.trim() || unit.length > 20 ||
      !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000 ||
      Math.abs(quantity*1000-Math.round(quantity*1000))>0.00001) throw Error('Isi nama, satuan, dan jumlah layanan yang valid.');
  const subtotal = original && original.quantity === quantity && original.price === price
   ? original.subtotal : Math.round(quantity*price);
  return {serviceId: original?.serviceId ?? CUSTOM_SERVICE_ID, name, unit: unit.trim(), quantity, price, subtotal};
 });
 const extra = amount(input.extra);
 const discount = amount(input.discount);
 const total = items.reduce((sum,item)=>sum+item.subtotal,0)+extra-discount;
 if (total <= 0 || total > 100000000) throw Error('Total tagihan harus lebih dari nol dan maksimal Rp100 juta.');
 return {items, extra, discount, total, notes: String(input.notes??'').slice(0,500)};
}
export function nextStatus(o:Pick<Order,'items'|'status'>){
 const flows=o.items.map(i=>SERVICES.find(s=>s.id===i.serviceId)?.flow??'wash');
 const path=flows.every(f=>f==='iron')?['Diterima','Disetrika','Siap Diambil','Selesai']:flows.every(f=>f==='fold')?['Diterima','Dicuci','Dikeringkan','Siap Diambil','Selesai']:STATUSES;
 return path[path.indexOf(o.status)+1];
}
