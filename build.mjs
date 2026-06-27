import fs from 'fs';
import path from 'path';
fs.rmSync('dist',{recursive:true,force:true});
fs.mkdirSync('dist',{recursive:true});
const config = {
  supabaseUrl: process.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
};
let app = fs.readFileSync('src/app.js','utf8');
app = app.replace('__HH_CONFIG__', JSON.stringify(config));
fs.writeFileSync('dist/app.js', app);
for (const f of ['index.html','styles.css']) fs.copyFileSync(f, path.join('dist',f));
console.log('Built H&H Shop OS V2 schema-correct static app.');
