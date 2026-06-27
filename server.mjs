import http from 'http'; import fs from 'fs'; import path from 'path';
const root='dist'; if(!fs.existsSync(root)){ await import('./build.mjs'); }
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer((req,res)=>{let p=req.url==='/'?'index.html':req.url.slice(1); p=path.join(root,p); if(!fs.existsSync(p)) p=path.join(root,'index.html'); res.setHeader('Content-Type',types[path.extname(p)]||'text/plain'); fs.createReadStream(p).pipe(res)}).listen(5173,()=>console.log('http://localhost:5173'));
