import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Database,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Settings,
  Smartphone,
  UserCheck,
  Wrench,
  Edit3,
  Save,
  X,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const nav = [
  ["Performance", BarChart3],
  ["Mobile Manager", Smartphone],
  ["Dashboard", LayoutDashboard],
  ["Schedule", CalendarDays],
  ["Foreman", Smartphone],
  ["Production Log", ClipboardList],
  ["Technicians", UserCheck],
  ["Products", Wrench],
  ["Admin", Settings],
  ["Cloud Status", Database],
];

export default function App() {
  const [view, setView] = useState("Mobile Manager");
  const [showNewJob, setShowNewJob] = useState(false);
  const [state, setState] = useState(emptyState());
  const [loading, setLoading] = useState(true);
  const [cloudError, setCloudError] = useState("");

  async function loadAll() {
    setLoading(true);
    setCloudError("");

    try {
      if (!supabase) {
        throw new Error("Supabase environment variables are missing.");
      }

      const company = await getCompany();
      const companyId = company.id;

      const [
        laborRates,
        technicians,
        categories,
        statuses,
        delayReasons,
        products,
        shopSettings,
        jobs,
      ] = await Promise.all([
        fetchTable("labor_rates", companyId),
        fetchTable("technicians", companyId),
        fetchTable("categories", companyId),
        fetchTable("statuses", companyId),
        fetchTable("delay_reasons", companyId),
        fetchTable("products", companyId),
        fetchTable("shop_settings", companyId),
        fetchJobs(companyId),
      ]);

      setState({
        company,
        laborRates,
        technicians,
        categories,
        statuses,
        delayReasons,
        products,
        shopSettings: shopSettings[0] || null,
        jobs,
      });
    } catch (err) {
      console.error(err);
      setCloudError(err.message || "Failed to load Supabase data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!supabase || !state.company?.id) return;

    const channel = supabase
      .channel("hhpm-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "technicians", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.company?.id]);

  const ctx = useMemo(() => makeContext(state), [state]);
  const metrics = useMemo(() => calculateMetrics(state.jobs, ctx), [state.jobs, ctx]);

  if (loading) {
    return (
      <div className="loading">
        <div className="brandLogo">H&H</div>
        <h2>Loading production manager...</h2>
      </div>
    );
  }

  if (cloudError) {
    return (
      <div className="errorScreen">
        <div className="panel errorPanel">
          <h1>Cloud connection issue</h1>
          <p>{cloudError}</p>
          <button className="primary" onClick={loadAll}>
            <RefreshCw size={18} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandLogo">H&H</div>
          <div>
            <h1>Production Manager</h1>
            <p>Live cloud shop command center</p>
          </div>
        </div>

        <nav>
          {nav.map(([name, Icon]) => (
          <button
  key={name}
  className={`sidebarButton ${view === name ? "active" : ""}`}
  onClick={() => setView(name)}
>
  <Icon size={18} />
  <span>{name}</span>
</button>
          ))}
        </nav>

        <div className="sideCard">
          <small>Cloud connected</small>
          <strong>{state.company?.name || "H&H"}</strong>
          <p>Jobs, techs, products, and admin settings load from Supabase.</p>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">H&H Truck & Outdoor</p>
            <h2>{view}</h2>
          </div>
          <div className="topActions">
            <button onClick={loadAll}>
              <RefreshCw size={17} /> Refresh
            </button>
            <button className="primary" onClick={() => setShowNewJob(true)}>
              <Plus size={18} /> New Job
            </button>
          </div>
        </header>

        {view === "Performance" && (
  <PerformanceCenter jobs={state.jobs} ctx={ctx} metrics={metrics} />
)}
        {view === "Mobile Manager" && (
          <MobileManager jobs={state.jobs} ctx={ctx} reload={loadAll} />
        )}
        {view === "Dashboard" && <Dashboard jobs={state.jobs} ctx={ctx} metrics={metrics} />}
        {view === "Schedule" && <Schedule jobs={state.jobs} ctx={ctx} />}
        {view === "Foreman" && <Foreman jobs={state.jobs} ctx={ctx} reload={loadAll} />}
        {view === "Production Log" && <ProductionLog jobs={state.jobs} ctx={ctx} reload={loadAll} />}
        {view === "Technicians" && <Technicians jobs={state.jobs} ctx={ctx} />}
        {view === "Products" && <Products ctx={ctx} reload={loadAll} />}
        {view === "Admin" && <Admin ctx={ctx} reload={loadAll} />}
        {view === "Cloud Status" && <CloudStatus state={state} />}

        {showNewJob && <NewJobModal onClose={() => setShowNewJob(false)} ctx={ctx} reload={loadAll} />}
      </main>
    </div>
  );
}

function MobileManager({ jobs, ctx, reload }) {
  const [filter, setFilter] = useState("Open");

  const openJobs = jobs.filter((j) => !ctx.isComplete(j.status_id));
  const shownJobs =
    filter === "Open"
      ? openJobs
      : jobs.filter((j) => ctx.status(j.status_id)?.name === filter);

  const getStatusId = (name) =>
    ctx.statuses.find((s) => s.name.toLowerCase() === name.toLowerCase())?.id;

  async function updateStatus(job, statusName) {
    const statusId = getStatusId(statusName);
    if (!statusId) return alert(`Missing status: ${statusName}`);

    const { error } = await supabase
      .from("jobs")
      .update({
        status_id: statusId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) return alert(error.message);
    await reload();
  }

  async function completeJob(job) {
    const actual = prompt("Actual hours used?", job.book_hours);
    if (!actual) return;

    const completedId = getStatusId("Completed");
    if (!completedId) return alert("Missing status: Completed");

    const { error } = await supabase
      .from("jobs")
      .update({
        status_id: completedId,
        actual_hours: Number(actual),
        qc: "Yes",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) return alert(error.message);
    await reload();
  }

  return (
    <section className="mobileApp">
      <header className="mobileAppHeader">
        <div>
          <p>H&H Production</p>
          <h1>Manager View</h1>
        </div>
        <strong>{openJobs.length}</strong>
      </header>

      <div className="mobileTabs">
        {["Open", "Scheduled", "In Progress", "Waiting", "QC"].map((x) => (
          <button
            key={x}
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
          >
            {x}
          </button>
        ))}
      </div>

      <div className="mobileJobList">
        {shownJobs.map((job) => {
          const product = ctx.product(job.product_id);
          const tech = ctx.tech(job.technician_id);
          const status = ctx.status(job.status_id);

          return (
            <article className="mobileJob" key={job.id}>
              <div className="mobileJobTop">
                <span
                  className="mobilePill"
                  style={{
                    background: `${status?.color || "#64748b"}22`,
                    color: status?.color || "#64748b",
                  }}
                >
                  {status?.name || "Unknown"}
                </span>
                <b>{tech?.name || "Unassigned"}</b>
              </div>

              <h2>{job.vehicle}</h2>
              <p>{product?.name || "Unknown Job"}</p>

              <div className="mobileMetaGrid">
                <div>
                  <span>Start</span>
                  <strong>{shortTime(job.start_time)}</strong>
                </div>
                <div>
                  <span>Book</span>
                  <strong>{job.book_hours} hrs</strong>
                </div>
                <div>
                  <span>Customer</span>
                  <strong>{job.customer}</strong>
                </div>
                <div>
                  <span>QC</span>
                  <strong>{job.qc || "N/A"}</strong>
                </div>
              </div>

              <div className="mobileActionGrid">
                <button onClick={() => updateStatus(job, "In Progress")}>Start</button>
                <button onClick={() => updateStatus(job, "Waiting")}>Waiting</button>
                <button onClick={() => updateStatus(job, "QC")}>QC</button>
                <button className="complete" onClick={() => completeJob(job)}>
                  Complete
                </button>
              </div>
            </article>
          );
        })}

        {!shownJobs.length && (
          <div className="mobileEmpty">
            <h2>No jobs here</h2>
            <p>Change tabs or add a new job from desktop.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Dashboard({ jobs, ctx, metrics }) {
  const openJobs = jobs.filter((j) => !ctx.isComplete(j.status_id));

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">Live production</p>
          <h3>Today’s shop performance</h3>
          <p>Every card reads from Supabase. Updates from another device sync back into this dashboard.</p>
        </div>
        <div className="heroMetric">
          <span>Shop efficiency</span>
          <strong className={effClass(metrics.efficiency)}>{Math.round(metrics.efficiency)}%</strong>
        </div>
      </div>

     <div className="kpis">
  <Kpi title="Shop Capacity" value={`${metrics.capacity}%`} caption="Scheduled load" />

  <Kpi
    title="Jobs Completed"
    value={metrics.completedJobs}
    caption="Completed jobs"
  />

  <Kpi
    title="Jobs In Progress"
    value={jobs.filter(j => ctx.status(j.status_id)?.name === "In Progress").length}
    caption="Currently working"
  />

  <Kpi
    title="Waiting Jobs"
    value={jobs.filter(j => ctx.status(j.status_id)?.name === "Waiting").length}
    caption="Needs attention"
  />

  <Kpi
    title="QC Queue"
    value={jobs.filter(j => ctx.status(j.status_id)?.name === "QC").length}
    caption="Awaiting inspection"
  />

  <Kpi
    title="Book Hours Complete"
    value={metrics.bookComplete.toFixed(1)}
    caption="Completed"
  />

  <Kpi
    title="Actual Hours Used"
    value={metrics.actualUsed.toFixed(1)}
    caption="Completed"
  />

  <Kpi
    title="Average Install Time"
    value={`${metrics.avgActualTime.toFixed(2)} hrs`}
    caption="Completed jobs"
  />

  <Kpi
    title="Shop Efficiency"
    value={`${Math.round(metrics.efficiency)}%`}
    caption="Overall"
  />
</div>

      <div className="grid two">
        <Panel title="Live shop board" chip="Open jobs">
          <div className="jobList">
            {openJobs.length ? (
              openJobs.map((job) => <JobCard key={job.id} job={job} ctx={ctx} />)
            ) : (
              <p className="muted">No open jobs.</p>
            )}
          </div>
        </Panel>
        <Panel title="Efficiency leaders" chip="Completed">
          <TechLeaderboard jobs={jobs} ctx={ctx} />
        </Panel>
      </div>
    </section>
  );
}

function Schedule({ jobs, ctx }) {
  const activeTechs = ctx.technicians.filter((t) => t.active);
  const times = buildTimeSlots(
    ctx.shopSettings?.shop_open || "08:00",
    ctx.shopSettings?.shop_close || "18:00"
  );

  return (
    <section className="page">
      <Panel title="Technician schedule" chip="Today">
        <div
          className="schedule"
          style={{ gridTemplateColumns: `86px repeat(${Math.max(activeTechs.length, 1)}, minmax(150px, 1fr))` }}
        >
          <div className="scheduleHead empty" />
          {activeTechs.map((tech) => (
            <div className="scheduleHead" key={tech.id}>
              {tech.name}
            </div>
          ))}

          {times.map((time) => (
            <React.Fragment key={time}>
              <div className="timeCell">{formatTime(time)}</div>
              {activeTechs.map((tech) => {
                const slotJobs = jobs.filter(
                  (j) => j.technician_id === tech.id && shortTime(j.start_time) === time
                );

                return (
                  <div className="slot" key={`${tech.id}-${time}`}>
                    {slotJobs.map((j) => (
                      <div
                        className="miniJob"
                        style={{ borderColor: ctx.category(ctx.product(j.product_id)?.category_id)?.color }}
                        key={j.id}
                      >
                        {ctx.product(j.product_id)?.name}
                        <br />
                        <b>{j.vehicle}</b>
                      </div>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function Foreman({ jobs, ctx, reload }) {
  const open = jobs.filter((j) => !ctx.isComplete(j.status_id));
  const inProgress = ctx.statuses.find((s) => s.name === "In Progress")?.id;
  const waiting = ctx.statuses.find((s) => s.name === "Waiting")?.id;
  const complete =
    ctx.statuses.find((s) => s.name === "Completed")?.id ||
    ctx.statuses.find((s) => s.name === "Complete")?.id;

  async function setStatus(job, statusId) {
    const { error } = await supabase
      .from("jobs")
      .update({ status_id: statusId, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    if (error) return alert(error.message);
    await reload();
  }

  async function completeJob(job) {
    const actual = Number(prompt(`Actual hours for ${ctx.product(job.product_id)?.name}?`, job.book_hours));
    if (!actual) return;

    const { error } = await supabase
      .from("jobs")
      .update({
        status_id: complete,
        actual_hours: actual,
        qc: "Yes",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) return alert(error.message);
    await reload();
  }

  return (
    <section className="page">
      <div className="mobileHero">
        <p className="eyebrow">Foreman mode</p>
        <h3>Fast floor updates</h3>
        <p>Updates write directly to Supabase.</p>
      </div>

      <div className="cards3">
        {open.map((job) => (
          <div className="foremanCard" key={job.id}>
            <StatusPill status={ctx.status(job.status_id)} />
            <h4>{ctx.product(job.product_id)?.name}</h4>
            <p>
              {job.vehicle}
              <br />
              {job.customer}
              <br />
              <b>{ctx.tech(job.technician_id)?.name}</b> • {formatTime(shortTime(job.start_time))} • {job.book_hours} book hrs
            </p>
            <div className="buttonGrid">
              {waiting && <button onClick={() => setStatus(job, waiting)}>Waiting</button>}
              {inProgress && <button onClick={() => setStatus(job, inProgress)}>Start</button>}
              {complete && (
                <button className="completeBtn" onClick={() => completeJob(job)}>
                  Complete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductionLog({ jobs, ctx, reload }) {
  async function deleteJob(id) {
    if (!confirm("Delete this job?")) return;

    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) return alert(error.message);

    await reload();
  }

  return (
    <section className="page">
      <Panel title="Production Log" chip={`${jobs.length} jobs`}>
        <div className="table">
          <div className="row header">
            <span>Customer</span>
            <span>Vehicle</span>
            <span>Job</span>
            <span>Tech</span>
            <span>Status</span>
            <span>Book</span>
            <span>Actual</span>
            <span>Eff.</span>
            <span>Labor</span>
            <span></span>
          </div>

          {jobs.map((j) => {
            const eff = efficiency(j);
            return (
              <div className="row" key={j.id}>
                <b>{j.customer}</b>
                <span>{j.vehicle}</span>
                <span>{ctx.product(j.product_id)?.name}</span>
                <span>{ctx.tech(j.technician_id)?.name}</span>
                <StatusPill status={ctx.status(j.status_id)} />
                <span>{j.book_hours}</span>
                <span>{j.actual_hours ?? "—"}</span>
                <b className={effClass(eff)}>{eff ? `${Math.round(eff)}%` : "—"}</b>
                <b>{money(ctx.laborSold(j))}</b>
                <button onClick={() => deleteJob(j.id)}>Delete</button>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}

function Technicians({ jobs, ctx }) {
  return (
    <section className="page">
      <div className="cards3">
        {ctx.technicians.map((tech) => {
          const techJobs = jobs.filter((j) => j.technician_id === tech.id);
          const completed = techJobs.filter((j) => ctx.isComplete(j.status_id) && j.actual_hours);
          const book = completed.reduce((a, j) => a + Number(j.book_hours || 0), 0);
          const actual = completed.reduce((a, j) => a + Number(j.actual_hours || 0), 0);
          const eff = actual ? (book / actual) * 100 : 0;
          const produced = completed.reduce((a, j) => a + ctx.laborSold(j), 0);

          return (
            <div className={`scoreCard ${!tech.active ? "inactive" : ""}`} key={tech.id}>
              <div className="avatar">{tech.name.slice(0, 2)}</div>
              <h3>{tech.name}</h3>
              <p className="muted">
                {tech.role} • {tech.active ? "Active" : "Inactive"}
              </p>
              <div className="scoreGrid">
                <Metric label="Efficiency" value={`${Math.round(eff)}%`} className={effClass(eff)} />
                <Metric label="Goal" value={`${tech.efficiency_goal || 0}%`} />
                <Metric label="Book hrs" value={book.toFixed(1)} />
                <Metric label="Actual hrs" value={actual.toFixed(1)} />
                <Metric label="Produced" value={money(produced)} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Products({ ctx, reload }) {
  const [editing, setEditing] = useState(null);

  async function remove(id) {
    if (!confirm("Delete this product?")) return;

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return alert(error.message);

    await reload();
  }

  return (
    <section className="page">
      <Panel title="H&H Product / Labor Database" chip="Live">
        <div className="adminActions">
          <button
            className="primary"
            onClick={() =>
              setEditing({
                name: "",
                category_id: ctx.categories[0]?.id,
                book_hours: 0,
                labor_price: 0,
                notes: "",
              })
            }
          >
            <Plus size={16} /> Add Product
          </button>
        </div>

        <div className="table productTable">
          <div className="row header productRow">
            <span>Product</span>
            <span>Category</span>
            <span>Hours</span>
            <span>Labor</span>
            <span>Notes</span>
            <span></span>
          </div>

          {ctx.products.map((p) => (
            <div className="row productRow" key={p.id}>
              <b>{p.name}</b>
              <span>{ctx.category(p.category_id)?.name}</span>
              <span>{p.book_hours}</span>
              <b>{money(p.labor_price)}</b>
              <span>{p.notes}</span>
              <div className="rowActions">
                <button onClick={() => setEditing(p)}>Edit</button>
                <button onClick={() => remove(p.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {editing && <ProductEditor product={editing} ctx={ctx} onClose={() => setEditing(null)} reload={reload} />}
    </section>
  );
}

function PerformanceCenter({ jobs, ctx, metrics }) {
  const activeTechs = ctx.technicians.filter((t) => t.active);
  const [selectedTechId, setSelectedTechId] = useState(activeTechs[0]?.id || "");

  useEffect(() => {
    if (!selectedTechId && activeTechs[0]?.id) setSelectedTechId(activeTechs[0].id);
  }, [selectedTechId, activeTechs]);

  const selectedTech = ctx.tech(selectedTechId) || activeTechs[0];
  const shopRows = buildProductPerformanceRows(jobs, ctx, null);
  const techRows = buildProductPerformanceRows(jobs, ctx, selectedTech?.id);

  return (
    <section className="page">
      <div className="performanceHero">
        <div>
          <p className="eyebrow">Performance Platform</p>
          <h3>Install times, efficiency, records, and shop averages</h3>
          <p>No labor dollars. This page measures execution, consistency, QC, and improvement.</p>
        </div>
        <div className="performanceHeroStats">
          <div>
            <span>Shop Efficiency</span>
            <strong className={effClass(metrics.efficiency)}>{Math.round(metrics.efficiency)}%</strong>
          </div>
          <div>
            <span>Avg Job Time</span>
            <strong>{metrics.avgActualTime.toFixed(2)}h</strong>
          </div>
          <div>
            <span>Completed</span>
            <strong>{metrics.completedJobs}</strong>
          </div>
        </div>
      </div>

      <div className="grid two">
        <Panel title="Technician Dashboard" chip={selectedTech?.name || "Select"}>
          <div className="techSelector">
            <label>
              Select Technician
              <select value={selectedTech?.id || ""} onChange={(e) => setSelectedTechId(e.target.value)}>
                {activeTechs.map((tech) => (
                  <option value={tech.id} key={tech.id}>
                    {tech.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedTech && <TechnicianDashboard technician={selectedTech} jobs={jobs} ctx={ctx} rows={techRows} />}
        </Panel>

        <Panel title="Shop Leaderboard" chip="Efficiency">
          <TechLeaderboard jobs={jobs} ctx={ctx} detailed />
        </Panel>
      </div>

      <Panel title="Average Job Times by Product" chip="Shop averages">
        <PerformanceTable rows={shopRows} emptyText="Complete jobs with actual hours to build shop averages." />
      </Panel>
    </section>
  );
}

function TechnicianDashboard({ technician, jobs, ctx, rows }) {
  const stats = getTechStats(jobs, ctx, technician.id);
  const records = rows
    .filter((r) => r.jobs > 0 && r.bestTime !== null)
    .sort((a, b) => a.bestTime - b.bestTime)
    .slice(0, 5);

  return (
    <div className="techDashboard">
      <div className="techHeaderCard">
        <div className="techAvatarLarge">{technician.name.slice(0, 2)}</div>
        <div>
          <h2>{technician.name}</h2>
          <p>{technician.role || "Technician"}</p>
        </div>
        <strong className={effClass(stats.efficiency)}>{Math.round(stats.efficiency)}%</strong>
      </div>

      <div className="techStatGrid">
        <MiniStat label="Jobs Completed" value={stats.completedJobs} />
        <MiniStat label="Book Hours" value={stats.bookHours.toFixed(1)} />
        <MiniStat label="Actual Hours" value={stats.actualHours.toFixed(1)} />
        <MiniStat label="Avg Job Time" value={`${stats.avgActual.toFixed(2)}h`} />
        <MiniStat label="QC Pass Rate" value={`${Math.round(stats.qcPassRate)}%`} />
        <MiniStat label="Goal" value={`${technician.efficiency_goal || 110}%`} />
      </div>

      <div className="recordsBox">
        <h3>Personal Records</h3>
        {records.length ? (
          records.map((r) => (
            <div className="recordRow" key={r.productId}>
              <span>{r.productName}</span>
              <strong>{r.bestTime.toFixed(2)}h</strong>
            </div>
          ))
        ) : (
          <p className="muted">No completed jobs with actual hours yet.</p>
        )}
      </div>

      <h3 className="sectionTitle">Average Job Times</h3>
      <PerformanceTable rows={rows} emptyText="This technician needs completed jobs with actual hours." compact />
    </div>
  );
}

function PerformanceTable({ rows, emptyText, compact = false }) {
  const filtered = rows.filter((r) => r.jobs > 0);

  if (!filtered.length) {
    return <p className="muted">{emptyText}</p>;
  }

  return (
    <div className={`performanceTable ${compact ? "compact" : ""}`}>
      <div className="perfRow perfHeader">
        <span>Product / Job</span>
        <span>Book</span>
        <span>Jobs</span>
        <span>Tech Avg</span>
        <span>Shop Avg</span>
        <span>Vs Book</span>
        <span>Vs Shop</span>
        <span>Best</span>
        <span>Last</span>
      </div>

      {filtered.map((row) => (
        <div className="perfRow" key={row.productId}>
          <strong>{row.productName}</strong>
          <span>{row.bookHours.toFixed(2)}</span>
          <span>{row.jobs}</span>
          <span>{formatNullableHours(row.techAvg)}</span>
          <span>{formatNullableHours(row.shopAvg)}</span>
          <span className={deltaClass(row.vsBook)}>{formatSigned(row.vsBook)}</span>
          <span className={deltaClass(row.vsShop)}>{formatSigned(row.vsShop)}</span>
          <span>{formatNullableHours(row.bestTime)}</span>
          <span>{formatNullableHours(row.lastActual)}</span>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="miniStat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// 8) Add these helper functions near the bottom:
function getTechStats(jobs, ctx, technicianId) {
  const completed = jobs.filter(
    (j) => j.technician_id === technicianId && ctx.isComplete(j.status_id) && Number(j.actual_hours) > 0
  );

  const bookHours = completed.reduce((a, j) => a + Number(j.book_hours || 0), 0);
  const actualHours = completed.reduce((a, j) => a + Number(j.actual_hours || 0), 0);
  const qcPassed = completed.filter((j) => (j.qc || "").toLowerCase() === "yes").length;

  return {
    completedJobs: completed.length,
    bookHours,
    actualHours,
    efficiency: actualHours ? (bookHours / actualHours) * 100 : 0,
    avgActual: completed.length ? actualHours / completed.length : 0,
    qcPassRate: completed.length ? (qcPassed / completed.length) * 100 : 0,
  };
}

function buildProductPerformanceRows(jobs, ctx, technicianId = null) {
  const completed = jobs.filter((j) => ctx.isComplete(j.status_id) && Number(j.actual_hours) > 0);

  return ctx.products.map((product) => {
    const productJobs = completed.filter((j) => j.product_id === product.id);
    const techJobs = technicianId ? productJobs.filter((j) => j.technician_id === technicianId) : productJobs;

    const shopAvg = avg(productJobs.map((j) => Number(j.actual_hours)));
    const techAvg = avg(techJobs.map((j) => Number(j.actual_hours)));
    const bestTime = minOrNull(techJobs.map((j) => Number(j.actual_hours)));
    const lastJob = [...techJobs].sort(
      (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
    )[0];

    return {
      productId: product.id,
      productName: product.name,
      bookHours: Number(product.book_hours || 0),
      jobs: techJobs.length,
      techAvg,
      shopAvg,
      vsBook: techAvg === null ? null : Number(product.book_hours || 0) - techAvg,
      vsShop: techAvg === null || shopAvg === null ? null : shopAvg - techAvg,
      bestTime,
      lastActual: lastJob ? Number(lastJob.actual_hours) : null,
    };
  });
}

function avg(values) {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function minOrNull(values) {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!clean.length) return null;
  return Math.min(...clean);
}

function formatNullableHours(value) {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function formatSigned(value) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function deltaClass(value) {
  if (value === null || value === undefined) return "";
  return value >= 0 ? "good" : "bad";
}

// 9) In ProductionLog, remove the labor column and replace it with QC.
// Header should end like:
// <span>Eff.</span>
// <span>QC</span>
// <span></span>
//
// Row should end like:
// <b className={effClass(eff)}>{eff ? `${Math.round(eff)}%` : "—"}</b>
// <span>{j.qc || "N/A"}</span>
// <button onClick={() => deleteJob(j.id)}>Delete</button>

function Admin({ ctx, reload }) {
  return (
    <section className="page">
      <div className="adminHero">
        <p className="eyebrow">Administration</p>
        <h3>Live cloud configuration</h3>
        <p>Technicians, categories, statuses, delay reasons, labor rates, and shop hours are stored in Supabase.</p>
      </div>

      <div className="grid two">
        <EditableCloudList title="Technicians" table="technicians" items={ctx.technicians} reload={reload} companyId={ctx.company.id} type="technician" />
        <EditableCloudList title="Job Categories" table="categories" items={ctx.categories} reload={reload} companyId={ctx.company.id} type="category" extra={{ laborRates: ctx.laborRates }} />
        <EditableCloudList title="Statuses" table="statuses" items={ctx.statuses} reload={reload} companyId={ctx.company.id} type="status" />
        <EditableCloudList title="Delay Reasons" table="delay_reasons" items={ctx.delayReasons} reload={reload} companyId={ctx.company.id} type="delay" />
        <EditableCloudList title="Labor Rates" table="labor_rates" items={ctx.laborRates} reload={reload} companyId={ctx.company.id} type="labor" />
        <ShopHours ctx={ctx} reload={reload} />
      </div>
    </section>
  );
}

function EditableCloudList({ title, table, items, reload, companyId, type, extra = {} }) {
  const [draft, setDraft] = useState(null);

  function newItem() {
    if (type === "technician") setDraft({ name: "", role: "Technician", active: true, efficiency_goal: 110 });
    if (type === "category") setDraft({ name: "", color: "#2563eb", labor_rate_id: extra.laborRates[0]?.id });
    if (type === "status") setDraft({ name: "", color: "#2563eb", active: true });
    if (type === "delay") setDraft({ name: "", active: true });
    if (type === "labor") setDraft({ name: "", rate_type: "hourly", amount: 140, active: true });
  }

  async function save() {
    const payload = { ...draft, company_id: companyId };

    const { error } = draft.id
      ? await supabase.from(table).update(payload).eq("id", draft.id)
      : await supabase.from(table).insert(payload);

    if (error) return alert(error.message);

    setDraft(null);
    await reload();
  }

  async function remove(id) {
    if (!confirm(`Delete from ${title}?`)) return;

    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return alert(error.message);

    await reload();
  }

  return (
    <Panel title={title} chip={`${items.length}`}>
      <div className="adminActions">
        <button className="primary" onClick={newItem}>
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="adminList">
        {items.map((item) => (
          <div className="adminItem" key={item.id}>
            <div>
              <b>{item.name}</b>
              {item.color && <span className="colorDot" style={{ background: item.color }} />}
              {item.amount !== undefined && (
                <span className="muted">
                  {" "}
                  {item.rate_type} • {money(item.amount)}
                </span>
              )}
              {item.active === false && <span className="muted"> inactive</span>}
            </div>
            <div className="rowActions">
              <button onClick={() => setDraft(item)}>
                <Edit3 size={15} />
              </button>
              <button onClick={() => remove(item.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {draft && <AdminEditor item={draft} setItem={setDraft} onSave={save} onCancel={() => setDraft(null)} type={type} extra={extra} />}
    </Panel>
  );
}

function AdminEditor({ item, setItem, onSave, onCancel, type, extra }) {
  return (
    <div className="inlineEditor">
      <label>
        Name
        <input value={item.name || ""} onChange={(e) => setItem({ ...item, name: e.target.value })} />
      </label>

      {type === "technician" && (
        <>
          <label>
            Role
            <input value={item.role || ""} onChange={(e) => setItem({ ...item, role: e.target.value })} />
          </label>
          <label>
            Efficiency Goal
            <input type="number" value={item.efficiency_goal || 0} onChange={(e) => setItem({ ...item, efficiency_goal: Number(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={item.active ?? true} onChange={(e) => setItem({ ...item, active: e.target.checked })} /> Active
          </label>
        </>
      )}

      {(type === "category" || type === "status") && (
        <label>
          Color
          <input type="color" value={item.color || "#2563eb"} onChange={(e) => setItem({ ...item, color: e.target.value })} />
        </label>
      )}

      {type === "category" && (
        <label>
          Labor Rate
          <select value={item.labor_rate_id || ""} onChange={(e) => setItem({ ...item, labor_rate_id: e.target.value })}>
            {extra.laborRates.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {type === "labor" && (
        <>
          <label>
            Type
            <select value={item.rate_type || "hourly"} onChange={(e) => setItem({ ...item, rate_type: e.target.value })}>
              <option>hourly</option>
              <option>flat</option>
            </select>
          </label>
          <label>
            Amount
            <input type="number" value={item.amount || 0} onChange={(e) => setItem({ ...item, amount: Number(e.target.value) })} />
          </label>
        </>
      )}

      <div className="buttonRow">
        <button className="primary" onClick={onSave}>
          <Save size={15} /> Save
        </button>
        <button onClick={onCancel}>
          <X size={15} /> Cancel
        </button>
      </div>
    </div>
  );
}

function ProductEditor({ product, ctx, onClose, reload }) {
  const [draft, setDraft] = useState(product);

  async function save() {
    const payload = {
      ...draft,
      company_id: ctx.company.id,
      book_hours: Number(draft.book_hours || 0),
      labor_price: Number(draft.labor_price || 0),
    };

    const { error } = draft.id
      ? await supabase.from("products").update(payload).eq("id", draft.id)
      : await supabase.from("products").insert(payload);

    if (error) return alert(error.message);

    onClose();
    await reload();
  }

  return (
    <div className="modalBackdrop">
      <div className="modal">
        <div className="modalHeader">
          <h3>Product</h3>
          <button onClick={onClose}>×</button>
        </div>

        <div className="formGrid">
          <label>
            Product
            <input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label>
            Category
            <select value={draft.category_id || ""} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}>
              {ctx.categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Book Hours
            <input type="number" step="0.25" value={draft.book_hours || 0} onChange={(e) => setDraft({ ...draft, book_hours: Number(e.target.value) })} />
          </label>
          <label>
            Labor Price
            <input type="number" value={draft.labor_price || 0} onChange={(e) => setDraft({ ...draft, labor_price: Number(e.target.value) })} />
          </label>
          <label className="fullWidth">
            Notes
            <input value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
        </div>

        <button className="primary wide" onClick={save}>
          Save Product
        </button>
      </div>
    </div>
  );
}

function ShopHours({ ctx, reload }) {
  const [draft, setDraft] = useState(ctx.shopSettings || {});

  async function save() {
    const { error } = draft.id
      ? await supabase.from("shop_settings").update(draft).eq("id", draft.id)
      : await supabase.from("shop_settings").insert({ ...draft, company_id: ctx.company.id });

    if (error) return alert(error.message);

    await reload();
  }

  return (
    <Panel title="Shop Hours" chip="Schedule">
      <div className="formGrid">
        <label>
          Open
          <input type="time" value={shortTime(draft.shop_open || "08:00")} onChange={(e) => setDraft({ ...draft, shop_open: e.target.value })} />
        </label>
        <label>
          Close
          <input type="time" value={shortTime(draft.shop_close || "18:00")} onChange={(e) => setDraft({ ...draft, shop_close: e.target.value })} />
        </label>
        <label>
          Lunch Start
          <input type="time" value={shortTime(draft.lunch_start || "12:00")} onChange={(e) => setDraft({ ...draft, lunch_start: e.target.value })} />
        </label>
        <label>
          Lunch End
          <input type="time" value={shortTime(draft.lunch_end || "13:00")} onChange={(e) => setDraft({ ...draft, lunch_end: e.target.value })} />
        </label>
      </div>

      <button className="primary wide" onClick={save}>
        Save Shop Hours
      </button>
    </Panel>
  );
}

function CloudStatus({ state }) {
  return (
    <section className="page">
      <Panel title="Cloud status" chip="Supabase">
        <div className="kpis">
          <Kpi title="Technicians" value={state.technicians.length} caption="Loaded from cloud" />
          <Kpi title="Products" value={state.products.length} caption="Loaded from cloud" />
          <Kpi title="Jobs" value={state.jobs.length} caption="Loaded from cloud" />
          <Kpi title="Company" value="Connected" caption={state.company?.name} />
        </div>
      </Panel>
    </section>
  );
}

function NewJobModal({ onClose, ctx, reload }) {
  const [productId, setProductId] = useState(ctx.products[0]?.id || "");
  const product = ctx.product(productId);

  async function submit(e) {
    e.preventDefault();

    const form = new FormData(e.currentTarget);

    const job = {
      company_id: ctx.company.id,
      customer: form.get("customer"),
      vehicle: form.get("vehicle"),
      product_id: productId,
      technician_id: form.get("technician_id"),
      status_id: form.get("status_id"),
      delay_reason_id: form.get("delay_reason_id"),
      start_time: form.get("start_time"),
      book_hours: Number(form.get("book_hours")),
      actual_hours: null,
      qc: form.get("qc"),
      scheduled_date: new Date().toISOString().slice(0, 10),
      labor_sold: product?.labor_price || null,
    };

    const { error } = await supabase.from("jobs").insert(job);
    if (error) return alert(error.message);

    await reload();
    onClose();
  }

  return (
    <div className="modalBackdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modalHeader">
          <h3>New job</h3>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="formGrid">
          <label>
            Customer
            <input name="customer" required />
          </label>
          <label>
            Vehicle
            <input name="vehicle" required />
          </label>
          <label>
            Product
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              {ctx.products.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Technician
            <select name="technician_id">
              {ctx.technicians
                .filter((t) => t.active)
                .map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Status
            <select name="status_id">
              {ctx.statuses.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Delay reason
            <select name="delay_reason_id">
              {ctx.delayReasons.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            QC
            <select name="qc">
              <option>Yes</option>
              <option>No</option>
              <option>N/A</option>
            </select>
          </label>
          <label>
            Start
            <input name="start_time" type="time" defaultValue="08:00" />
          </label>
          <label>
            Book hours
            <input name="book_hours" type="number" step="0.25" defaultValue={product?.book_hours || 0} />
          </label>
        </div>

        <button className="primary wide">Add job</button>
      </form>
    </div>
  );
}

function Kpi({ title, value, caption }) {
  return (
    <article className="kpi">
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </article>
  );
}

function Panel({ title, chip, children }) {
  return (
    <section className="panel">
      <div className="panelHead">
        <h3>{title}</h3>
        <span>{chip}</span>
      </div>
      {children}
    </section>
  );
}

function JobCard({ job, ctx }) {
  const product = ctx.product(job.product_id);
  const tech = ctx.tech(job.technician_id);
  const status = ctx.status(job.status_id);
  const eff = efficiency(job);

  return (
    <article className="jobCard" style={{ borderLeftColor: status?.color || "#f59e0b" }}>
      <div>
        <h4>
          {product?.name} — {job.vehicle}
        </h4>
        <p>
          {job.customer} • {tech?.name} • {formatTime(shortTime(job.start_time))} • {job.book_hours} book hrs • {money(ctx.laborSold(job))}
        </p>
        <div className="chips">
          <span>Actual: {job.actual_hours ?? "Open"}</span>
          <span className={effClass(eff)}>Efficiency: {eff ? `${Math.round(eff)}%` : "—"}</span>
        </div>
      </div>
      <StatusPill status={status} />
    </article>
  );
}

function StatusPill({ status }) {
  return (
    <span className="pill" style={{ background: hexToSoft(status?.color), color: status?.color }}>
      {status?.name || "Unknown"}
    </span>
  );
}

function TechLeaderboard({ jobs, ctx, detailed = false }) {
  const rows = ctx.technicians
    .map((tech) => ({ tech, stats: getTechStats(jobs, ctx, tech.id) }))
    .sort((a, b) => b.stats.efficiency - a.stats.efficiency);

  return (
    <div className="leaderList">
      {rows.map(({ tech, stats }, index) => (
        <div className="leader" key={tech.id}>
          <div>
            <b>
              #{index + 1} {tech.name}
            </b>
            <span>
              {stats.bookHours.toFixed(1)} book / {stats.actualHours.toFixed(1)} actual
              {detailed ? ` • ${stats.completedJobs} jobs • avg ${stats.avgActual.toFixed(2)}h` : ""}
            </span>
          </div>
          <strong className={effClass(stats.efficiency)}>{Math.round(stats.efficiency)}%</strong>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, className = "" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={className}>{value}</strong>
    </div>
  );
}

async function getCompany() {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("name", "H&H Truck & Outdoor")
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

async function fetchTable(table, companyId) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchJobs(companyId) {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function calculateMetrics(jobs, ctx) {
  const completed = jobs.filter((j) => ctx.isComplete(j.status_id) && Number(j.actual_hours) > 0);
  const bookComplete = completed.reduce((a, j) => a + Number(j.book_hours || 0), 0);
  const actualUsed = completed.reduce((a, j) => a + Number(j.actual_hours || 0), 0);

  return {
    capacity: Math.min(
      100,
      Math.round(
        (jobs.reduce((a, j) => a + Number(j.book_hours || 0), 0) /
          (ctx.technicians.filter((t) => t.active).length * 8 || 1)) *
          100
      )
    ),
    efficiency: actualUsed ? (bookComplete / actualUsed) * 100 : 0,
    completedJobs: completed.length,
    bookComplete,
    actualUsed,
    avgActualTime: completed.length ? actualUsed / completed.length : 0,
  };
}


function makeContext(state) {
  const product = (id) => state.products.find((p) => p.id === id);
  const category = (id) => state.categories.find((c) => c.id === id);
  const laborRate = (id) => state.laborRates.find((r) => r.id === id);
  const status = (id) => state.statuses.find((s) => s.id === id);
  const tech = (id) => state.technicians.find((t) => t.id === id);
  const isComplete = (statusId) => (status(statusId)?.name || "").toLowerCase().includes("complete");

  const laborSold = (job) => {
    const p = product(job.product_id);
    if (job.labor_sold) return Number(job.labor_sold);
    if (p?.labor_price && Number(p.book_hours) === Number(job.book_hours)) return Number(p.labor_price);

    const cat = category(p?.category_id);
    const rate =
      laborRate(cat?.labor_rate_id) ||
      state.laborRates.find((r) => r.name === "Standard Labor");

    if (rate?.rate_type === "flat") return Number(rate.amount);
    return Number(job.book_hours || 0) * Number(rate?.amount || 0);
  };

  return {
    ...state,
    product,
    category,
    laborRate,
    status,
    tech,
    isComplete,
    laborSold,
  };
}

function emptyState() {
  return {
    company: null,
    laborRates: [],
    technicians: [],
    categories: [],
    statuses: [],
    delayReasons: [],
    products: [],
    shopSettings: null,
    jobs: [],
  };
}

function buildTimeSlots(open, close) {
  const [oh, om] = shortTime(open).split(":").map(Number);
  const [ch, cm] = shortTime(close).split(":").map(Number);
  const slots = [];
  let minutes = oh * 60 + om;
  const end = ch * 60 + cm;

  while (minutes < end) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    minutes += 30;
  }

  return slots;
}

function shortTime(value) {
  if (!value) return "08:00";
  return String(value).slice(0, 5);
}

function efficiency(job) {
  return job.actual_hours ? (Number(job.book_hours || 0) / Number(job.actual_hours)) * 100 : null;
}

function effClass(value) {
  if (!value) return "";
  if (value >= 110) return "good";
  if (value >= 85) return "warn";
  return "bad";
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatTime(value) {
  const [h, m] = shortTime(value).split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hexToSoft(hex = "#64748b") {
  return `${hex}1a`;
}
