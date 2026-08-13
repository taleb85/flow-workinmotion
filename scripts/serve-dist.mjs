/**
 * Server statico minimale per LHCI / CI (zero dipendenze).
 * - Serve i file da dist/ con il content-type corretto.
 * - SPA fallback: i path senza estensione file servono app.html
 *   (la build rinomina index.html → app.html, quindi niente index.html in dist).
 * - Ascolta su 127.0.0.1:4173 (evita i problemi di risoluzione IPv6 di localhost).
 *
 * Uso: node scripts/serve-dist.mjs   (PORT e HOST sovrascrivibili via env)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';
const DIST = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Evita path traversal: accetta solo path dentro dist/. */
function safePath(p) {
  const full = normalize(join(DIST, p));
  return full.startsWith(DIST) ? full : null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    let pathname = url.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    if (pathname === '/') pathname = '/app.html';

    const file = safePath(pathname);
    if (!file) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let target = file;
    try {
      const st = await stat(file);
      if (st.isDirectory()) target = join(file, 'app.html');
    } catch {
      /* non esiste → proviamo il fallback SPA */
    }

    let body = null;
    let servedFile = target;
    try {
      body = await readFile(target);
    } catch {
      if (!extname(pathname)) {
        try {
          servedFile = join(DIST, 'app.html');
          body = await readFile(servedFile);
        } catch {
          /* niente da servire */
        }
      }
    }

    if (body === null) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': MIME[extname(servedFile)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`serve-dist listening on http://${HOST}:${PORT}`);
});
