/**
 * Web NFC (NDEFReader) — principalmente Chrome su Android con HTTPS.
 */

export type NfcReadResult =
  | { ok: true; text: string }
  | { ok: false; error: 'unsupported' | 'denied' | 'empty' | 'unknown'; message?: string };

type NdefRecordLike = {
  recordType: string;
  encoding?: string;
  data?: ArrayBuffer;
};

function decodeNdefText(record: NdefRecordLike): string | null {
  try {
    if (record.recordType === 'text' && record.data) {
      const enc = record.encoding ?? 'utf-8';
      return new TextDecoder(enc).decode(record.data);
    }
    if (record.recordType === 'url' && record.data) {
      const dec = new TextDecoder();
      const raw = dec.decode(record.data).trim();
      if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
      return `https://${raw}`;
    }
    if (record.data && record.data.byteLength > 0) {
      const dec = new TextDecoder();
      const t = dec.decode(record.data).trim();
      return t || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function isNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

/**
 * Attende la lettura di un tag NFC (testo o URL nel primo record utile).
 */
export function readNfcTagOnce(): Promise<NfcReadResult> {
  if (!isNfcSupported()) {
    return Promise.resolve({ ok: false, error: 'unsupported' });
  }

  const NDEFReaderCtor = (window as unknown as { NDEFReader: new () => EventTarget & { scan(): Promise<void> } }).NDEFReader;

  return new Promise((resolve) => {
    let settled = false;
    let to: ReturnType<typeof setTimeout> | null = null;
    const finish = (r: NfcReadResult) => {
      if (settled) return;
      settled = true;
      if (to != null) clearTimeout(to);
      resolve(r);
    };

    try {
      const reader = new NDEFReaderCtor();

      reader.addEventListener('reading', (ev: Event) => {
        const e = ev as { message?: { records: NdefRecordLike[] } };
        const records = e.message?.records;
        if (!records?.length) {
          finish({ ok: false, error: 'empty' });
          return;
        }
        for (const rec of records) {
          const text = decodeNdefText(rec);
          if (text && text.trim()) {
            finish({ ok: true, text: text.trim() });
            return;
          }
        }
        finish({ ok: false, error: 'empty' });
      });

      reader.addEventListener('readingerror', () => {
        finish({ ok: false, error: 'unknown', message: 'readingerror' });
      });

      reader.scan().catch((err: unknown) => {
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
        if (name === 'NotAllowedError') {
          finish({ ok: false, error: 'denied' });
          return;
        }
        finish({ ok: false, error: 'unknown', message: err instanceof Error ? err.message : String(err) });
      });

      to = setTimeout(() => {
        finish({ ok: false, error: 'unknown', message: 'timeout' });
      }, 120_000);
    } catch (err) {
      finish({
        ok: false,
        error: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
