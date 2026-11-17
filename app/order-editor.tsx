'use client';

import { useState, type FormEvent } from 'react';
import { editOrderDetails, money, type Order } from '@/lib/domain';

export default function OrderEditor({order, busy, onSave, onCancel}: {
  order: Order;
  busy: boolean;
  onSave: (data: unknown) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [history] = useState(() => JSON.stringify(order.history));
  const [items, setItems] = useState(() => order.items.map((item, index) => ({
    key: crypto.randomUUID(), originalIndex: index as number | undefined,
    name: item.name, unit: item.unit, quantity: String(item.quantity), price: String(item.price),
  })));
  const [extra, setExtra] = useState(String(order.extra));
  const [discount, setDiscount] = useState(String(order.discount));
  const [notes, setNotes] = useState(order.notes);
  const [error, setError] = useState('');
  const draft = {items, extra, discount, notes};
  let total: number | undefined;
  try { total = editOrderDetails(draft, order.items).total; } catch { /* Incomplete form. */ }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      editOrderDetails(draft, order.items);
      await onSave({action: 'edit', id: crypto.randomUUID(), orderId: order.id, history, ...draft});
    } catch (error) {
      setError((error as Error).message);
    }
  }

  return <form onSubmit={submit} className="order-editor">
    <h3>Edit pesanan {order.customer}</h3>
    <fieldset disabled={busy}>
      {items.map((item, index) => {
        const change = (field: 'name' | 'unit' | 'quantity' | 'price', value: string) =>
          setItems(current => current.map(line => line.key === item.key ? {...line, [field]: value} : line));
        return <fieldset key={item.key}>
          <legend>Layanan {index + 1}</legend>
          <label>Nama layanan<input required maxLength={100} value={item.name} onChange={e=>change('name',e.target.value)}/></label>
          <div className="form-grid">
            <label>Jumlah<input required type="number" min="0.001" max="1000" step="0.001" value={item.quantity} onChange={e=>change('quantity',e.target.value)}/></label>
            <label>Satuan<input required maxLength={20} value={item.unit} onChange={e=>change('unit',e.target.value)}/></label>
          </div>
          <label>Harga per satuan (Rp)<input required type="number" min="0" max="100000000" step="0.01" value={item.price} onChange={e=>change('price',e.target.value)}/></label>
          <button type="button" className="text-btn" disabled={items.length===1} onClick={()=>setItems(items.filter(line=>line.key!==item.key))}>Hapus layanan</button>
        </fieldset>;
      })}
      <button type="button" className="secondary" disabled={items.length>=20}
        onClick={()=>setItems([...items,{key:crypto.randomUUID(),originalIndex:undefined,name:'',unit:'pcs',quantity:'1',price:''}])}>
        Tambah layanan
      </button>
      <div className="form-grid">
        <label>Biaya tambahan (Rp)<input type="number" min="0" step="0.01" value={extra} onChange={e=>setExtra(e.target.value)}/></label>
        <label>Diskon (Rp)<input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
      </div>
      <label>Catatan cucian<textarea maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    </fieldset>
    <div className="summary-row"><span>Total tagihan</span><strong>{total===undefined?'—':money(total)}</strong></div>
    <div className="summary-row"><span>Pembayaran tercatat</span><strong>{money(order.paid)}</strong></div>
    {total!==undefined&&total<order.paid&&<p className="error-banner" role="alert">Total baru lebih kecil dari pembayaran tercatat.</p>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <div className="detail-actions">
      <button type="submit" className="primary" disabled={busy || (total!==undefined && total<order.paid)}>Simpan perubahan</button>
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Batal</button>
    </div>
  </form>;
}
