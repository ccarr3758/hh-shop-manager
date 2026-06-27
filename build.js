const fs=require('fs'); const path=require('path');
fs.rmSync('dist',{recursive:true,force:true}); fs.mkdirSync('dist',{recursive:true});
for(const f of ['index.html','styles.css','app.js']) fs.copyFileSync(path.join('src',f),path.join('dist',f));
const cfg=`window.SHOP_OS_CONFIG={SUPABASE_URL:${JSON.stringify(process.env.VITE_SUPABASE_URL||'')},SUPABASE_ANON_KEY:${JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY||'')}};`;
fs.writeFileSync('dist/config.js',cfg);
