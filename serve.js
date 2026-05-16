// Local dev server for data/ — usage: node serve.js [port]
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2]) || 5500;
const ROOT = path.join(__dirname, 'data');
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  // Strip query string for file lookup
  const urlPath = req.url.split('?')[0];
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // Prevent path traversal
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Serving data/ on http://localhost:${PORT}`);
  console.log(`Open: http://localhost:${PORT}/?ip=192.168.178.70`);
});
