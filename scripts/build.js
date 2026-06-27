const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css']) fs.copyFileSync(path.join(root, 'src', name), path.join(dist, name));
const env = {
  SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
};
fs.writeFileSync(path.join(dist, 'env.js'), `window.HH_ENV = ${JSON.stringify(env, null, 2)};\n`);
console.log('Built dist with live Supabase env:', Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY));
