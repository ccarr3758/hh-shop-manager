const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', 'src');
const port = process.env.PORT || 5173;
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
http.createServer((req,res)=>{
  let file = req.url === '/' ? 'index.html' : req.url.split('?')[0].replace(/^\//,'');
  if (file === 'env.js') {
    const env = { SUPABASE_URL: process.env.VITE_SUPABASE_URL || '', SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '' };
    res.writeHead(200, {'content-type':'text/javascript'}); return res.end(`window.HH_ENV = ${JSON.stringify(env)};`);
  }
  const fp = path.join(root, file);
  if (!fp.startsWith(root) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, {'content-type': mime[path.extname(fp)] || 'text/plain'});
  fs.createReadStream(fp).pipe(res);
}).listen(port, ()=>console.log(`http://localhost:${port}`));
