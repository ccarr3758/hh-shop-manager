import React, { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, CalendarDays, Smartphone, ClipboardList, UserCheck, Wrench, Settings, Database, Plus, RefreshCw, Edit3, Trash2, Save, X } from 'lucide-react';
import { supabase } from './supabaseClient';

const nav = [
  ['Dashboard', LayoutDashboard], ['Schedule', CalendarDays], ['Foreman', Smartphone], ['Production Log', ClipboardList],
  ['Technicians', UserCheck], ['Products', Wrench], ['Admin', Settings], ['Cloud Status', Database]
];

const emptyState = () => ({ company:null, laborRates:[], technicians:[], categories:[], statuses:[], delayReasons:[], products:[], shopSettings:null, jobs:[] });
const shortTime = v => (v ? String(v).slice(0,5) : '08:00');
const money = v => Number(v||0).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0});
const effClass = v => !v ? '' : v >= 110 ? 'good' : v >= 85 ? 'warn' : 'bad';
const efficiency = j => j.actual_hours ? Number(j.book_hours||0)/Number(j.actual_hours)*100 : null;
const hexSoft = h => `${h || '#64748b'}1a`;
function formatTime(v){ const [h,m]=shortTime(v).split(':').map(Number); const d=new Date(); d.setHours(h,m,0,0); return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); }

async function fetchTable(table, companyId, order='created_at'){
  const { data, error } = await supabase.from(table).select('*').eq('company_id', companyId).order(order, { ascending:true });
  if(error) throw error; return data || [];
}
async function fetchJobs(companyId){
  const { data, error } = await supabase.from('jobs').select('*').eq('company_id', companyId).order('created_at', { ascending:false });
  if(error) throw error; return data || [];
}
function makeCtx(state){
  const product = id => state.products.find(p=>p.id===id);
  const category = id => state.categories.find(c=>c.id===id);
  const laborRate = id => state.laborRates.find(r=>r.id===id);
  const status = id => state.statuses.find(s=>s.id===id);
  const tech = id => state.technicians.find(t=>t.id===id);
  const isComplete = statusId => (status(statusId)?.name || '').toLowerCase().includes('complete');
  const laborSold = job => {
    const p = product(job.product_id);
    if(job.labor_sold) return Number(job.labor_sold);
    if(p?.labor_price && Number(p.book_hours) === Number(job.book_hours)) return Number(p.labor_price);
    const cat = category(p?.category_id);
    const rate = laborRate(cat?.labor_rate_id) || state.laborRates.find(r=>r.name === 'Standard Labor');
    if(rate?.rate_type === 'flat') return Number(rate.amount);
    return Number(job.book_hours || 0) * Number(rate?.amount || 0);
  };
  return {...state, product, category, laborRate, status, tech, isComplete, laborSold};
}
function calculateMetrics(jobs, ctx){
  const completed = jobs.filter(j=>ctx.isComplete(j.status_id) && j.actual_hours);
  const bookComplete = completed.reduce((a,j)=>a+Number(j.book_hours||0),0);
  const actualUsed = completed.reduce((a,j)=>a+Number(j.actual_hours||0),0);
  const laborSold = jobs.reduce((a,j)=>a+ctx.laborSold(j),0);
  const laborProduced = completed.reduce((a,j)=>a+ctx.laborSold(j),0);
  const activeTechs = Math.max(ctx.technicians.filter(t=>t.active).length, 1);
  const capacity = Math.min(100, Math.round((jobs.reduce((a,j)=>a+Number(j.book_hours||0),0)/(activeTechs*8))*100));
  return {bookComplete, actualUsed, laborSold, laborProduced, capacity, efficiency: actualUsed ? bookComplete/actualUsed*100 : 0};
}
function buildSlots(open, close){
  const [oh,om]=shortTime(open).split(':').map(Number); const [ch,cm]=shortTime(close).split(':').map(Number);
  let m=oh*60+om, end=ch*60+cm, out=[]; while(m<end){out.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`); m+=30;} return out;
}

export default function App(){
  const [view,setView]=useState('Dashboard');
  const [state,setState]=useState(emptyState());
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [showNew,setShowNew]=useState(false);

  async function loadAll(){
    setLoading(true); setError('');
    try{
      if(!supabase) throw new Error('Missing Vercel environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      const { data: company, error: companyError } = await supabase.from('companies').select('*').eq('name','H&H Truck & Outdoor').limit(1).single();
      if(companyError) throw companyError;
      const id = company.id;
      const [laborRates, technicians, categories, statuses, delayReasons, products, shopSettings, jobs] = await Promise.all([
        fetchTable('labor_rates', id), fetchTable('technicians', id), fetchTable('categories', id), fetchTable('statuses', id),
        fetchTable('delay_reasons', id), fetchTable('products', id), fetchTable('shop_settings', id), fetchJobs(id)
      ]);
      setState({company, laborRates, technicians, categories, statuses, delayReasons, products, shopSettings: shopSettings[0] || null, jobs});
    }catch(e){ console.error(e); setError(e.message || 'Could not load Supabase data.'); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{loadAll();},[]);
  useEffect(()=>{
    if(!supabase || !state.company?.id) return;
    const c = supabase.channel('hhpm-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'jobs',filter:`company_id=eq.${state.company.id}`}, loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'technicians',filter:`company_id=eq.${state.company.id}`}, loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'products',filter:`company_id=eq.${state.company.id}`}, loadAll)
      .subscribe();
    return ()=>supabase.removeChannel(c);
  },[state.company?.id]);

  const ctx = useMemo(()=>makeCtx(state),[state]);
  const metrics = useMemo(()=>calculateMetrics(state.jobs,ctx),[state.jobs,ctx]);

  if(loading) return <div className="loading"><div className="brandLogo">H&H</div><h2>Loading cloud data...</h2></div>;
  if(error) return <div className="errorScreen"><section className="panel errorPanel"><h1>Cloud connection issue</h1><p>{error}</p><button className="primary" onClick={loadAll}><RefreshCw size={18}/> Retry</button></section></div>;

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brandLogo">H&H</div><div><h1>Production Manager</h1><p>Live cloud shop command center</p></div></div>
      <nav>{nav.map(([name,Icon])=><button key={name} className={view===name?'active':''} onClick={()=>setView(name)}><Icon size={18}/><span>{name}</span></button>)}</nav>
      <div className="sideCard"><small>Cloud connected</small><strong>{state.company?.name}</strong><p>Supabase is now the source of truth.</p></div>
    </aside>
    <main>
      <header className="topbar"><div><p className="eyebrow">H&H Truck & Outdoor</p><h2>{view}</h2></div><div className="topActions"><button onClick={loadAll}><RefreshCw size={17}/> Refresh</button><button className="primary" onClick={()=>setShowNew(true)}><Plus size={18}/> New Job</button></div></header>
      {view==='Dashboard' && <Dashboard jobs={state.jobs} ctx={ctx} metrics={metrics}/>} 
      {view==='Schedule' && <Schedule jobs={state.jobs} ctx={ctx}/>} 
      {view==='Foreman' && <Foreman jobs={state.jobs} ctx={ctx} reload={loadAll}/>} 
      {view==='Production Log' && <ProductionLog jobs={state.jobs} ctx={ctx} reload={loadAll}/>} 
      {view==='Technicians' && <Technicians jobs={state.jobs} ctx={ctx}/>} 
      {view==='Products' && <Products ctx={ctx} reload={loadAll}/>} 
      {view==='Admin' && <Admin ctx={ctx} reload={loadAll}/>} 
      {view==='Cloud Status' && <CloudStatus state={state}/>} 
      {showNew && <NewJobModal ctx={ctx} reload={loadAll} onClose={()=>setShowNew(false)}/>} 
    </main>
  </div>
}

function Dashboard({jobs,ctx,metrics}){
  const open = jobs.filter(j=>!ctx.isComplete(j.status_id));
  return <section className="page"><div className="hero"><div><p className="eyebrow">Live production</p><h3>Today’s shop performance</h3><p>Updates are now backed by Supabase and shared across devices.</p></div><div className="heroMetric"><span>Shop efficiency</span><strong className={effClass(metrics.efficiency)}>{Math.round(metrics.efficiency)}%</strong></div></div>
  <div className="kpis"><Kpi title="Shop Capacity" value={`${metrics.capacity}%`} caption="Scheduled load"/><Kpi title="Labor Sold" value={money(metrics.laborSold)} caption="All jobs"/><Kpi title="Labor Produced" value={money(metrics.laborProduced)} caption="Completed jobs"/><Kpi title="Jobs In Progress" value={jobs.filter(j=>ctx.status(j.status_id)?.name==='In Progress').length} caption="Active now"/><Kpi title="Book Hours Complete" value={metrics.bookComplete.toFixed(1)} caption="Completed"/><Kpi title="Actual Hours Used" value={metrics.actualUsed.toFixed(1)} caption="Completed"/></div>
  <div className="grid two"><Panel title="Live shop board" chip="Open jobs"><div className="jobList">{open.length ? open.map(j=><JobCard key={j.id} job={j} ctx={ctx}/>) : <p className="muted">No open jobs.</p>}</div></Panel><Panel title="Efficiency leaders" chip="Completed"><TechLeaderboard jobs={jobs} ctx={ctx}/></Panel></div></section>
}
function Schedule({jobs,ctx}){
  const techs = ctx.technicians.filter(t=>t.active); const slots = buildSlots(ctx.shopSettings?.shop_open || '08:00', ctx.shopSettings?.shop_close || '18:00');
  return <section className="page"><Panel title="Technician schedule" chip="Today"><div className="schedule" style={{gridTemplateColumns:`86px repeat(${Math.max(techs.length,1)}, minmax(150px,1fr))`}}><div className="scheduleHead"/>{techs.map(t=><div key={t.id} className="scheduleHead">{t.name}</div>)}{slots.map(s=><React.Fragment key={s}><div className="timeCell">{formatTime(s)}</div>{techs.map(t=>{const js=jobs.filter(j=>j.technician_id===t.id && shortTime(j.start_time)===s); return <div className="slot" key={t.id+s}>{js.map(j=><div className="miniJob" key={j.id}>{ctx.product(j.product_id)?.name}<br/><b>{j.vehicle}</b></div>)}</div>})}</React.Fragment>)}</div></Panel></section>
}
function Foreman({jobs,ctx,reload}){
  const open=jobs.filter(j=>!ctx.isComplete(j.status_id)); const waiting=ctx.statuses.find(s=>s.name==='Waiting')?.id; const prog=ctx.statuses.find(s=>s.name==='In Progress')?.id; const comp=ctx.statuses.find(s=>s.name==='Completed')?.id;
  async function setStatus(job,status_id){ await supabase.from('jobs').update({status_id,updated_at:new Date().toISOString()}).eq('id',job.id); await reload(); }
  async function complete(job){ const actual=Number(prompt(`Actual hours for ${ctx.product(job.product_id)?.name}?`,job.book_hours)); if(!actual)return; await supabase.from('jobs').update({status_id:comp,actual_hours:actual,qc:'Yes',updated_at:new Date().toISOString()}).eq('id',job.id); await reload(); }
  return <section className="page"><div className="mobileHero"><p className="eyebrow">Foreman mode</p><h3>Fast floor updates</h3><p>Status changes now save directly to Supabase.</p></div><div className="cards3">{open.map(j=><div className="foremanCard" key={j.id}><StatusPill status={ctx.status(j.status_id)}/><h4>{ctx.product(j.product_id)?.name}</h4><p>{j.vehicle}<br/>{j.customer}<br/><b>{ctx.tech(j.technician_id)?.name}</b> • {formatTime(j.start_time)} • {j.book_hours} book hrs</p><div className="buttonGrid"><button onClick={()=>setStatus(j,waiting)}>Waiting</button><button onClick={()=>setStatus(j,prog)}>Start</button><button className="completeBtn" onClick={()=>complete(j)}>Complete</button></div></div>)}</div></section>
}
function ProductionLog({jobs,ctx,reload}){
  async function del(id){ if(!confirm('Delete this job?'))return; await supabase.from('jobs').delete().eq('id',id); await reload(); }
  return <section className="page"><Panel title="Production Log" chip={`${jobs.length} jobs`}><div className="table"><div className="row header"><span>Customer</span><span>Vehicle</span><span>Job</span><span>Tech</span><span>Status</span><span>Book</span><span>Actual</span><span>Eff.</span><span>Labor</span><span></span></div>{jobs.map(j=>{const eff=efficiency(j); return <div className="row" key={j.id}><b>{j.customer}</b><span>{j.vehicle}</span><span>{ctx.product(j.product_id)?.name}</span><span>{ctx.tech(j.technician_id)?.name}</span><StatusPill status={ctx.status(j.status_id)}/><span>{j.book_hours}</span><span>{j.actual_hours ?? '—'}</span><b className={effClass(eff)}>{eff?`${Math.round(eff)}%`:'—'}</b><b>{money(ctx.laborSold(j))}</b><button onClick={()=>del(j.id)}>Delete</button></div>})}</div></Panel></section>
}
function Technicians({jobs,ctx}){return <section className="page"><div className="cards3">{ctx.technicians.map(t=>{const complete=jobs.filter(j=>j.technician_id===t.id && ctx.isComplete(j.status_id)&&j.actual_hours); const book=complete.reduce((a,j)=>a+Number(j.book_hours||0),0), actual=complete.reduce((a,j)=>a+Number(j.actual_hours||0),0), eff=actual?book/actual*100:0, prod=complete.reduce((a,j)=>a+ctx.laborSold(j),0); return <div className="scoreCard" key={t.id}><div className="avatar">{t.name.slice(0,2)}</div><h3>{t.name}</h3><p className="muted">{t.role} • {t.active?'Active':'Inactive'}</p><div className="scoreGrid"><Metric label="Efficiency" value={`${Math.round(eff)}%`} className={effClass(eff)}/><Metric label="Goal" value={`${t.efficiency_goal||0}%`}/><Metric label="Book hrs" value={book.toFixed(1)}/><Metric label="Actual hrs" value={actual.toFixed(1)}/><Metric label="Produced" value={money(prod)}/></div></div>})}</div></section>}
function Products({ctx,reload}){const [editing,setEditing]=useState(null); async function del(id){if(!confirm('Delete product?'))return; await supabase.from('products').delete().eq('id',id); await reload();} return <section className="page"><Panel title="H&H Product / Labor Database" chip="Live"><div className="adminActions"><button className="primary" onClick={()=>setEditing({name:'',category_id:ctx.categories[0]?.id,book_hours:0,labor_price:0,notes:''})}><Plus size={16}/> Add Product</button></div><div className="table productTable"><div className="row header productRow"><span>Product</span><span>Category</span><span>Hours</span><span>Labor</span><span>Notes</span><span></span></div>{ctx.products.map(p=><div className="row productRow" key={p.id}><b>{p.name}</b><span>{ctx.category(p.category_id)?.name}</span><span>{p.book_hours}</span><b>{money(p.labor_price)}</b><span>{p.notes}</span><div className="rowActions"><button onClick={()=>setEditing(p)}>Edit</button><button onClick={()=>del(p.id)}>Delete</button></div></div>)}</div></Panel>{editing&&<ProductEditor product={editing} ctx={ctx} reload={reload} onClose={()=>setEditing(null)}/>}</section>}
function Admin({ctx,reload}){return <section className="page"><div className="adminHero"><p className="eyebrow">Administration</p><h3>Live cloud configuration</h3><p>These settings now save in Supabase.</p></div><div className="grid two"><EditableCloudList title="Technicians" table="technicians" items={ctx.technicians} reload={reload} companyId={ctx.company.id} type="technician"/><EditableCloudList title="Job Categories" table="categories" items={ctx.categories} reload={reload} companyId={ctx.company.id} type="category" extra={{laborRates:ctx.laborRates}}/><EditableCloudList title="Statuses" table="statuses" items={ctx.statuses} reload={reload} companyId={ctx.company.id} type="status"/><EditableCloudList title="Delay Reasons" table="delay_reasons" items={ctx.delayReasons} reload={reload} companyId={ctx.company.id} type="delay"/><EditableCloudList title="Labor Rates" table="labor_rates" items={ctx.laborRates} reload={reload} companyId={ctx.company.id} type="labor"/><ShopHours ctx={ctx} reload={reload}/></div></section>}
function EditableCloudList({title,table,items,reload,companyId,type,extra={}}){const [draft,setDraft]=useState(null); function add(){if(type==='technician')setDraft({name:'',role:'Technician',active:true,efficiency_goal:110}); if(type==='category')setDraft({name:'',color:'#2563eb',labor_rate_id:extra.laborRates[0]?.id}); if(type==='status')setDraft({name:'',color:'#2563eb',active:true}); if(type==='delay')setDraft({name:'',active:true}); if(type==='labor')setDraft({name:'',rate_type:'hourly',amount:140,active:true});} async function save(){const payload={...draft,company_id:companyId}; if(draft.id) await supabase.from(table).update(payload).eq('id',draft.id); else await supabase.from(table).insert(payload); setDraft(null); await reload();} async function del(id){if(!confirm(`Delete from ${title}?`))return; await supabase.from(table).delete().eq('id',id); await reload();} return <Panel title={title} chip={`${items.length}`}><div className="adminActions"><button className="primary" onClick={add}><Plus size={16}/> Add</button></div><div className="adminList">{items.map(i=><div className="adminItem" key={i.id}><div><b>{i.name}</b>{i.color&&<span className="colorDot" style={{background:i.color}}/>}{i.amount!==undefined&&<span className="muted"> {i.rate_type} • {money(i.amount)}</span>}{i.active===false&&<span className="muted"> inactive</span>}</div><div className="rowActions"><button onClick={()=>setDraft(i)}><Edit3 size={15}/></button><button onClick={()=>del(i.id)}>Delete</button></div></div>)}</div>{draft&&<AdminEditor item={draft} setItem={setDraft} onSave={save} onCancel={()=>setDraft(null)} type={type} extra={extra}/>}</Panel>}
function AdminEditor({item,setItem,onSave,onCancel,type,extra}){return <div className="inlineEditor"><label>Name<input value={item.name||''} onChange={e=>setItem({...item,name:e.target.value})}/></label>{type==='technician'&&<><label>Role<input value={item.role||''} onChange={e=>setItem({...item,role:e.target.value})}/></label><label>Efficiency Goal<input type="number" value={item.efficiency_goal||0} onChange={e=>setItem({...item,efficiency_goal:Number(e.target.value)})}/></label><label className="check"><input type="checkbox" checked={item.active??true} onChange={e=>setItem({...item,active:e.target.checked})}/> Active</label></>}{(type==='category'||type==='status')&&<label>Color<input type="color" value={item.color||'#2563eb'} onChange={e=>setItem({...item,color:e.target.value})}/></label>}{type==='category'&&<label>Labor Rate<select value={item.labor_rate_id} onChange={e=>setItem({...item,labor_rate_id:e.target.value})}>{extra.laborRates.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label>}{type==='labor'&&<><label>Type<select value={item.rate_type} onChange={e=>setItem({...item,rate_type:e.target.value})}><option>hourly</option><option>flat</option></select></label><label>Amount<input type="number" value={item.amount} onChange={e=>setItem({...item,amount:Number(e.target.value)})}/></label></>}<div className="buttonRow"><button className="primary" onClick={onSave}><Save size={15}/> Save</button><button onClick={onCancel}><X size={15}/> Cancel</button></div></div>}
function ProductEditor({product,ctx,onClose,reload}){const [draft,setDraft]=useState(product); async function save(){const payload={...draft,company_id:ctx.company.id,book_hours:Number(draft.book_hours||0),labor_price:Number(draft.labor_price||0)}; if(draft.id) await supabase.from('products').update(payload).eq('id',draft.id); else await supabase.from('products').insert(payload); onClose(); await reload();} return <div className="modalBackdrop"><div className="modal"><div className="modalHeader"><h3>Product</h3><button onClick={onClose}>×</button></div><div className="formGrid"><label>Product<input value={draft.name||''} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Category<select value={draft.category_id} onChange={e=>setDraft({...draft,category_id:e.target.value})}>{ctx.categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Book Hours<input type="number" step="0.25" value={draft.book_hours||0} onChange={e=>setDraft({...draft,book_hours:Number(e.target.value)})}/></label><label>Labor Price<input type="number" value={draft.labor_price||0} onChange={e=>setDraft({...draft,labor_price:Number(e.target.value)})}/></label><label className="fullWidth">Notes<input value={draft.notes||''} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></div><button className="primary wide" onClick={save}>Save Product</button></div></div>}
function ShopHours({ctx,reload}){const [draft,setDraft]=useState(ctx.shopSettings||{}); async function save(){if(draft.id) await supabase.from('shop_settings').update(draft).eq('id',draft.id); else await supabase.from('shop_settings').insert({...draft,company_id:ctx.company.id}); await reload();} return <Panel title="Shop Hours" chip="Schedule"><div className="formGrid"><label>Open<input type="time" value={shortTime(draft.shop_open||'08:00')} onChange={e=>setDraft({...draft,shop_open:e.target.value})}/></label><label>Close<input type="time" value={shortTime(draft.shop_close||'18:00')} onChange={e=>setDraft({...draft,shop_close:e.target.value})}/></label><label>Lunch Start<input type="time" value={shortTime(draft.lunch_start||'12:00')} onChange={e=>setDraft({...draft,lunch_start:e.target.value})}/></label><label>Lunch End<input type="time" value={shortTime(draft.lunch_end||'13:00')} onChange={e=>setDraft({...draft,lunch_end:e.target.value})}/></label></div><button className="primary wide" onClick={save}>Save Shop Hours</button></Panel>}
function CloudStatus({state}){return <section className="page"><Panel title="Cloud status" chip="Supabase"><div className="kpis"><Kpi title="Technicians" value={state.technicians.length} caption="Cloud rows"/><Kpi title="Products" value={state.products.length} caption="Cloud rows"/><Kpi title="Jobs" value={state.jobs.length} caption="Cloud rows"/><Kpi title="Company" value="Connected" caption={state.company?.name}/></div></Panel></section>}
function NewJobModal({ctx,reload,onClose}){const [productId,setProductId]=useState(ctx.products[0]?.id); const p=ctx.product(productId); async function submit(e){e.preventDefault(); const f=new FormData(e.currentTarget); const payload={company_id:ctx.company.id,customer:f.get('customer'),vehicle:f.get('vehicle'),product_id:productId,technician_id:f.get('technician_id'),status_id:f.get('status_id'),delay_reason_id:f.get('delay_reason_id'),start_time:f.get('start_time'),book_hours:Number(f.get('book_hours')),actual_hours:null,qc:f.get('qc'),scheduled_date:new Date().toISOString().slice(0,10),labor_sold:p?.labor_price||null}; await supabase.from('jobs').insert(payload); await reload(); onClose();} return <div className="modalBackdrop"><form className="modal" onSubmit={submit}><div className="modalHeader"><h3>New job</h3><button type="button" onClick={onClose}>×</button></div><div className="formGrid"><label>Customer<input name="customer" required/></label><label>Vehicle<input name="vehicle" required/></label><label>Product<select value={productId} onChange={e=>setProductId(e.target.value)}>{ctx.products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label>Technician<select name="technician_id">{ctx.technicians.filter(t=>t.active).map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label><label>Status<select name="status_id">{ctx.statuses.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>Delay reason<select name="delay_reason_id">{ctx.delayReasons.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label><label>QC<select name="qc"><option>Yes</option><option>No</option><option>N/A</option></select></label><label>Start<input name="start_time" type="time" defaultValue="08:00"/></label><label>Book hours<input name="book_hours" type="number" step="0.25" defaultValue={p?.book_hours||0}/></label></div><button className="primary wide">Add job</button></form></div>}function TechLeaderboard({ jobs, ctx }) {
  return (
    <div className="leaderList">
      {ctx.technicians.map((tech) => {
        const completed = jobs.filter(
          (j) => j.technician_id === tech.id && ctx.isComplete(j.status_id) && j.actual_hours
        );

        const book = completed.reduce((a, j) => a + Number(j.book_hours || 0), 0);
        const actual = completed.reduce((a, j) => a + Number(j.actual_hours || 0), 0);
        const eff = actual ? (book / actual) * 100 : 0;

        return (
          <div className="leader" key={tech.id}>
            <div>
              <b>{tech.name}</b>
              <span>{book.toFixed(1)} book / {actual.toFixed(1)} actual</span>
            </div>
            <strong className={effClass(eff)}>{Math.round(eff)}%</strong>
          </div>
        );
      })}
    </div>
  );
}
function Kpi({title,value,caption}){return <article className="kpi"><span>{title}</span><strong>{value}</strong><p>{caption}</p></article>}
function Panel({title,chip,children}){return <section className="panel"><div className="panelHead"><h3>{title}</h3><span>{chip}</span></div>{children}</section>}
function StatusPill({status}){return <span className="pill" style={{background:hexSoft(status?.color),color:status?.color}}>{status?.name||'Unknown'}</span>}
function Metric({label,value,className=''}){return <div className="metric"><span>{label}</span><strong className={className}>{value}</strong></div>}
