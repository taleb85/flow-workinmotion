/**
 * Generazione QR per verifica presenza fisica (timbratura).
 */
import QRCode from 'qrcode';

export async function generatePresenceQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

export function openPresenceQrPrintWindow(dataUrl: string, subtitle: string): void {
  const w = window.open('', '_blank', 'width=560,height=720');
  if (!w) return;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>QR — Osteria Basilico</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; color: #0f172a; }
    img { max-width: 100%; height: auto; }
    p { margin-top: 16px; font-size: 14px; color: #64748b; }
  </style></head><body>
  <h1 style="font-size:18px;margin-bottom:8px;">Osteria Basilico</h1>
  <img src="${dataUrl}" alt="QR verifica presenza" width="400" height="400"/>
  <p>${subtitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},300);});</script>
  </body></html>`;
  w.document.write(html);
  w.document.close();
}
