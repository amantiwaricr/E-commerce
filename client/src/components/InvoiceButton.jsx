import { useState } from 'react';
import api from '../api/client';
import { DownloadIcon } from './icons';
import { useToast } from '../context/ToastContext';

/**
 * Downloads a delivered order's bill.
 *
 * The endpoint is behind the session, so the PDF is fetched as a blob and
 * handed to the browser rather than linked to — a plain <a href> would arrive
 * without the Authorization header and be refused.
 */
export default function InvoiceButton({ order, className = 'btn secondary sm' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (order?.orderStatus !== 'delivered') return null;

  const download = async () => {
    setBusy(true);
    let url;
    try {
      const { data } = await api.get(`/orders/${order.orderNumber}/invoice`, { responseType: 'blob' });
      url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${order.orderNumber.replace(/^FMN-/, 'INV-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      // An error response to a blob request arrives as a Blob, so the API
      // client cannot read a message out of it.
      toast.error('Could not download the bill. Please try again.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={download} disabled={busy}>
      <DownloadIcon width={15} height={15} />
      {busy ? 'Preparing…' : 'Download bill'}
    </button>
  );
}
