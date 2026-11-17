'use client';

import { useEffect, useState } from 'react';
import { receiptFilename } from '@/lib/receipt-pdf';
import { MessageCircle } from 'lucide-react';

export function whatsappNumber(phone?: string | null) {
  const digits = (phone ?? '').trim().replace(/[\s()+.\-]/g, '').replace(/^0/, '62');
  return /^62[1-9]\d{7,12}$/.test(digits) ? digits : null;
}

export default function ShareReceipt({ orderId, phone, customer, number, initialOpen = false }: {
  orderId: string;
  phone?: string | null;
  customer: string;
  number: string;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'manual'>('loading');
  const [sharing, setSharing] = useState(false);
  const recipient = whatsappNumber(phone);
  const pdf = '/api/receipts/' + encodeURIComponent(orderId) + '?paper=58';
  const filename = receiptFilename(number, 58);
  const message = encodeURIComponent(`Halo ${customer}, berikut struk RapiNota untuk pesanan ${number}. Terima kasih!`);

  useEffect(() => {
    if (!open || !recipient) return;
    if (!navigator.share || !navigator.canShare) {
      setStatus('manual');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setFile(null);
    async function loadPdf() {
      try {
        const response = await fetch(pdf, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('application/pdf')) {
          throw new Error('PDF tidak tersedia');
        }
        const attachment = new File([await response.blob()], filename, { type: 'application/pdf' });
        if (controller.signal.aborted) return;
        if (!navigator.canShare({ files: [attachment] })) {
          setStatus('manual');
          return;
        }
        setFile(attachment);
        setStatus('ready');
      } catch {
        if (!controller.signal.aborted) setStatus('manual');
      }
    }
    void loadPdf();
    return () => controller.abort();
  }, [open, recipient, pdf, filename]);

  async function sharePdf() {
    if (!file || sharing) return;
    setSharing(true);
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('manual');
    } finally {
      setSharing(false);
    }
  }

  return <div className="receipt-wa">
    <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
      <MessageCircle size={17}/>Kirim struk via WA
    </button>
    {open && (recipient ? <div className="receipt-wa-options">
      {status === 'loading' && <p role="status">Menyiapkan struk PDF…</p>}
      {status === 'ready' && <>
        <button type="button" className="primary" onClick={sharePdf} disabled={sharing}>Bagikan PDF</button>
        <p>Pilih WhatsApp, lalu pilih chat {customer}.</p>
      </>}
      <a className="secondary" href={pdf} download={filename}>Unduh Struk Invoice Pelanggan</a>
      <a className="secondary" href={`https://wa.me/${recipient}?text=${message}`} target="_blank" rel="noopener noreferrer">Buka chat pelanggan</a>
      <p>Untuk kirim lewat chat langsung, unduh PDF lalu lampirkan sebagai dokumen.</p>
    </div> : <p className="error-banner" role="alert">Pelanggan ini tidak memiliki nomor WhatsApp yang terdaftar.</p>)}
  </div>;
}