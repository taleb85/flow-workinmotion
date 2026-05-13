/**
 * Lettura QR da fotocamera (html5-qrcode). Richiede HTTPS o localhost.
 */
import { Html5Qrcode } from 'html5-qrcode';

let activeScanner: Html5Qrcode | null = null;

export async function stopActiveQrScanner(): Promise<void> {
  if (!activeScanner) return;
  try {
    if (activeScanner.isScanning) await activeScanner.stop();
  } catch {
    /* ignore */
  }
  try {
    await activeScanner.clear();
  } catch {
    /* ignore */
  }
  activeScanner = null;
}

/**
 * Avvia la fotocamera posteriore sul div `elementId` e risolve al primo QR decodificato.
 */
export function scanQrCodeFromCamera(elementId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const scanner = new Html5Qrcode(elementId, false);
    activeScanner = scanner;

    const finish = async (ok: boolean, result: string | Error) => {
      if (settled) return;
      settled = true;
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        /* ignore */
      }
      try {
        await scanner.clear();
      } catch {
        /* ignore */
      }
      if (activeScanner === scanner) activeScanner = null;
      if (ok && typeof result === 'string') resolve(result.trim());
      else reject(result instanceof Error ? result : new Error(String(result)));
    };

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decodedText) => {
          void finish(true, decodedText);
        },
        () => {}
      )
      .catch((err: unknown) => {
        void finish(false, err instanceof Error ? err : new Error(String(err)));
      });
  });
}
