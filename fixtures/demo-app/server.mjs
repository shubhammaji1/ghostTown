import http from 'node:http';
import { pathToFileURL } from 'node:url';
export function createPlayground() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.end('ok');
      return;
    }
    if (url.pathname === '/api/error') {
      res.writeHead(500);
      res.end('Intentional fixture API failure');
      return;
    }
    if (url.pathname === '/missing') {
      res.writeHead(404);
      res.end('Missing page');
      return;
    }
    if (url.pathname === '/redirect') {
      res.writeHead(302, { location: 'http://example.com/' });
      res.end();
      return;
    }
    const fixed = url.searchParams.get('fixed') === '1';
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GhostTown Playground</title><style>
      body{font:16px system-ui;background:#111727;color:#e9eef9;max-width:800px;margin:40px auto;padding:24px}a{color:#72d5d0}input,button{display:block;padding:12px;margin:12px 0}nav{display:flex;gap:16px}.wide{width:900px}
      </style></head><body><h1>GhostTown Playground</h1><p>Controlled synthetic fixture. Registration is deliberately broken unless ?fixed=1.</p>
      <nav><a href="/">Home</a><a href="/register">Register</a><a href="/search">Search</a><a href="/missing">Broken link</a></nav>
      ${url.pathname === '/register' ? `<h2>Register</h2><form id="register"><label>Email<input id="email" type="email" required></label><label>Password<input id="password" type="password" required></label><button type="submit">Create account</button></form><p id="result" role="status"></p>` : ''}
      ${url.pathname === '/search' ? '<h2>Search</h2><input id="query" aria-label="Search"><button id="search">Search</button><p id="results"></p>' : ''}
      ${url.pathname === '/overflow' ? '<div class="wide">Intentional mobile overflow</div>' : ''}
      ${url.pathname === '/keyboard' ? '<div id="unreachable" onclick="this.textContent=\'Activated\'">Inaccessible control</div>' : ''}
      <script>
      document.querySelector('#register')?.addEventListener('submit',event=>{event.preventDefault();document.querySelector('#result').textContent=${fixed ? '"Account created"' : '"Processing…"'};});
      document.querySelector('#search')?.addEventListener('click',()=>{document.querySelector('#results').textContent='Found synthetic result';});
      if(location.pathname==='/exception') setTimeout(()=>{throw new Error('Seeded playground exception')},50);
      if(location.pathname==='/api-failure') fetch('/api/error');
      </script></body></html>`);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPlayground();
  server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1', () =>
    console.log('Playground: http://127.0.0.1:4173'),
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
