// Servidor local só pra testar (npm run dev). Na Vercel isso não é usado.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const rotas = {
  '/api/canais': (await import('./api/canais.js')).default,
  '/api/transferir': (await import('./api/transferir.js')).default,
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = rotas[url.pathname];

  if (!handler) {
    const html = await readFile(new URL('./public/index.html', import.meta.url));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  let corpo = '';
  for await (const parte of req) corpo += parte;
  req.query = Object.fromEntries(url.searchParams);
  req.body = corpo ? JSON.parse(corpo) : {};
  res.status = (s) => { res.statusCode = s; return res; };
  res.json = (d) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(d)); };
  handler(req, res);
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
