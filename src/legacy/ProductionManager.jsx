import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Database,
  Edit3,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Smartphone,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "../supabaseClient";

const nav = [
  ["Performance", BarChart3],
  ["Mobile Manager", Smartphone],
  ["Dashboard", LayoutDashboard],
  ["Schedule", CalendarDays],
  ["Outlook Calendar", CalendarDays],
  ["Foreman", Smartphone],
  ["Production Log", ClipboardList],
  ["Technicians", UserCheck],
  ["Tech Clock", UserCheck],
  ["Products", Wrench],
  ["Admin", Settings],
  ["Cloud Status", Database],
];

export default function ProductionManager({ authProfile, onSignOut }) {
  const [view, setView] = useState("Dashboard");
  const [showNewJob, setShowNewJob] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [state, setState] = useState(emptyState());
  const [loading, setLoading] = useState(true);
  const [cloudError, setCloudError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const access = useMemo(() => makeAccessFromProfile(authProfile), [authProfile]);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function loadAll() {
    setLoading(true);
    setCloudError("");

    try {
      if (!supabase) {
        throw new Error("Supabase environment variables are missing.");
      }

      const company = await getCompany(authProfile);
      const companyId = company.id;

      let [
        laborRates,
        technicians,
        categories,
        statuses,
        delayReasons,
        products,
        shopSettings,
        jobs,
        jobProducts,
        jobHelpersResult,
        technicianAttendanceResult,
      ] = await Promise.all([
        fetchTable("labor_rates", companyId),
        fetchTable("technicians", companyId),
        fetchTable("categories", companyId),
        fetchTable("statuses", companyId),
        fetchTable("delay_reasons", companyId),
        fetchTable("products", companyId),
        fetchTable("shop_settings", companyId),
        fetchJobs(companyId),
        fetchTable("job_products", companyId),
        fetchOptionalJobHelpers(companyId),
        fetchOptionalTechnicianAttendance(companyId),
      ]);

      jobs = await rollForwardOverdueJobs(companyId, jobs, statuses);

      setState({
        company,
        laborRates,
        technicians,
        categories,
        statuses,
        delayReasons,
        products,
        jobProducts,
        jobHelpers: jobHelpersResult || [],
        technicianAttendance: technicianAttendanceResult || [],
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_products", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_helpers", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "technician_attendance", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.company?.id]);

  const ctx = useMemo(() => makeContext(state), [state]);
  const allowedViewNames = useMemo(() => getAllowedViewNames(access), [access]);
  const visibleJobs = useMemo(() => filterJobsForAccess(state.jobs, access), [state.jobs, access]);
  const dailyJobs = useMemo(() => jobsForDate(visibleJobs, selectedDate), [visibleJobs, selectedDate]);
  const metrics = useMemo(() => calculateMetrics(dailyJobs, ctx, selectedDate), [dailyJobs, ctx, selectedDate]);

  useEffect(() => {
    if (!allowedViewNames.includes(view)) setView(allowedViewNames[0] || "Mobile Manager");
  }, [allowedViewNames, view]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

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

  if (!access) {
    return <div className="errorScreen"><div className="panel errorPanel"><h1>No access profile</h1><p>This user does not have an active role assigned.</p></div></div>;
  }

  return (
    <div className={`app ${isMobile ? "phoneShell" : ""}`}>
      <MobileStyles />
      {!isMobile && (
      <aside className="sidebar">
        <div className="brand">
          <div className="brandLogo">H&H</div>
          <div>
            <h1>Production Manager</h1>
            <p>Live cloud shop command center</p>
          </div>
        </div>

        <nav>
          {nav.filter(([name]) => allowedViewNames.includes(name)).map(([name, Icon]) => (
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
          <small>Signed in as</small>
          <strong>{authProfile?.full_name || authProfile?.email || "Shop User"}</strong>
          <p>{state.company?.name || "H&H"} • {String(access?.role || "").replace("_", " ")}</p>
          <button onClick={onSignOut}>Sign Out</button>
        </div>
      </aside>
      )}

      <main className={isMobile ? "phoneMain" : ""}>
        {isMobile ? (
          <header className="phoneHeader">
            <div>
              <p className="eyebrow">H&H Truck & Outdoor</p>
              <h2>{view}</h2>
              <input className="phoneDatePicker" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button className="phoneIconButton" onClick={loadAll} aria-label="Refresh">
                <RefreshCw size={20} />
              </button>
              <button className="phoneIconButton" onClick={onSignOut} aria-label="Sign out" style={{ fontSize: 11, fontWeight: 900 }}>
                Out
              </button>
            </div>
          </header>
        ) : (
          <header className="topbar">
            <div>
              <p className="eyebrow">H&H Truck & Outdoor</p>
              <h2>{view}</h2>
            </div>
            <div className="topActions">
              <input className="datePicker" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              <button onClick={loadAll}>
                <RefreshCw size={17} /> Refresh
              </button>
              <button onClick={onSignOut}>Sign Out</button>
              <button className="primary" onClick={() => setShowNewJob(true)}>
                <Plus size={18} /> New Job
              </button>
            </div>
          </header>
        )}

        {view === "Performance" && (
  <PerformanceCenter jobs={visibleJobs} ctx={ctx} metrics={metrics} />
)}
        {view === "Mobile Manager" && (
          <MobileManager jobs={dailyJobs} ctx={ctx} reload={loadAll} setEditingJob={setEditingJob} selectedDate={selectedDate} />
        )}
        {view === "Dashboard" && <Dashboard jobs={dailyJobs} allJobs={visibleJobs} ctx={ctx} metrics={metrics} selectedDate={selectedDate} />}
        {view === "Schedule" && <Schedule jobs={dailyJobs} ctx={ctx} selectedDate={selectedDate} />}
        {view === "Outlook Calendar" && <OutlookCalendar jobs={visibleJobs} ctx={ctx} reload={loadAll} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
        {view === "Foreman" && <Foreman jobs={dailyJobs} ctx={ctx} reload={loadAll} selectedDate={selectedDate} />}
        {view === "Production Log" && <ProductionLog jobs={visibleJobs} ctx={ctx} reload={loadAll} setEditingJob={setEditingJob} />}
        {view === "Technicians" && <Technicians jobs={visibleJobs} ctx={ctx} />}
        {view === "Tech Clock" && <TechnicianClock ctx={ctx} reload={loadAll} selectedDate={selectedDate} />}
        {view === "Products" && <Products ctx={ctx} reload={loadAll} />}
        {view === "Admin" && <Admin ctx={ctx} reload={loadAll} />}
        {view === "Cloud Status" && <CloudStatus state={state} />}

        {showNewJob && <NewJobModal onClose={() => setShowNewJob(false)} ctx={ctx} reload={loadAll} selectedDate={selectedDate} access={access} />}
        {editingJob && (
          <EditJobModal
            job={editingJob}
            ctx={ctx}
            reload={loadAll}
            onClose={() => setEditingJob(null)}
          />
        )}

        {isMobile && (
          <>
            <button className="phoneFab" onClick={() => setShowNewJob(true)} aria-label="New Job">
              <Plus size={26} />
            </button>
            <nav className="phoneBottomNav">
              {[
                ["Mobile Manager", Smartphone, "Floor"],
                ["Dashboard", LayoutDashboard, "Dash"],
                ["Schedule", CalendarDays, "Schedule"],
                ["Outlook Calendar", CalendarDays, "Outlook"],
                ["Production Log", ClipboardList, "Log"],
                ["Tech Clock", UserCheck, "Clock"],
                ["Admin", Settings, "Admin"],
              ].filter(([name]) => allowedViewNames.includes(name)).map(([name, Icon, label]) => (
                <button
                  key={name}
                  className={view === name ? "active" : ""}
                  onClick={() => setView(name)}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
      </main>
    </div>
  );
}


function MobileStyles() {
  return (
    <style>{`
      .scheduleWrap { position: relative; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .scheduleWrap .schedule { min-width: 760px; }
      .currentTimeLine { position: absolute; left: 0; right: 0; height: 0; border-top: 3px solid #ef4444; z-index: 35; pointer-events: none; box-shadow: 0 0 0 1px rgba(239, 68, 68, .16); }
      .currentTimeLine span { position: sticky; left: 8px; display: inline-block; transform: translateY(-50%); padding: 4px 8px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 900; letter-spacing: .03em; box-shadow: 0 6px 14px rgba(239, 68, 68, .32); }
      .miniJobOverdue { outline: 2px solid #ef4444; background: #fee2e2 !important; }
      .miniJobFinishingSoon { outline: 2px solid #f59e0b; background: #fef3c7 !important; }
      .miniJobQc { outline: 2px solid #2563eb; }
      .techTimelineRecords { margin-top: 16px; }
      .techTimelineHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
      .techTimelineHeader h3 { margin: 0; }
      .techTimelineHeader span { color: #64748b; font-size: 12px; font-weight: 800; }
      .techTimelineList { display: grid; gap: 8px; }
      .techTimelineRow { display: grid; grid-template-columns: 84px 1fr auto; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid rgba(15, 23, 42, .08); border-radius: 14px; background: #f8fafc; }
      .techTimelineDate { font-size: 12px; font-weight: 900; color: #64748b; }
      .techTimelineMain strong { display: block; color: #0f172a; }
      .techTimelineMain span { display: block; margin-top: 2px; color: #64748b; font-size: 12px; font-weight: 700; }
      .techTimelineStats { text-align: right; }
      .techTimelineStats strong { display: block; font-size: 15px; }
      .techTimelineStats span { display: block; color: #64748b; font-size: 12px; font-weight: 800; }

      .outlookGrid { display: grid; grid-template-columns: minmax(280px, .9fr) minmax(320px, 1.1fr); gap: 14px; align-items: start; }
      .outlookForm { display: grid; gap: 10px; }
      .outlookForm label { display: grid; gap: 5px; font-size: 12px; font-weight: 900; color: #475569; }
      .outlookForm input, .outlookForm textarea, .outlookForm select { width: 100%; border: 1px solid rgba(15,23,42,.12); border-radius: 12px; padding: 10px 12px; font: inherit; background: #fff; color: #0f172a; }
      .outlookForm textarea { min-height: 92px; resize: vertical; }
      .outlookHelp { margin: 6px 0 0; color: #64748b; font-size: 12px; line-height: 1.45; }
      .outlookList { display: grid; gap: 10px; }
      .outlookCard { display: grid; gap: 10px; padding: 14px; border-radius: 16px; border: 1px solid rgba(15,23,42,.08); background: #f8fafc; }
      .outlookCard.imported { opacity: .65; }
      .outlookCardTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
      .outlookCard h4 { margin: 0; color: #0f172a; }
      .outlookCard p { margin: 0; color: #64748b; font-size: 13px; line-height: 1.45; }
      .outlookBadge { flex: 0 0 auto; border-radius: 999px; padding: 4px 8px; background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 900; }
      .outlookBadge.imported { background: #dcfce7; color: #166534; }
      .outlookBadge.high { background: #dcfce7; color: #166534; }
      .outlookBadge.medium { background: #fef3c7; color: #92400e; }
      .outlookBadge.low { background: #fee2e2; color: #991b1b; }
      .outlookActions { display: flex; gap: 8px; flex-wrap: wrap; }
      .outlookActions button { border-radius: 12px; }
      .productLinesBox { grid-column: 1 / -1; display: grid; gap: 10px; padding: 12px; border: 1px solid rgba(15,23,42,.1); border-radius: 16px; background: #f8fafc; }
      .productLinesHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .productLinesHead h4 { margin: 0; color: #0f172a; }
      .productLineRow { display: grid; grid-template-columns: minmax(180px, 1fr) 110px 110px auto; gap: 8px; align-items: end; }
      .productLineRow label { display: grid; gap: 5px; font-size: 11px; font-weight: 900; color: #475569; }
      .productLineRow input, .productLineRow select { width: 100%; border: 1px solid rgba(15,23,42,.12); border-radius: 12px; padding: 10px 12px; font: inherit; background: #fff; color: #0f172a; }
      .productLineRemove { min-height: 42px; border-radius: 12px; }
      .productLinesTotal { display: flex; justify-content: flex-end; gap: 12px; flex-wrap: wrap; font-size: 13px; color: #475569; }
      .productLinesTotal strong { color: #0f172a; }

      .availabilityOverdue { background: #fee2e2 !important; border-color: #ef4444 !important; color: #7f1d1d !important; }
      .availabilityOverdue strong, .availabilityOverdue span { color: #7f1d1d !important; }
      .negativeTime { font-weight: 900; color: #dc2626 !important; }
      .availabilityOffClock { background: #f1f5f9 !important; border-color: #94a3b8 !important; color: #64748b !important; }
      .availabilityOffClock strong, .availabilityOffClock span { color: #64748b !important; }
      .techClockList { display: grid; gap: 10px; }
      .techClockRow { display: grid; grid-template-columns: minmax(150px, .8fr) minmax(180px, 1fr) auto; gap: 12px; align-items: center; padding: 14px; border: 1px solid rgba(15,23,42,.1); border-radius: 16px; background: #f8fafc; }
      .techClockRow.clockedIn { border-color: rgba(22,163,74,.35); background: #f0fdf4; }
      .techClockRow.clockedOut { border-color: rgba(100,116,139,.25); background: #f8fafc; }
      .techClockRow strong { display: block; color: #0f172a; }
      .techClockRow span { display: block; margin-top: 2px; color: #64748b; font-size: 12px; font-weight: 800; }
      .techClockRow b { color: #0f172a; }
      .techClockActions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      @media (max-width: 768px) {
        html, body, #root { width: 100%; min-height: 100%; overflow-x: hidden; }
        body { background: #070d1c; }
        .app.phoneShell { display: block !important; width: 100%; min-height: 100vh; background: #070d1c; }
        .phoneMain { width: 100% !important; min-width: 0 !important; padding: 0 0 92px !important; margin: 0 !important; }
        .phoneHeader { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 14px 10px; background: rgba(7, 13, 28, .96); backdrop-filter: blur(14px); border-bottom: 1px solid rgba(255,255,255,.08); }
        .phoneHeader h2 { margin: 0; color: #fff; font-size: 21px; line-height: 1.1; }
        .phoneDatePicker { margin-top: 6px; height: 34px; border: 0; border-radius: 10px; padding: 0 10px; font-weight: 900; color: #0f172a; background: #f8fafc; }
        .phoneHeader .eyebrow { margin: 0 0 4px; color: #f97316; font-size: 10px; letter-spacing: .12em; font-weight: 900; text-transform: uppercase; }
        .phoneIconButton { width: 44px; height: 44px; border-radius: 14px; border: 0; display: grid; place-items: center; background: #f97316; color: white; box-shadow: 0 8px 18px rgba(249,115,22,.3); }
        .mobileApp { padding: 10px 10px 0 !important; background: #070d1c; min-height: calc(100vh - 70px); }
        .mobileAppHeader { border-radius: 18px !important; padding: 16px !important; margin: 0 0 10px !important; background: linear-gradient(135deg, #111827, #1f2937) !important; border: 1px solid rgba(255,255,255,.08); }
        .mobileAppHeader h1 { font-size: 20px !important; margin: 2px 0 0 !important; color: white; }
        .mobileAppHeader p { font-size: 10px !important; letter-spacing: .14em; font-weight: 900; color: #f97316 !important; }
        .mobileAppHeader strong { min-width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; background: #f97316; color: white; }
        .mobileTabs { position: sticky; top: 68px; z-index: 40; display: flex !important; overflow-x: auto; gap: 8px; padding: 8px 0 10px !important; background: #070d1c; scrollbar-width: none; }
        .mobileTabs::-webkit-scrollbar { display: none; }
        .mobileTabs button { flex: 0 0 auto; min-height: 40px; border: 0; border-radius: 999px; padding: 0 15px; font-size: 13px; font-weight: 900; background: #1f2937; color: #cbd5e1; }
        .mobileTabs button.active { background: #f97316; color: white; }
        .mobileJobList { display: grid !important; gap: 12px !important; }
        .mobileJob { border-radius: 18px !important; padding: 14px !important; background: #f8fafc !important; border: 1px solid rgba(255,255,255,.08) !important; box-shadow: 0 12px 28px rgba(0,0,0,.24); }
        .mobileJobTop { align-items: center; margin-bottom: 10px !important; }
        .mobileJobTop b { font-size: 11px !important; letter-spacing: .04em; text-transform: uppercase; color: #0f172a; }
        .mobilePill { padding: 5px 9px !important; border-radius: 999px !important; font-size: 10px !important; font-weight: 900; }
        .mobileJob h2 { font-size: 23px !important; line-height: 1.05; margin: 0 !important; color: #0f172a; }
        .mobileJob > p { margin: 4px 0 12px !important; font-size: 15px !important; font-weight: 800; color: #64748b !important; }
        .mobileMetaGrid { display: grid !important; grid-template-columns: 1fr !important; gap: 8px !important; margin-bottom: 10px !important; }
        .mobileMetaGrid div { padding: 12px !important; border-radius: 14px !important; background: #eef2f7 !important; }
        .mobileMetaGrid span { font-size: 10px !important; font-weight: 900; letter-spacing: .1em; color: #64748b !important; text-transform: uppercase; }
        .mobileMetaGrid strong { display: block; font-size: 16px !important; color: #0f172a; margin-top: 2px; }
        .mobileActionGrid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 9px !important; }
        .mobileActionGrid button { min-height: 54px !important; border-radius: 13px !important; border: 0 !important; font-size: 16px !important; font-weight: 900 !important; background: #dbe2ec !important; color: #0f172a !important; }
        .mobileActionGrid button.complete { grid-column: 1 / -1 !important; background: #16a34a !important; color: white !important; }
        .phoneBottomNav { position: fixed; left: 10px; right: 10px; bottom: 10px; z-index: 100; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 8px; border-radius: 22px; background: rgba(15, 23, 42, .96); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 16px 38px rgba(0,0,0,.38); }
        .phoneBottomNav button { height: 58px; border: 0; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: transparent; color: #94a3b8; font-size: 10px; font-weight: 900; }
        .phoneBottomNav button.active { background: #f97316; color: white; }
        .phoneFab { position: fixed; right: 18px; bottom: 92px; z-index: 110; width: 60px; height: 60px; border-radius: 20px; border: 0; display: grid; place-items: center; background: #f97316; color: white; box-shadow: 0 14px 30px rgba(249,115,22,.42); }
        .page { padding: 10px !important; }
        .panel, .hero, .adminHero, .performanceHero, .mobileHero { border-radius: 18px !important; padding: 14px !important; }
        .grid.two, .cards3, .kpis, .formGrid { display: grid !important; grid-template-columns: 1fr !important; gap: 10px !important; }
        .modalBackdrop { padding: 10px !important; align-items: flex-end !important; }
        .modal { width: 100% !important; max-width: none !important; max-height: 92vh !important; overflow: auto !important; border-radius: 22px 22px 0 0 !important; }
        .table, .performanceTable, .availabilityTable, .schedule { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        .outlookGrid { grid-template-columns: 1fr !important; }
        .productLineRow { grid-template-columns: 1fr !important; }
        .productLinesTotal { justify-content: flex-start !important; }
        .accessGate { min-height: 100vh; display: grid; place-items: center; padding: 18px; background: #070d1c; }
        .accessPanel { width: min(520px, 100%); border-radius: 22px; padding: 18px; background: #f8fafc; }
        .accessPanel label { display: grid; gap: 6px; margin: 12px 0; font-weight: 900; color: #0f172a; }
      }
    `}</style>
  );
}

function MobileManager({ jobs, ctx, reload, setEditingJob, selectedDate }) {
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

    const now = new Date().toISOString();
    const updatePayload = {
      status_id: statusId,
      updated_at: now,
    };

    if (statusName === "In Progress" && !job.production_started_at) {
      updatePayload.production_started_at = now;
    }

    const { error } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", job.id);

    if (error) return alert(error.message);
    await reload();
  }

  async function completeJob(job) {
    const completedId = getStatusId("Completed");
    if (!completedId) return alert("Missing status: Completed");

    const now = new Date();
    const startedAt = getJobStartedAt(job) || getScheduledStartDate(job) || now;
    const actualHours = Math.max(0.01, (now - startedAt) / 36e5);

    const { error } = await supabase
      .from("jobs")
      .update({
        status_id: completedId,
        actual_hours: roundHours(actualHours),
        production_started_at: job.production_started_at || startedAt.toISOString(),
        production_completed_at: now.toISOString(),
        qc: "Yes",
        updated_at: now.toISOString(),
      })
      .eq("id", job.id);

    if (error) return alert(error.message);
    notifyUser(`Completed: ${job.vehicle || "job"} • ${roundHours(actualHours)} actual hrs`);
    await reload();
  }


  async function rollJobToNextDay(job) {
    const remainingBookHours = getRemainingBookHoursForRollover(job, ctx);
    if (remainingBookHours <= 0) return alert("This job does not have any book time left to roll over after today.");

    const nextDate = addDaysIso(job.scheduled_date || selectedDate || todayIso(), 1);
    const todayBookHours = getBookHoursThatFitToday(job, ctx);
    const rolledJob = {
      company_id: job.company_id,
      customer: job.customer,
      vehicle: job.vehicle,
      product_id: job.product_id,
      technician_id: job.technician_id,
      status_id: job.status_id,
      delay_reason_id: job.delay_reason_id || null,
      start_time: ctx.shopSettings?.shop_open || "08:00",
      book_hours: remainingBookHours,
      actual_hours: null,
      qc: job.qc || "N/A",
      scheduled_date: nextDate,
      labor_sold: job.labor_sold || null,
      notes: `${job.notes || ""}\nRolled over from ${job.scheduled_date || selectedDate || todayIso()}. Original job ${job.book_hours} book hrs; ${remainingBookHours} hrs remaining.`.trim(),
      outlook_event_id: job.outlook_event_id || null,
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("jobs").insert(rolledJob);
    if (insertError) return alert(insertError.message);

    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        book_hours: todayBookHours,
        notes: `${job.notes || ""}\nRolled ${remainingBookHours} hrs to ${nextDate}.`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (updateError) return alert(updateError.message);
    notifyUser(`Rolled ${job.vehicle || "job"} to ${nextDate}`);
    await reload();
  }

  async function addHelperToJob(job, helperTechnicianId, helperStartTime) {
    if (!helperTechnicianId) return alert("Select a helper technician.");
    if (!helperStartTime) return alert("Enter helper start time.");
    if (helperTechnicianId === job.technician_id) return alert("Helper cannot be the lead technician on the same job.");

    const helperBookHours = calculateHelperBookHours(job, helperStartTime, ctx);
    const overBook = isJobPastBookTime(job, ctx);

    const helperRow = {
      company_id: ctx.company.id,
      job_id: job.id,
      technician_id: helperTechnicianId,
      start_time: helperStartTime,
      book_hours: helperBookHours,
      status: "active",
      end_time: null,
      ended_at: null,
      scheduled_date: job.scheduled_date || selectedDate || todayIso(),
      actual_hours: null,
      notes: overBook
        ? `Assisting ${getPrimaryTechNameForJob(job, ctx)} after book time on ${job.vehicle || job.customer || "job"}. Helper credit will be 110% efficiency for time after book time has expired.`
        : `Assisting ${getPrimaryTechNameForJob(job, ctx)} on ${job.vehicle || job.customer || "job"}`,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("job_helpers")
      .upsert(helperRow, { onConflict: "job_id,technician_id,scheduled_date" });

    if (error) return alert(error.message);
    notifyUser(`${ctx.tech(helperTechnicianId)?.name || "Helper"} added to assist ${getPrimaryTechNameForJob(job, ctx)}`);
    await reload();
  }

  async function endHelperOnJob(helper, job) {
    const endTime = shortTime(new Date().toTimeString());
    const actualHours = calculateWorkingHoursBetween(helper.start_time, endTime, ctx);
    const creditedHours = calculateHelperCreditedHours(job, helper.start_time, endTime, ctx);

    const { error } = await supabase
      .from("job_helpers")
      .update({
        end_time: endTime,
        book_hours: creditedHours,
        actual_hours: actualHours,
        status: "ended",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", helper.id);

    if (error) return alert(error.message);
    notifyUser(`${ctx.tech(helper.technician_id)?.name || "Helper"} ended help with ${creditedHours} credited hrs (${actualHours} actual hrs)`);
    await reload();
  }

  async function removeHelperFromJob(helperId) {
    const { error } = await supabase.from("job_helpers").delete().eq("id", helperId);
    if (error) return alert(error.message);
    notifyUser("Helper removed with no credited hours");
    await reload();
  }

  return (
    <section className="mobileApp">
      <header className="mobileAppHeader">
        <div>
          <p>H&H Production</p>
          <h1>{selectedDate === todayIso() ? "Manager View" : selectedDate}</h1>
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
          const productName = ctx.jobProductsSummary(job);
          const tech = ctx.tech(job.technician_id);
          const status = ctx.status(job.status_id);
          const projected = getJobProjectedFinish(job, ctx);

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
              <p>{productName}</p>

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
                  <span>Finish</span>
                  <strong>{projected.finishTime}{projected.dayOffset ? ` +${projected.dayOffset}d` : ""}</strong>
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
                <button onClick={() => setEditingJob(job)}>Edit</button>
                <button onClick={() => rollJobToNextDay(job)}>Roll Over</button>
                <button className="complete" onClick={() => completeJob(job)}>
                  Complete
                </button>
              </div>

              <HelperControls
                job={job}
                ctx={ctx}
                onAddHelper={addHelperToJob}
                onEndHelper={endHelperOnJob}
                onRemoveHelper={removeHelperFromJob}
              />
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

function Dashboard({ jobs, allJobs = jobs, ctx, metrics, selectedDate }) {
  const openJobs = jobs.filter((j) => !ctx.isComplete(j.status_id));

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">Live production</p>
          <h3>{selectedDate === todayIso() ? "Today’s shop performance" : `Shop performance for ${selectedDate}`}</h3>
          <p>Every card reads from Supabase. Updates from another device sync back into this dashboard.</p>
        </div>
        <div className="heroMetric">
          <span>Shop efficiency</span>
          <strong className={effClass(metrics.efficiency)}>{Math.round(metrics.efficiency)}%</strong>
        </div>
      </div>

     <div className="kpis">
  <Kpi title="Shop Capacity" value={`${metrics.capacity}%`} caption="Current workload" />

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
    title="Helper Book Hours"
    value={metrics.helperBookComplete.toFixed(1)}
    caption="Added to performance"
  />

  <Kpi
    title="Helper Actual Hours"
    value={metrics.helperActualUsed.toFixed(1)}
    caption="Hours helped"
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

      <LiveTechnicianAvailability jobs={jobs} ctx={ctx} />

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
        <Panel title="Monthly Efficiency Leaderboard" chip={currentMonthLabel()}>
          <TechLeaderboard jobs={allJobs} ctx={ctx} monthly />
        </Panel>
      </div>
    </section>
  );
}

function useCurrentMinute() {
  const [minute, setMinute] = useState(getCurrentMinuteOfDay());

  useEffect(() => {
    const tick = () => setMinute(getCurrentMinuteOfDay());
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  return minute;
}

function getCurrentMinuteOfDay() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeStringToMinutes(value) {
  const [h, m] = shortTime(value).split(":").map(Number);
  return h * 60 + m;
}

function isMinuteInsideSchedule(minute, open, close) {
  const start = timeStringToMinutes(open);
  const end = timeStringToMinutes(close);
  return minute >= start && minute <= end;
}

function getScheduleTimeLineTop(minute, open) {
  const headerHeight = 72;
  const slotHeight = 72;
  const start = timeStringToMinutes(open);
  const minutesFromOpen = Math.max(0, minute - start);
  return headerHeight + (minutesFromOpen / 30) * slotHeight;
}

function formatMinutesAsTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function minutesToTime(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes || 0)));
  const h = Math.floor(safeMinutes / 60);
  const m = safeMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getShopSchedule(ctx) {
  return {
    open: timeStringToMinutes(ctx?.shopSettings?.shop_open || "08:00"),
    close: timeStringToMinutes(ctx?.shopSettings?.shop_close || "18:00"),
    lunchStart: timeStringToMinutes(ctx?.shopSettings?.lunch_start || "12:00"),
    lunchEnd: timeStringToMinutes(ctx?.shopSettings?.lunch_end || "13:00"),
  };
}

function isWorkingMinute(minute, schedule) {
  return (
    minute >= schedule.open &&
    minute < schedule.close &&
    !(minute >= schedule.lunchStart && minute < schedule.lunchEnd)
  );
}

function getBookMinutes(job) {
  return Math.max(0, Math.round(Number(job?.book_hours || 0) * 60));
}

function addBookMinutesWithinShop(startTime, bookMinutes, ctx) {
  const schedule = getShopSchedule(ctx);
  let minute = timeStringToMinutes(startTime || "08:00");
  let remaining = Math.max(0, Math.round(Number(bookMinutes || 0)));
  let dayOffset = 0;

  while (remaining > 0) {
    if (minute >= schedule.close) {
      dayOffset += 1;
      minute = schedule.open;
      continue;
    }

    if (minute < schedule.open) {
      minute = schedule.open;
      continue;
    }

    if (isWorkingMinute(minute, schedule)) remaining -= 1;
    minute += 1;
  }

  return { finishTime: minutesToTime(minute), dayOffset };
}

function getJobProjectedFinish(job, ctx) {
  return addBookMinutesWithinShop(job?.start_time || "08:00", getBookMinutes(job), ctx);
}

function getRemainingBookHoursForRollover(job, ctx) {
  const schedule = getShopSchedule(ctx);
  const start = timeStringToMinutes(job?.start_time || "08:00");
  const totalMinutes = getBookMinutes(job);
  let usableToday = 0;

  for (let minute = start; minute < schedule.close; minute += 1) {
    if (isWorkingMinute(minute, schedule)) usableToday += 1;
  }

  return roundHours(Math.max(0, totalMinutes - usableToday) / 60);
}

function getBookHoursThatFitToday(job, ctx) {
  return roundHours(Math.max(0, Number(job?.book_hours || 0) - getRemainingBookHoursForRollover(job, ctx)));
}

function getPrimaryTechNameForJob(job, ctx) {
  return ctx.tech(job?.technician_id)?.name || "the lead tech";
}

function getHelpersForJob(job, ctx) {
  return (ctx.jobHelpers || []).filter((h) => h.job_id === job?.id);
}

function isActiveHelper(helper) {
  return (helper?.status || "active") === "active" && !helper?.end_time;
}

function getHelperAssignmentForTech(techId, ctx, selectedDate) {
  return (ctx.jobHelpers || []).find(
    (h) => h.technician_id === techId && h.scheduled_date === selectedDate && isActiveHelper(h)
  );
}

function calculateWorkingHoursBetween(startTime, endTime, ctx) {
  if (!startTime || !endTime) return 0;

  const schedule = getShopSchedule(ctx);
  const start = timeStringToMinutes(startTime);
  const requestedEnd = timeStringToMinutes(endTime);
  const end = Math.min(requestedEnd, schedule.close);

  if (end <= start) return 0;

  let minutes = 0;
  for (let minute = start; minute < end; minute += 1) {
    if (isWorkingMinute(minute, schedule)) minutes += 1;
  }

  return roundHours(minutes / 60);
}

function isJobPastBookTime(job, ctx) {
  if (!job?.start_time || !job?.book_hours) return false;
  const projected = getJobProjectedFinish(job, ctx);
  if (projected.dayOffset > 0) return false;
  return timeStringToMinutes(shortTime(new Date().toTimeString())) >= timeStringToMinutes(projected.finishTime);
}

function calculateHelperCreditedHours(job, helperStartTime, helperEndTime, ctx) {
  if (!job || !helperStartTime || !helperEndTime) return 0;

  const projected = getJobProjectedFinish(job, ctx);
  const schedule = getShopSchedule(ctx);
  const start = timeStringToMinutes(helperStartTime);
  const requestedEnd = Math.min(timeStringToMinutes(helperEndTime), schedule.close);
  const bookFinish = projected.dayOffset > 0 ? schedule.close : timeStringToMinutes(projected.finishTime);

  if (requestedEnd <= start) return 0;

  let creditedMinutes = 0;
  for (let minute = start; minute < requestedEnd; minute += 1) {
    if (!isWorkingMinute(minute, schedule)) continue;

    // Normal helper credit before the lead job's book time expires.
    // Any helper time after book time has expired is credited at 110% efficiency.
    creditedMinutes += minute >= bookFinish ? 1.1 : 1;
  }

  return roundHours(creditedMinutes / 60);
}

function calculateHelperBookHours(job, helperStartTime, ctx) {
  if (!job || !helperStartTime) return 0;

  const projected = getJobProjectedFinish(job, ctx);
  const schedule = getShopSchedule(ctx);
  const nowTime = shortTime(new Date().toTimeString());
  const helperStart = timeStringToMinutes(helperStartTime);
  const projectedFinish = projected.dayOffset > 0 ? schedule.close : timeStringToMinutes(projected.finishTime);

  // If the job is still inside book time and the helper starts before projected finish,
  // estimate helper credit through the projected finish. If the job is already over book
  // time, show live 110% credited time from helper start to now.
  const liveEnd = Math.min(timeStringToMinutes(nowTime), schedule.close);
  const endMinute = projectedFinish > helperStart ? projectedFinish : liveEnd;

  return calculateHelperCreditedHours(job, helperStartTime, minutesToTime(endMinute), ctx);
}

function getHelperDisplayHours(helper, job, ctx) {
  if (!helper) return 0;
  if (!isActiveHelper(helper)) return Number(helper.book_hours || 0);
  return calculateHelperBookHours(job, helper.start_time, ctx);
}

function buildHelperScheduleJobs(jobs, ctx, selectedDate) {
  return (ctx.jobHelpers || [])
    .filter((h) => h.scheduled_date === selectedDate)
    .map((helper) => {
      const primaryJob = (ctx.jobs || jobs || []).find((j) => j.id === helper.job_id);
      if (!primaryJob) return null;
      return {
        ...primaryJob,
        id: `helper-${helper.id}`,
        technician_id: helper.technician_id,
        start_time: shortTime(helper.start_time),
        book_hours: isActiveHelper(helper) ? calculateHelperBookHours(primaryJob, helper.start_time, ctx) : Number(helper.book_hours || 0),
        helper_assignment: helper,
        helper_label: `Assisting ${getPrimaryTechNameForJob(primaryJob, ctx)}`,
      };
    })
    .filter(Boolean);
}

function Schedule({ jobs, ctx, selectedDate }) {
  const activeTechs = ctx.technicians.filter((t) => t.active);
  const shopOpen = ctx.shopSettings?.shop_open || "08:00";
  const shopClose = ctx.shopSettings?.shop_close || "18:00";
  const times = buildTimeSlots(shopOpen, shopClose);
  const currentMinute = useCurrentMinute();
  const showCurrentTimeLine = selectedDate === todayIso() && isMinuteInsideSchedule(currentMinute, shopOpen, shopClose);
  const currentTimeTop = getScheduleTimeLineTop(currentMinute, shopOpen);
  const helperScheduleJobs = buildHelperScheduleJobs(jobs, ctx, selectedDate);
  const scheduleJobs = [...jobs, ...helperScheduleJobs];

  function jobCoversSlot(job, slotTime) {
    if (!job.start_time || !job.book_hours) return false;

    const schedule = getShopSchedule(ctx);
    const slotStart = timeStringToMinutes(slotTime);
    const slotEnd = slotStart + 30;
    let minute = timeStringToMinutes(job.start_time);
    let counted = 0;
    const totalBookMinutes = getBookMinutes(job);

    while (counted < totalBookMinutes && minute < schedule.close) {
      if (isWorkingMinute(minute, schedule)) {
        if (minute >= slotStart && minute < slotEnd) return true;
        counted += 1;
      }
      minute += 1;
    }

    return false;
  }

  function isJobStart(job, slotTime) {
    return shortTime(job.start_time) === slotTime;
  }

  function jobStatusClass(job) {
    const finish = getJobProjectedFinish(job, ctx);
    const finishMinutes = timeStringToMinutes(finish.finishTime);
    const statusName = ctx.status(job.status_id)?.name || "";
    if (!ctx.isComplete(job.status_id) && selectedDate === todayIso() && finishMinutes < currentMinute && !finish.dayOffset) return "miniJobOverdue";
    if (!ctx.isComplete(job.status_id) && selectedDate === todayIso() && finishMinutes - currentMinute <= 30 && finishMinutes - currentMinute >= 0 && !finish.dayOffset) return "miniJobFinishingSoon";
    if (statusName === "QC") return "miniJobQc";
    return "";
  }

  return (
    <section className="page">
      <Panel title="Technician schedule" chip={selectedDate === todayIso() ? "Today" : selectedDate}>
        <div className="scheduleWrap">
          {showCurrentTimeLine && (
            <div className="currentTimeLine" style={{ top: `${currentTimeTop}px` }}>
              <span>{formatMinutesAsTime(currentMinute)}</span>
            </div>
          )}

          <div
            className="schedule"
            style={{
              gridTemplateColumns: `86px repeat(${Math.max(activeTechs.length, 1)}, minmax(150px, 1fr))`,
              gridAutoRows: "72px",
            }}
          >
            <div className="scheduleHead empty" />

            {activeTechs.map((tech) => (
              <div className="scheduleHead" key={tech.id}>{tech.name}</div>
            ))}

            {times.map((time) => (
              <React.Fragment key={time}>
                <div className="timeCell">{formatTime(time)}</div>

                {activeTechs.map((tech) => {
                  const coveringJobs = scheduleJobs.filter(
                    (j) =>
                      j.technician_id === tech.id &&
                      !ctx.isComplete(j.status_id) &&
                      jobCoversSlot(j, time)
                  );

                  return (
                    <div className={`slot ${coveringJobs.length ? "slotBlocked" : ""}`} key={`${tech.id}-${time}`}>
                      {coveringJobs.map((j) => {
                        const product = ctx.product(j.product_id);
                        const productName = j.helper_label || ctx.jobProductsSummary(j);
                        const category = ctx.category(product?.category_id);
                        const status = ctx.status(j.status_id);
                        const projected = getJobProjectedFinish(j, ctx);

                        return (
                          <div
                            className={`miniJob ${isJobStart(j, time) ? "miniJobStart" : "miniJobContinued"} ${jobStatusClass(j)} ${j.helper_assignment ? "miniJobHelper" : ""}`}
                            style={{ borderColor: category?.color || "#f97316" }}
                            key={`${j.id}-${time}`}
                          >
                            {isJobStart(j, time) ? (
                              <>
                                <strong>{productName}</strong><br />
                                <span>{j.vehicle}</span><br />
                                <small>
                                  {shortTime(j.start_time)} → {projected.finishTime}{projected.dayOffset ? ` +${projected.dayOffset}d` : ""} • {j.book_hours} hrs • {status?.name}
                                </small>
                              </>
                            ) : (
                              <small>continued</small>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </Panel>
    </section>
  );
}


function HelperControls({ job, ctx, onAddHelper, onEndHelper, onRemoveHelper }) {
  const [helperTechnicianId, setHelperTechnicianId] = useState("");
  const [helperStartTime, setHelperStartTime] = useState(shortTime(new Date().toTimeString()));
  const helpers = getHelpersForJob(job, ctx);

  return (
    <div className="helperBox">
      <label>Add assisting technician</label>
      <div className="helperControlsRow">
        <select value={helperTechnicianId} onChange={(e) => setHelperTechnicianId(e.target.value)}>
          <option value="">Select helper</option>
          {ctx.technicians
            .filter((t) => t.active && t.id !== job.technician_id)
            .map((t) => (
              <option value={t.id} key={t.id}>{t.name}</option>
            ))}
        </select>
        <input type="time" value={helperStartTime} onChange={(e) => setHelperStartTime(e.target.value)} />
        <button onClick={() => onAddHelper(job, helperTechnicianId, helperStartTime)}>Add Helper</button>
      </div>
      {helpers.map((helper) => {
        const active = isActiveHelper(helper);
        const displayHours = getHelperDisplayHours(helper, job, ctx);
        return (
          <div className="helperLine" key={helper.id}>
            <span>
              {ctx.tech(helper.technician_id)?.name || "Helper"} • {shortTime(helper.start_time)}
              {active ? " → Active" : ` → ${shortTime(helper.end_time)}`} • {displayHours} hrs
            </span>
            <div className="helperActions">
              {active && <button onClick={() => onEndHelper(helper, job)}>End Help</button>}
              <button onClick={() => onRemoveHelper(helper.id)}>Remove</button>
            </div>
          </div>
        );
      })}
    </div>
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
    const now = new Date().toISOString();
    const updatePayload = { status_id: statusId, updated_at: now };

    if (statusId === inProgress && !job.production_started_at) {
      updatePayload.production_started_at = now;
    }

    const { error } = await supabase
      .from("jobs")
      .update(updatePayload)
      .eq("id", job.id);

    if (error) return alert(error.message);
    await reload();
  }

  async function completeJob(job) {
    const now = new Date();
    const startedAt = getJobStartedAt(job) || getScheduledStartDate(job) || now;
    const actualHours = Math.max(0.01, (now - startedAt) / 36e5);

    const { error } = await supabase
      .from("jobs")
      .update({
        status_id: complete,
        actual_hours: roundHours(actualHours),
        production_started_at: job.production_started_at || startedAt.toISOString(),
        production_completed_at: now.toISOString(),
        qc: "Yes",
        updated_at: now.toISOString(),
      })
      .eq("id", job.id);

    if (error) return alert(error.message);
    notifyUser(`Completed: ${job.vehicle || "job"} • ${roundHours(actualHours)} actual hrs`);
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
            <h4>{ctx.jobProductsSummary(job)}</h4>
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

function ProductionLog({ jobs, ctx, reload, setEditingJob }) {
  const [search, setSearch] = useState("");
  const filteredJobs = jobs.filter((j) => {
    const haystack = [j.customer, j.vehicle, ctx.jobProductsSummary(j), ctx.tech(j.technician_id)?.name, ctx.status(j.status_id)?.name]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  async function deleteJob(id) {
    if (!confirm("Delete this job?")) return;

    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) return alert(error.message);

    await reload();
  }

  return (
    <section className="page">
      <Panel title="Production Log" chip={`${filteredJobs.length} jobs`}>
        <div className="adminActions">
          <input placeholder="Search customer, vehicle, job, tech..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
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
            <span>QC</span>
            <span></span>
          </div>

          {filteredJobs.map((j) => {
            const eff = efficiency(j);
            return (
              <div className="row" key={j.id}>
                <b>{j.customer}</b>
                <span>{j.vehicle}</span>
                <span>{ctx.jobProductsSummary(j)}</span>
                <span>{ctx.tech(j.technician_id)?.name}</span>
                <StatusPill status={ctx.status(j.status_id)} />
                <span>{j.book_hours}</span>
                <span>{j.actual_hours ?? "—"}</span>
                <b className={effClass(eff)}>{eff ? `${Math.round(eff)}%` : "—"}</b>
                <span>{j.qc || "N/A"}</span>
                <div className="rowActions">
                  <button onClick={() => setEditingJob(j)}>Edit</button>
                  <button onClick={() => deleteJob(j.id)}>Delete</button>
                </div>
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
          const helperStats = getHelperPerformanceStats(ctx, tech.id);
          const bookWithHelpers = book + helperStats.bookHours;
          const actualWithHelpers = actual + helperStats.actualHours;
          const eff = actualWithHelpers ? (bookWithHelpers / actualWithHelpers) * 100 : 0;

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
                <Metric label="Primary Book" value={book.toFixed(1)} />
                <Metric label="Helper Book" value={helperStats.bookHours.toFixed(1)} />
                <Metric label="Total Book" value={bookWithHelpers.toFixed(1)} />
                <Metric label="Actual hrs" value={actualWithHelpers.toFixed(1)} />
                <Metric label="Hours Helped" value={helperStats.actualHours.toFixed(1)} />
                <Metric label="Help Received" value={helperStats.receivedActualHours.toFixed(1)} />
                <Metric label="Jobs" value={completed.length} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TechnicianClock({ ctx, reload, selectedDate }) {
  const isToday = selectedDate === todayIso();

  async function clockIn(tech) {
    const now = new Date().toISOString();
    const payload = {
      company_id: ctx.company.id,
      technician_id: tech.id,
      work_date: selectedDate,
      clock_in_at: isToday ? now : `${selectedDate}T08:00:00`,
      clock_out_at: null,
      status: "clocked_in",
      updated_at: now,
    };

    const { error } = await supabase
      .from("technician_attendance")
      .upsert(payload, { onConflict: "company_id,technician_id,work_date" });

    if (error) return alert(error.message);
    await reload();
  }

  async function clockOut(tech) {
    const now = new Date().toISOString();
    const row = ctx.attendanceForDate?.(tech.id, selectedDate);

    if (!row?.id) {
      return alert(`${tech.name} is not clocked in for ${selectedDate}.`);
    }

    const { error } = await supabase
      .from("technician_attendance")
      .update({
        clock_out_at: isToday ? now : `${selectedDate}T18:00:00`,
        status: "clocked_out",
        updated_at: now,
      })
      .eq("id", row.id);

    if (error) return alert(error.message);
    await reload();
  }

  async function markAbsent(tech) {
    const now = new Date().toISOString();
    const payload = {
      company_id: ctx.company.id,
      technician_id: tech.id,
      work_date: selectedDate,
      clock_in_at: null,
      clock_out_at: null,
      status: "absent",
      updated_at: now,
    };

    const { error } = await supabase
      .from("technician_attendance")
      .upsert(payload, { onConflict: "company_id,technician_id,work_date" });

    if (error) return alert(error.message);
    await reload();
  }

  return (
    <section className="page">
      <div className="adminHero">
        <p className="eyebrow">Manager / Admin</p>
        <h3>Technician Clock</h3>
        <p>Clock technicians in for the day. A technician who is not clocked in shows as not available and is excluded from shop capacity.</p>
      </div>

      <Panel title="Technician Availability Control" chip={selectedDate}>
        <div className="techClockList">
          {ctx.technicians.filter((t) => t.active).map((tech) => {
            const attendance = getTechAttendanceStatus(ctx, tech.id, selectedDate);
            const clockedIn = attendance.label === "Clocked In";
            const row = attendance.row;

            return (
              <div className={`techClockRow ${clockedIn ? "clockedIn" : "clockedOut"}`} key={tech.id}>
                <div>
                  <strong>{tech.name}</strong>
                  <span>{tech.role || "Technician"}</span>
                </div>
                <div>
                  <b>{attendance.label}</b>
                  <span>In: {formatClock(row?.clock_in_at)} • Out: {formatClock(row?.clock_out_at)}</span>
                </div>
                <div className="techClockActions">
                  <button className="primary" onClick={() => clockIn(tech)}>Clock In</button>
                  <button onClick={() => clockOut(tech)}>Clock Out</button>
                  <button onClick={() => markAbsent(tech)}>Absent</button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
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

        <Panel title="Monthly Leaderboard" chip={currentMonthLabel()}>
          <TechLeaderboard jobs={jobs} ctx={ctx} detailed monthly />
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
        <MiniStat label="Primary Book Hours" value={stats.jobBookHours.toFixed(1)} />
        <MiniStat label="Helper Book Hours" value={stats.helperBookHours.toFixed(1)} />
        <MiniStat label="Total Book Hours" value={stats.bookHours.toFixed(1)} />
        <MiniStat label="Actual Hours" value={stats.actualHours.toFixed(1)} />
        <MiniStat label="Hours Helped Others" value={stats.helperActualHours.toFixed(1)} />
        <MiniStat label="Help Received" value={stats.helpReceivedActualHours.toFixed(1)} />
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

      <TechnicianTimelineRecords technician={technician} jobs={jobs} ctx={ctx} />

      <h3 className="sectionTitle">Average Job Times</h3>
      <PerformanceTable rows={rows} emptyText="This technician needs completed jobs with actual hours." compact />
    </div>
  );
}

function TechnicianTimelineRecords({ technician, jobs, ctx }) {
  const completedRows = jobs
    .filter((job) => job.technician_id === technician.id && ctx.isComplete(job.status_id) && Number(job.actual_hours) > 0)
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
    .slice(0, 10);

  if (!completedRows.length) {
    return (
      <div className="techTimelineRecords">
        <div className="techTimelineHeader">
          <h3>Timeline Records</h3>
          <span>No completed jobs yet</span>
        </div>
        <p className="muted">Completed jobs with actual hours will appear here.</p>
      </div>
    );
  }

  return (
    <div className="techTimelineRecords">
      <div className="techTimelineHeader">
        <h3>Timeline Records</h3>
        <span>Last {completedRows.length} completed</span>
      </div>
      <div className="techTimelineList">
        {completedRows.map((job) => {
          const productName = ctx.jobProductsSummary(job);
          const eff = efficiency(job);
          const actual = Number(job.actual_hours || 0);
          const book = Number(job.book_hours || 0);
          const completedAt = job.updated_at || job.created_at;

          return (
            <div className="techTimelineRow" key={job.id}>
              <div className="techTimelineDate">{formatShortDate(completedAt)}</div>
              <div className="techTimelineMain">
                <strong>{productName || "Unknown Job"}</strong>
                <span>{job.vehicle} • {job.customer}</span>
              </div>
              <div className="techTimelineStats">
                <strong className={effClass(eff)}>{eff ? `${Math.round(eff)}%` : "—"}</strong>
                <span>{actual.toFixed(2)}h / {book.toFixed(2)}h</span>
              </div>
            </div>
          );
        })}
      </div>
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
function getTechStats(jobs, ctx, technicianId, options = {}) {
  const completed = jobs.filter(
    (j) => (!technicianId || j.technician_id === technicianId) && ctx.isComplete(j.status_id) && Number(j.actual_hours) > 0
  );

  const jobBookHours = completed.reduce((a, j) => a + Number(j.book_hours || 0), 0);
  const jobActualHours = completed.reduce((a, j) => a + Number(j.actual_hours || 0), 0);
  const helperStats = getHelperPerformanceStats(ctx, technicianId, options);
  const receivedStats = getHelpReceivedStats(ctx, technicianId, options);
  const bookHours = jobBookHours + helperStats.bookHours;
  const actualHours = jobActualHours + helperStats.actualHours;
  const qcPassed = completed.filter((j) => (j.qc || "").toLowerCase() === "yes").length;

  return {
    completedJobs: completed.length,
    bookHours,
    actualHours,
    jobBookHours,
    jobActualHours,
    helperBookHours: helperStats.bookHours,
    helperActualHours: helperStats.actualHours,
    helperAssignments: helperStats.assignments,
    helpReceivedAssignments: receivedStats.assignments,
    helpReceivedBookHours: receivedStats.bookHours,
    helpReceivedActualHours: receivedStats.actualHours,
    efficiency: actualHours ? (bookHours / actualHours) * 100 : 0,
    avgActual: completed.length ? jobActualHours / completed.length : 0,
    qcPassRate: completed.length ? (qcPassed / completed.length) * 100 : 0,
  };
}

function getHelperPerformanceStats(ctx, technicianId = null, options = {}) {
  const helpers = (ctx.jobHelpers || []).filter((helper) => {
    if (technicianId && helper.technician_id !== technicianId) return false;
    if (!Number(helper.actual_hours) && !helper.end_time) return false;
    if ((helper.status || "ended") === "active" && !helper.end_time) return false;

    if (options.selectedDate && helper.scheduled_date !== options.selectedDate) return false;

    if (options.monthly) {
      const stamp = helper.ended_at || helper.scheduled_date || helper.updated_at || helper.created_at;
      if (!stamp) return false;
      const d = new Date(stamp);
      const now = new Date();
      if (Number.isNaN(d.getTime())) return false;
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
    }

    return true;
  });

  const receivedStats = technicianId ? getHelpReceivedStats(ctx, technicianId, options) : { assignments: 0, bookHours: 0, actualHours: 0 };

  return {
    assignments: helpers.length,
    bookHours: helpers.reduce((sum, helper) => sum + Number(helper.book_hours || 0), 0),
    actualHours: helpers.reduce((sum, helper) => sum + Number(helper.actual_hours || 0), 0),
    receivedAssignments: receivedStats.assignments,
    receivedBookHours: receivedStats.bookHours,
    receivedActualHours: receivedStats.actualHours,
  };
}

function getHelpReceivedStats(ctx, technicianId = null, options = {}) {
  const helpers = (ctx.jobHelpers || []).filter((helper) => {
    if (!Number(helper.actual_hours) && !helper.end_time) return false;
    if ((helper.status || "ended") === "active" && !helper.end_time) return false;

    const primaryJob = (ctx.jobs || []).find((job) => job.id === helper.job_id);
    if (!primaryJob) return false;
    if (technicianId && primaryJob.technician_id !== technicianId) return false;

    if (options.selectedDate && helper.scheduled_date !== options.selectedDate) return false;

    if (options.monthly) {
      const stamp = helper.ended_at || helper.scheduled_date || helper.updated_at || helper.created_at;
      if (!stamp) return false;
      const d = new Date(stamp);
      const now = new Date();
      if (Number.isNaN(d.getTime())) return false;
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
    }

    return true;
  });

  return {
    assignments: helpers.length,
    bookHours: helpers.reduce((sum, helper) => sum + Number(helper.book_hours || 0), 0),
    actualHours: helpers.reduce((sum, helper) => sum + Number(helper.actual_hours || 0), 0),
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


function OutlookCalendar({ jobs, ctx, reload, selectedDate, setSelectedDate }) {
  const [appointments, setAppointments] = useState(() => loadOutlookAppointments());
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [manual, setManual] = useState({ title: "", date: selectedDate || todayIso(), start: "08:00", body: "" });
  const [pasteText, setPasteText] = useState("");
  const [graphToken, setGraphToken] = useState(() => loadOutlookToken());
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [rangeDays, setRangeDays] = useState(30);
  const [showImported, setShowImported] = useState(false);
  const [icsUrl, setIcsUrl] = useState(() => loadIcsFeedUrl());
  const [icsLoading, setIcsLoading] = useState(false);
  const [icsError, setIcsError] = useState("");
  const [icsLastSync, setIcsLastSync] = useState(() => loadIcsLastSync());

  const importedEventIds = useMemo(
    () => new Set(jobs.map((job) => job.outlook_event_id).filter(Boolean)),
    [jobs]
  );

  const visibleAppointments = useMemo(() => {
    const sorted = [...appointments].sort((a, b) => `${a.date || "9999-12-31"}T${a.start || "23:59"}`.localeCompare(`${b.date || "9999-12-31"}T${b.start || "23:59"}`));
    return showImported ? sorted : sorted.filter((appt) => !importedEventIds.has(appt.outlook_event_id));
  }, [appointments, importedEventIds, showImported]);

  useEffect(() => {
    let cancelled = false;

    async function finishMicrosoftSignIn() {
      const authResult = readOutlookAuthCodeFromUrl();
      if (!authResult?.code) return;

      setGraphLoading(true);
      setGraphError("");

      try {
        if (authResult.error) throw new Error(authResult.error);
        const token = await exchangeOutlookCodeForToken(authResult.code, authResult.state);
        if (cancelled) return;
        setGraphToken(token);
        saveOutlookToken(token);
      } catch (err) {
        if (!cancelled) setGraphError(err.message || "Microsoft sign-in failed.");
      } finally {
        if (!cancelled) setGraphLoading(false);
      }
    }

    finishMicrosoftSignIn();

    return () => {
      cancelled = true;
    };
  }, []);

  function saveAppointments(next) {
    const deduped = dedupeOutlookAppointments(next);
    setAppointments(deduped);
    saveOutlookAppointments(deduped);
  }

  async function connectOutlook() {
    const clientId = getMicrosoftClientId();
    const tenantId = getMicrosoftTenantId();

    if (!clientId) {
      return alert("Missing VITE_MICROSOFT_CLIENT_ID. Add your Azure app client ID to Vercel, then redeploy.");
    }

    if (!tenantId) {
      return alert("Missing VITE_MICROSOFT_TENANT_ID. Add your Azure Directory tenant ID to Vercel, then redeploy.");
    }

    if (tenantId.toLowerCase() === "common") {
      return alert("VITE_MICROSOFT_TENANT_ID cannot be 'common' for this app. Use your Directory tenant ID instead.");
    }

    const verifier = makePkceVerifier();
    const challenge = await makePkceChallenge(verifier);
    const state = makeOutlookAuthState();
    saveOutlookAuthRequest({ verifier, state });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: getOutlookRedirectUri(),
      response_mode: "query",
      scope: "openid profile offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.Read",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      prompt: "select_account",
    });

    window.location.href = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  function disconnectOutlook() {
    clearOutlookToken();
    setGraphToken("");
    setGraphError("");
  }

  async function fetchOutlookAppointments() {
    if (!graphToken) return connectOutlook();
    setGraphLoading(true);
    setGraphError("");

    try {
      const start = startOfDayIso(selectedDate || todayIso());
      const end = startOfDayIso(addDaysIso(selectedDate || todayIso(), Number(rangeDays || 30)));
      const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
      url.searchParams.set("startDateTime", start);
      url.searchParams.set("endDateTime", end);
      url.searchParams.set("$select", "id,subject,bodyPreview,start,end,location,organizer");
      url.searchParams.set("$orderby", "start/dateTime");
      url.searchParams.set("$top", "100");

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${graphToken}`,
          Prefer: 'outlook.timezone="America/Chicago"',
        },
      });

      if (response.status === 401) {
        disconnectOutlook();
        throw new Error("Microsoft sign-in expired. Connect Outlook again.");
      }
      if (!response.ok) throw new Error((await response.text()) || "Failed to load Outlook calendar.");

      const data = await response.json();
      const imported = (data.value || []).map(mapGraphEventToAppointment).filter(Boolean);
      saveAppointments([...imported, ...appointments]);
    } catch (err) {
      setGraphError(err.message || "Unable to load Outlook appointments.");
    } finally {
      setGraphLoading(false);
    }
  }

  function addManualAppointment(e) {
    e.preventDefault();
    const title = manual.title.trim();
    if (!title) return alert("Appointment title is required.");
    saveAppointments([makeOutlookAppointment({ title, date: manual.date || selectedDate || todayIso(), start: manual.start || "08:00", body: manual.body || "" }), ...appointments]);
    setManual({ title: "", date: selectedDate || todayIso(), start: "08:00", body: "" });
  }

  function importPastedAppointments() {
    const parsed = parseOutlookPaste(pasteText, selectedDate);
    if (!parsed.length) return alert("No appointments found. Paste one appointment per line, or use: Title | 2026-06-17 | 08:00 | Notes");
    saveAppointments([...parsed, ...appointments]);
    setPasteText("");
  }

  function removeAppointment(id) {
    saveAppointments(appointments.filter((appt) => appt.id !== id));
  }

  function clearImportedLocal() {
    saveAppointments(appointments.filter((appt) => !importedEventIds.has(appt.outlook_event_id)));
  }

  function saveIcsSettings() {
    saveIcsFeedUrl(icsUrl);
    alert("ICS calendar feed saved.");
  }

  async function syncIcsFeed() {
    const url = String(icsUrl || "").trim();
    if (!url) return alert("Paste your Outlook ICS feed URL first.");

    setIcsLoading(true);
    setIcsError("");

    try {
      saveIcsFeedUrl(url);
      const icsText = await fetchIcsFeedText(url);
      const imported = parseIcsAppointments(icsText)
        .filter((appt) => isAppointmentInRange(appt, selectedDate || todayIso(), Number(rangeDays || 30)));

      if (!imported.length) {
        saveAppointments(appointments);
        setIcsError("The ICS feed loaded, but no appointments were found in the selected range.");
        return;
      }

      saveAppointments([...imported, ...appointments]);
      const syncedAt = new Date().toISOString();
      setIcsLastSync(syncedAt);
      saveIcsLastSync(syncedAt);
    } catch (err) {
      setIcsError(err.message || "Unable to load the ICS calendar feed.");
    } finally {
      setIcsLoading(false);
    }
  }

  return (
    <section className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">Outlook staging lane</p>
          <h3>Auto-load Outlook appointments, then manually convert them to shop jobs</h3>
          <p>Outlook can fill the queue automatically. Nothing becomes a shop job until you review it and click Import as Job.</p>
        </div>
        <div className="heroMetric">
          <span>Ready to Import</span>
          <strong>{visibleAppointments.length}</strong>
        </div>
      </div>

      <Panel title="Outlook ICS calendar feed" chip={icsUrl ? "Feed saved" : "Paste ICS URL"}>
        <div className="outlookForm">
          <label>
            ICS Feed URL
            <input
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
              placeholder="Paste Outlook published calendar .ics link here"
            />
          </label>
        </div>

        <div className="outlookActions" style={{ marginTop: 10, marginBottom: 10 }}>
          <button type="button" onClick={saveIcsSettings}>Save Feed URL</button>
          <button className="primary" type="button" onClick={syncIcsFeed} disabled={icsLoading}>
            {icsLoading ? "Syncing ICS feed..." : "Sync ICS appointments"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
            Range
            <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
              <option value={7}>Next 7 days</option>
              <option value={30}>Next 30 days</option>
              <option value={90}>Next 90 days</option>
              <option value={180}>Next 180 days</option>
              <option value={365}>Next 365 days</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
            <input type="checkbox" checked={showImported} onChange={(e) => setShowImported(e.target.checked)} /> Show imported
          </label>
        </div>

        <p className="outlookHelp">This uses your Outlook published ICS calendar feed. It is read-only, requires no Microsoft login, and appointments still must be reviewed before becoming shop jobs.</p>
        {icsLastSync && <p className="outlookHelp">Last ICS sync: {new Date(icsLastSync).toLocaleString()}</p>}
        {icsError && <p className="bad">{icsError}</p>}
      </Panel>

      <div className="outlookGrid" style={{ marginTop: 14 }}>
        <Panel title="Fallback import" chip="Manual / paste">
          <form className="outlookForm" onSubmit={addManualAppointment}>
            <label>Appointment Title<input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="Example: Smith - 2023 F-250 Airlift" /></label>
            <label>Date<input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></label>
            <label>Start Time<input type="time" value={manual.start} onChange={(e) => setManual({ ...manual, start: e.target.value })} /></label>
            <label>Notes / Body<textarea value={manual.body} onChange={(e) => setManual({ ...manual, body: e.target.value })} placeholder="Paste Outlook appointment body, phone, vehicle, requested work, etc." /></label>
            <button className="primary wide" type="submit">Add to import queue</button>
          </form>

          <div className="outlookForm" style={{ marginTop: 14 }}>
            <label>Paste Outlook appointments<textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"One per line:\nSmith - 2023 F-250 Airlift | 2026-06-18 | 09:00 | WirelessOne notes"} /></label>
            <button type="button" onClick={importPastedAppointments}>Parse pasted appointments</button>
            <p className="outlookHelp">Recommended format: Title | Date | Start Time | Notes.</p>
          </div>
        </Panel>

        <Panel title="Outlook import queue" chip="Review before scheduling">
          <div className="outlookActions" style={{ marginBottom: 10 }}>
            <button type="button" onClick={() => setSelectedDate(todayIso())}>Jump to Today</button>
            <button type="button" onClick={clearImportedLocal}>Clear Imported</button>
          </div>

          <div className="outlookList">
            {visibleAppointments.map((appt) => {
              const imported = importedEventIds.has(appt.outlook_event_id);
              const confidence = getAppointmentConfidence(appt, ctx.products);
              return (
                <article className={`outlookCard ${imported ? "imported" : ""}`} key={appt.id}>
                  <div className="outlookCardTop">
                    <div><h4>{appt.title}</h4><p>{formatOutlookDate(appt.date)} • {formatTime(appt.start)}</p></div>
                    <span className={`outlookBadge ${imported ? "imported" : confidence.className}`}>{imported ? "Imported" : confidence.label}</span>
                  </div>
                  {appt.body && <p>{appt.body}</p>}
                  <div className="outlookActions">
                    <button type="button" onClick={() => { setSelectedDate(appt.date || todayIso()); setSelectedAppointment(appt); }} disabled={imported}>Import as Job</button>
                    <button type="button" onClick={() => removeAppointment(appt.id)}>Remove</button>
                  </div>
                </article>
              );
            })}
            {!visibleAppointments.length && <p className="muted">No Outlook appointments ready. Sync the ICS feed, or add one manually.</p>}
          </div>
        </Panel>
      </div>

      {selectedAppointment && <OutlookImportModal appointment={selectedAppointment} ctx={ctx} reload={reload} onClose={() => setSelectedAppointment(null)} />}
    </section>
  );
}

function OutlookImportModal({ appointment, ctx, reload, onClose }) {
  const suggestedProductId = suggestProductIdFromText(ctx.products, `${appointment.title} ${appointment.body}`) || ctx.products[0]?.id || "";
  const suggestedProduct = ctx.product(suggestedProductId);
  const scheduledId = getStatusIdByName(ctx, "Scheduled") || ctx.statuses[0]?.id || "";
  const [draft, setDraft] = useState({
    customer: guessCustomerFromAppointment(appointment),
    vehicle: guessVehicleFromAppointment(appointment),
    technician_id: ctx.technicians.find((t) => t.active)?.id || "",
    status_id: scheduledId,
    delay_reason_id: "",
    scheduled_date: appointment.date || todayIso(),
    start_time: appointment.start || "08:00",
    qc: "N/A",
    notes: appointment.body || appointment.title || "",
  });
  const [productLines, setProductLines] = useState(() => normalizeProductLines(ctx, [makeProductLine(suggestedProduct || ctx.products[0])], true));

  const totalBookHours = totalProductLineHours(productLines);
  const totalLabor = totalProductLineLabor(productLines);
  const primaryProductId = productLines[0]?.product_id || suggestedProductId || null;

  async function submit(e) {
    e.preventDefault();
    const payload = {
      company_id: ctx.company.id,
      customer: draft.customer || appointment.title || "Outlook Customer",
      vehicle: draft.vehicle || "Vehicle TBD",
      product_id: primaryProductId,
      technician_id: draft.technician_id || null,
      status_id: draft.status_id || null,
      delay_reason_id: draft.delay_reason_id || null,
      scheduled_date: draft.scheduled_date || appointment.date || todayIso(),
      start_time: draft.start_time || appointment.start || "08:00",
      book_hours: totalBookHours,
      actual_hours: null,
      labor_sold: totalLabor || null,
      qc: draft.qc || "N/A",
      notes: draft.notes || "",
      outlook_event_id: appointment.outlook_event_id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("jobs").insert(payload).select("id").single();
    if (error) {
      if ((error.message || "").toLowerCase().includes("duplicate")) {
        return alert("This Outlook appointment has already been imported.");
      }
      return alert(error.message);
    }

    const lineError = await saveJobProductLines(ctx.company.id, data.id, productLines);
    if (lineError) return alert(lineError.message || lineError);

    await reload();
    onClose();
  }

  return (
    <div className="modalBackdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modalHeader">
          <h3>Import Outlook Appointment</h3>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="formGrid">
          <label>
            Customer
            <input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} required />
          </label>
          <label>
            Vehicle
            <input value={draft.vehicle} onChange={(e) => setDraft({ ...draft, vehicle: e.target.value })} required />
          </label>
          <ProductLinesEditor ctx={ctx} lines={productLines} setLines={setProductLines} />
          <label>
            Technician
            <select value={draft.technician_id} onChange={(e) => setDraft({ ...draft, technician_id: e.target.value })}>
              {ctx.technicians.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={draft.status_id} onChange={(e) => setDraft({ ...draft, status_id: e.target.value })}>
              {ctx.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>
            Scheduled Date
            <input type="date" value={draft.scheduled_date} onChange={(e) => setDraft({ ...draft, scheduled_date: e.target.value })} />
          </label>
          <label>
            Start Time
            <input type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
          </label>
          <label>
            Total Book Hours
            <input type="number" step="0.25" value={totalBookHours} readOnly />
          </label>
          <label>
            QC
            <select value={draft.qc} onChange={(e) => setDraft({ ...draft, qc: e.target.value })}>
              <option>Yes</option>
              <option>No</option>
              <option>N/A</option>
            </select>
          </label>
          <label className="fullWidth">
            Notes
            <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
        </div>

        <button className="primary wide">Create Scheduled Job</button>
      </form>
    </div>
  );
}

function EditJobModal({ job, ctx, reload, onClose }) {
  const existingLines = ctx.jobProductLines(job.id);
  const [productLines, setProductLines] = useState(() =>
    normalizeProductLines(ctx, existingLines.length ? existingLines : [makeProductLine(ctx.product(job.product_id), job.book_hours, job.labor_sold)], true)
  );
  const [draft, setDraft] = useState({
    ...job,
    technician_id: job.technician_id || "",
    status_id: job.status_id || "",
    delay_reason_id: job.delay_reason_id || "",
    customer: job.customer || "",
    vehicle: job.vehicle || "",
    start_time: shortTime(job.start_time || "08:00"),
    scheduled_date: job.scheduled_date || todayIso(),
    actual_hours: job.actual_hours ?? "",
    qc: job.qc || "N/A",
    notes: job.notes || "",
  });

  const totalBookHours = totalProductLineHours(productLines);
  const totalLabor = totalProductLineLabor(productLines);
  const primaryProductId = productLines[0]?.product_id || null;

  async function saveJob(e) {
    e.preventDefault();

    const payload = {
      customer: draft.customer,
      vehicle: draft.vehicle,
      product_id: primaryProductId,
      technician_id: draft.technician_id,
      status_id: draft.status_id,
      delay_reason_id: draft.delay_reason_id || null,
      start_time: draft.start_time,
      scheduled_date: draft.scheduled_date || todayIso(),
      book_hours: totalBookHours,
      actual_hours: draft.actual_hours === "" ? null : Number(draft.actual_hours),
      labor_sold: totalLabor || null,
      qc: draft.qc,
      notes: draft.notes,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) return alert(error.message);

    const lineError = await saveJobProductLines(ctx.company.id, job.id, productLines);
    if (lineError) return alert(lineError.message || lineError);

    await reload();
    onClose();
  }

  return (
    <div className="modalBackdrop">
      <form className="modal" onSubmit={saveJob}>
        <div className="modalHeader">
          <h3>Edit Job</h3>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="formGrid">
          <label>
            Customer
            <input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} />
          </label>

          <label>
            Vehicle
            <input value={draft.vehicle} onChange={(e) => setDraft({ ...draft, vehicle: e.target.value })} />
          </label>

          <ProductLinesEditor ctx={ctx} lines={productLines} setLines={setProductLines} />

          <label>
            Technician
            <select value={draft.technician_id} onChange={(e) => setDraft({ ...draft, technician_id: e.target.value })}>
              {ctx.technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <label>
            Status
            <select value={draft.status_id} onChange={(e) => setDraft({ ...draft, status_id: e.target.value })}>
              {ctx.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <label>
            Delay Reason
            <select value={draft.delay_reason_id || ""} onChange={(e) => setDraft({ ...draft, delay_reason_id: e.target.value })}>
              <option value="">None</option>
              {ctx.delayReasons.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>

          <label>
            Scheduled Date
            <input type="date" value={draft.scheduled_date} onChange={(e) => setDraft({ ...draft, scheduled_date: e.target.value })} />
          </label>

          <label>
            Start Time
            <input type="time" value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
          </label>

          <label>
            Total Book Hours
            <input type="number" step="0.25" value={totalBookHours} readOnly />
          </label>

          <label>
            Actual Hours
            <input type="number" step="0.25" value={draft.actual_hours} onChange={(e) => setDraft({ ...draft, actual_hours: e.target.value })} />
          </label>

          <label>
            QC
            <select value={draft.qc} onChange={(e) => setDraft({ ...draft, qc: e.target.value })}>
              <option>Yes</option>
              <option>No</option>
              <option>N/A</option>
            </select>
          </label>

          <label className="fullWidth">
            Notes
            <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
        </div>

        <button className="primary wide">Save Job</button>
      </form>
    </div>
  );
}

function NewJobModal({ onClose, ctx, reload, selectedDate, access }) {
  const firstProduct = ctx.products[0] || null;
  const [productLines, setProductLines] = useState(() => normalizeProductLines(ctx, [makeProductLine(firstProduct)], true));
  const totalBookHours = totalProductLineHours(productLines);
  const totalLabor = totalProductLineLabor(productLines);
  const primaryProductId = productLines[0]?.product_id || null;

  async function submit(e) {
    e.preventDefault();

    const form = new FormData(e.currentTarget);

    const job = {
      company_id: ctx.company.id,
      customer: form.get("customer"),
      vehicle: form.get("vehicle"),
      product_id: primaryProductId,
      technician_id: form.get("technician_id"),
      status_id: form.get("status_id"),
      delay_reason_id: form.get("delay_reason_id") || null,
      start_time: form.get("start_time"),
      book_hours: totalBookHours,
      actual_hours: null,
      qc: form.get("qc"),
      scheduled_date: form.get("scheduled_date") || selectedDate || todayIso(),
      labor_sold: totalLabor || null,
    };

    const { data, error } = await supabase.from("jobs").insert(job).select("id").single();
    if (error) return alert(error.message);

    const lineError = await saveJobProductLines(ctx.company.id, data.id, productLines);
    if (lineError) return alert(lineError.message || lineError);

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
          <ProductLinesEditor ctx={ctx} lines={productLines} setLines={setProductLines} />
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
              <option value="">None</option>
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
            Scheduled Date
            <input name="scheduled_date" type="date" defaultValue={selectedDate || todayIso()} />
          </label>
          <label>
            Start
            <input name="start_time" type="time" defaultValue="08:00" />
          </label>
          <label>
            Total Book Hours
            <input type="number" step="0.25" value={totalBookHours} readOnly />
          </label>
        </div>

        <button className="primary wide">Add job</button>
      </form>
    </div>
  );
}

function ProductLinesEditor({ ctx, lines, setLines }) {
  const safeLines = normalizeProductLines(ctx, lines, true);
  const totalHours = totalProductLineHours(safeLines);
  const totalLabor = totalProductLineLabor(safeLines);

  function updateLine(index, patch) {
    const next = safeLines.map((line, i) => (i === index ? { ...line, ...patch } : line));
    setLines(normalizeProductLines(ctx, next, true));
  }

  function changeProduct(index, productId) {
    const product = ctx.product(productId);
    updateLine(index, {
      product_id: productId,
      book_hours: Number(product?.book_hours || 0),
      labor_price: Number(product?.labor_price || 0),
    });
  }

  function addProduct() {
    const product = ctx.products[0];
    setLines(normalizeProductLines(ctx, [...safeLines, makeProductLine(product)], true));
  }

  function removeProduct(index) {
    const next = safeLines.filter((_, i) => i !== index);
    setLines(normalizeProductLines(ctx, next, true));
  }

  return (
    <div className="productLinesBox">
      <div className="productLinesHead">
        <h4>Products on this appointment</h4>
        <button type="button" onClick={addProduct}>+ Add Product</button>
      </div>

      {safeLines.map((line, index) => (
        <div className="productLineRow" key={line._key || line.id || index}>
          <label>
            Product
            <select value={line.product_id || ""} onChange={(e) => changeProduct(index, e.target.value)}>
              {ctx.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            Book Hours
            <input type="number" step="0.25" value={line.book_hours} onChange={(e) => updateLine(index, { book_hours: e.target.value })} />
          </label>
          <label>
            Labor
            <input type="number" step="1" value={line.labor_price} onChange={(e) => updateLine(index, { labor_price: e.target.value })} />
          </label>
          <button className="productLineRemove" type="button" onClick={() => removeProduct(index)} disabled={safeLines.length <= 1}>Remove</button>
        </div>
      ))}

      <div className="productLinesTotal">
        <span>Total Book Time: <strong>{totalHours.toFixed(2)} hrs</strong></span>
        <span>Total Labor: <strong>{money(totalLabor)}</strong></span>
      </div>
    </div>
  );
}

function makeProductLine(product, overrideHours = null, overrideLabor = null) {
  return {
    _key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    product_id: product?.id || "",
    book_hours: overrideHours ?? Number(product?.book_hours || 0),
    labor_price: overrideLabor ?? Number(product?.labor_price || 0),
  };
}

function normalizeProductLines(ctx, lines, ensureOne = false) {
  const clean = (lines || [])
    .filter((line) => line && line.product_id)
    .map((line, index) => {
      const product = ctx.product(line.product_id) || ctx.products[0] || null;
      return {
        ...line,
        _key: line._key || line.id || `${line.product_id || "line"}-${index}-${Math.random().toString(16).slice(2)}`,
        product_id: line.product_id || product?.id || "",
        book_hours: line.book_hours === "" ? "" : Number(line.book_hours ?? product?.book_hours ?? 0),
        labor_price: line.labor_price === "" ? "" : Number(line.labor_price ?? product?.labor_price ?? 0),
        sort_order: index,
      };
    });

  if (!clean.length && ensureOne && ctx.products[0]) clean.push(makeProductLine(ctx.products[0]));
  return clean;
}

function totalProductLineHours(lines) {
  return Number((lines || []).reduce((sum, line) => sum + Number(line.book_hours || 0), 0).toFixed(2));
}

function totalProductLineLabor(lines) {
  return Number((lines || []).reduce((sum, line) => sum + Number(line.labor_price || 0), 0).toFixed(2));
}

async function saveJobProductLines(companyId, jobId, lines) {
  const { error: deleteError } = await supabase.from("job_products").delete().eq("job_id", jobId);
  if (deleteError) return deleteError;

  const payload = (lines || [])
    .filter((line) => line.product_id)
    .map((line, index) => ({
      company_id: companyId,
      job_id: jobId,
      product_id: line.product_id,
      book_hours: Number(line.book_hours || 0),
      labor_price: Number(line.labor_price || 0),
      sort_order: index,
    }));

  if (!payload.length) return null;

  const { error } = await supabase.from("job_products").insert(payload);
  return error || null;
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
  const productName = ctx.jobProductsSummary(job);
  const tech = ctx.tech(job.technician_id);
  const status = ctx.status(job.status_id);
  const eff = efficiency(job);

  return (
    <article className="jobCard" style={{ borderLeftColor: status?.color || "#f59e0b" }}>
      <div>
        <h4>
          {productName} — {job.vehicle}
        </h4>
        <p>
          {job.customer} • {tech?.name} • {formatTime(shortTime(job.start_time))} • {job.book_hours} book hrs
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

function TechLeaderboard({ jobs, ctx, detailed = false, monthly = false }) {
  const sourceJobs = monthly ? currentMonthCompletedJobs(jobs, ctx) : jobs;
  const rows = ctx.technicians
    .map((tech) => {
      const stats = getTechStats(sourceJobs, ctx, tech.id, { monthly });
      return { tech, stats, savedHours: stats.bookHours - stats.actualHours };
    })
    .sort((a, b) => {
      if (b.stats.efficiency !== a.stats.efficiency) return b.stats.efficiency - a.stats.efficiency;
      if (b.stats.completedJobs !== a.stats.completedJobs) return b.stats.completedJobs - a.stats.completedJobs;
      return b.stats.bookHours - a.stats.bookHours;
    });

  const shopStats = getTechStats(sourceJobs, ctx, null, { monthly });
  const best = rows.find((row) => row.stats.completedJobs > 0);

  return (
    <div className="leaderList">
      {monthly && (
        <div className="leader monthlySummary">
          <div>
            <b>{currentMonthLabel()} Shop Average</b>
            <span>
              {shopStats.completedJobs} jobs • {shopStats.helperBookHours.toFixed(1)} helper book hrs • {shopStats.helperActualHours.toFixed(1)} hours helped • {shopStats.bookHours.toFixed(1)} book hrs • Best: {best?.tech?.name || "—"}
            </span>
          </div>
          <strong className={effClass(shopStats.efficiency)}>{shopStats.efficiency ? `${Math.round(shopStats.efficiency)}%` : "—"}</strong>
        </div>
      )}
      {rows.map(({ tech, stats, savedHours }, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`;
        return (
          <div className={`leader ${index < 3 ? `leaderTop${index + 1}` : ""}`} key={tech.id}>
            <div>
              <b>
                {medal} {tech.name}
              </b>
              <span>
                {stats.completedJobs} jobs • helped {stats.helperActualHours.toFixed(1)}h • received {stats.helpReceivedActualHours.toFixed(1)}h • {stats.bookHours.toFixed(1)} book / {stats.actualHours.toFixed(1)} actual • {savedHours >= 0 ? "+" : ""}{savedHours.toFixed(1)} hrs saved
                {detailed ? ` • avg ${stats.avgActual.toFixed(2)}h` : ""}
              </span>
            </div>
            <strong className={effClass(stats.efficiency)}>{stats.efficiency ? `${Math.round(stats.efficiency)}%` : "—"}</strong>
          </div>
        );
      })}
    </div>
  );
}

function currentMonthCompletedJobs(jobs, ctx) {
  const now = new Date();
  return jobs.filter((job) => {
    if (!ctx.isComplete(job.status_id)) return false;
    const completedAt = job.production_completed_at || job.updated_at || job.created_at;
    if (!completedAt) return false;
    const d = new Date(completedAt);
    if (Number.isNaN(d.getTime())) return false;
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
}

function currentMonthLabel() {
  return new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
  const slug = getStoreSlug();
  let query = supabase.from("companies").select("*").limit(1);
  query = slug ? query.eq("slug", slug) : query.eq("name", "H&H Truck & Outdoor");
  const { data, error } = await query.single();

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


async function fetchOptionalJobHelpers(companyId) {
  const { data, error } = await supabase
    .from("job_helpers")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.code === "42P01" || String(error.message || "").toLowerCase().includes("job_helpers")) return [];
    throw error;
  }

  return data || [];
}

async function fetchOptionalTechnicianAttendance(companyId) {
  const { data, error } = await supabase
    .from("technician_attendance")
    .select("*")
    .eq("company_id", companyId)
    .order("work_date", { ascending: false });

  if (error) {
    if (error.code === "42P01" || String(error.message || "").toLowerCase().includes("technician_attendance")) return [];
    throw error;
  }

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

function calculateMetrics(jobs, ctx, selectedDate = todayIso()) {
  const completed = jobs.filter((j) => ctx.isComplete(j.status_id) && Number(j.actual_hours) > 0);
  const helperStats = getHelperPerformanceStats(ctx, null, { selectedDate });
  const receivedStats = getHelpReceivedStats(ctx, null, { selectedDate });
  const jobBookComplete = completed.reduce((a, j) => a + Number(j.book_hours || 0), 0);
  const jobActualUsed = completed.reduce((a, j) => a + Number(j.actual_hours || 0), 0);
  const bookComplete = jobBookComplete + helperStats.bookHours;
  const actualUsed = jobActualUsed + helperStats.actualHours;
  const clockedInTechs = getClockedInTechnicians(ctx, selectedDate);
  const availableTechCount = clockedInTechs.length || 1;

  return {
    capacity: Math.min(
      100,
      Math.round(
        ((jobs.reduce((a, j) => a + Number(j.book_hours || 0), 0) + helperStats.bookHours) /
          (availableTechCount * 8 || 1)) *
          100
      )
    ),
    efficiency: actualUsed ? (bookComplete / actualUsed) * 100 : 0,
    completedJobs: completed.length,
    bookComplete,
    actualUsed,
    helperBookComplete: helperStats.bookHours,
    helperActualUsed: helperStats.actualHours,
    helpReceivedBookComplete: receivedStats.bookHours,
    helpReceivedActualUsed: receivedStats.actualHours,
    avgActualTime: completed.length ? jobActualUsed / completed.length : 0,
  };
}


function makeContext(state) {
  const product = (id) => state.products.find((p) => p.id === id);
  const category = (id) => state.categories.find((c) => c.id === id);
  const laborRate = (id) => state.laborRates.find((r) => r.id === id);
  const status = (id) => state.statuses.find((s) => s.id === id);
  const tech = (id) => state.technicians.find((t) => t.id === id);
  const jobProductLines = (jobId) => (state.jobProducts || [])
    .filter((line) => line.job_id === jobId)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const jobProductsSummary = (job) => {
    const lines = jobProductLines(job.id);
    if (!lines.length) return product(job.product_id)?.name || "Unknown Job";
    return lines.map((line) => product(line.product_id)?.name || "Unknown Product").join(" + ");
  };
  const isComplete = (statusId) => (status(statusId)?.name || "").toLowerCase().includes("complete");

  const laborSold = (job) => {
    const lines = jobProductLines(job.id);
    if (lines.length) {
      const lineTotal = lines.reduce((sum, line) => sum + Number(line.labor_price || 0), 0);
      if (lineTotal) return lineTotal;
    }

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

  const attendanceForDate = (technicianId, date = todayIso()) => (state.technicianAttendance || []).find((row) => row.technician_id === technicianId && row.work_date === date);
  const isTechClockedIn = (technicianId, date = todayIso()) => {
    const row = attendanceForDate(technicianId, date);
    return Boolean(row?.clock_in_at && !row?.clock_out_at);
  };

  return {
    ...state,
    product,
    category,
    laborRate,
    status,
    tech,
    jobProductLines,
    jobProductsSummary,
    isComplete,
    laborSold,
    attendanceForDate,
    isTechClockedIn,
    jobHelpers: state.jobHelpers || [],
    technicianAttendance: state.technicianAttendance || [],
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
    jobProducts: [],
    jobHelpers: [],
    technicianAttendance: [],
    shopSettings: null,
    jobs: [],
  };
}

function getClockedInTechnicians(ctx, selectedDate = todayIso()) {
  return (ctx.technicians || []).filter((tech) => tech.active && ctx.isTechClockedIn?.(tech.id, selectedDate));
}

function getTechAttendanceStatus(ctx, technicianId, selectedDate = todayIso()) {
  const row = ctx.attendanceForDate?.(technicianId, selectedDate);
  if (row?.clock_in_at && !row?.clock_out_at) return { label: "Clocked In", row };
  if (row?.clock_in_at && row?.clock_out_at) return { label: "Clocked Out", row };
  return { label: "Not Clocked In", row: null };
}

function formatClock(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return shortTime(value);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

function getJobStartedAt(job) {
  if (!job?.production_started_at) return null;
  const d = new Date(job.production_started_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getScheduledStartDate(job) {
  if (!job?.scheduled_date || !job?.start_time) return null;
  const d = new Date(`${job.scheduled_date}T${shortTime(job.start_time)}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function roundHours(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function efficiency(job) {
  const bookHours = Number(job?.book_hours || 0);
  const actualHours = Number(job?.actual_hours || 0);

  if (!Number.isFinite(bookHours) || !Number.isFinite(actualHours)) return null;
  if (bookHours <= 0 || actualHours <= 0) return null;

  return Math.min(999, (bookHours / actualHours) * 100);
}

function effClass(value) {
  const eff = Number(value);
  if (!Number.isFinite(eff) || eff <= 0) return "";

  if (eff >= 100) return "good";
  if (eff >= 90) return "warn";
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

function formatShortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function hexToSoft(hex = "#64748b") {
  return `${hex}1a`;
}


function getStatusIdByName(ctx, name) {
  return ctx.statuses.find((s) => (s.name || "").toLowerCase() === name.toLowerCase())?.id || "";
}

function getMicrosoftClientId() {
  return import.meta?.env?.VITE_MICROSOFT_CLIENT_ID || "";
}

function getMicrosoftTenantId() {
  return import.meta?.env?.VITE_MICROSOFT_TENANT_ID || "";
}

function getOutlookRedirectUri() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

function readOutlookAuthCodeFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search || "");
  const code = params.get("code") || "";
  const state = params.get("state") || "";
  const error = params.get("error_description") || params.get("error") || "";

  if (!code && !error) return null;

  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);

  return { code, state, error };
}

async function exchangeOutlookCodeForToken(code, returnedState) {
  const clientId = getMicrosoftClientId();
  const tenantId = getMicrosoftTenantId();
  const authRequest = loadOutlookAuthRequest();

  if (!authRequest?.verifier) throw new Error("Missing Microsoft PKCE verifier. Start Outlook sign-in again.");
  if (!authRequest?.state || authRequest.state !== returnedState) throw new Error("Microsoft sign-in state mismatch. Start Outlook sign-in again.");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: getOutlookRedirectUri(),
    code_verifier: authRequest.verifier,
    scope: "openid profile offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.Read",
  });

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json().catch(() => ({}));
  clearOutlookAuthRequest();

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Microsoft token exchange failed.");
  }

  if (!data.access_token) throw new Error("Microsoft did not return an access token.");
  return data.access_token;
}

function makePkceVerifier() {
  const array = new Uint8Array(64);
  window.crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function makePkceChallenge(verifier) {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeOutlookAuthState() {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function saveOutlookAuthRequest(request) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("hhpm_outlook_auth_request", JSON.stringify(request || {}));
}

function loadOutlookAuthRequest() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.sessionStorage.getItem("hhpm_outlook_auth_request") || "null");
  } catch {
    return null;
  }
}

function clearOutlookAuthRequest() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem("hhpm_outlook_auth_request");
}

function loadOutlookToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("hhpm_outlook_graph_token") || "";
}

function saveOutlookToken(token) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("hhpm_outlook_graph_token", token || "");
}

function clearOutlookToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("hhpm_outlook_graph_token");
}

function addDaysIso(dateIso, days) {
  const date = new Date(`${dateIso || todayIso()}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function startOfDayIso(dateIso) {
  return `${dateIso || todayIso()}T00:00:00`;
}

function mapGraphEventToAppointment(event) {
  if (!event?.id) return null;
  const startDateTime = event.start?.dateTime || "";
  const date = normalizeDateInput(startDateTime.slice(0, 10)) || todayIso();
  const start = shortTime(startDateTime.slice(11, 16) || "08:00");
  const title = event.subject || "Outlook Appointment";
  const bodyParts = [
    event.bodyPreview,
    event.location?.displayName ? `Location: ${event.location.displayName}` : "",
    event.organizer?.emailAddress?.name || event.organizer?.emailAddress?.address ? `Organizer: ${event.organizer?.emailAddress?.name || ""} ${event.organizer?.emailAddress?.address || ""}` : "",
  ].filter(Boolean);

  return {
    id: `graph-${event.id}`,
    outlook_event_id: `graph-${event.id}`,
    title,
    date,
    start,
    body: bodyParts.join("\n"),
    source: "Microsoft Graph",
    raw: event,
  };
}

function dedupeOutlookAppointments(appointments) {
  const seen = new Set();
  return appointments.filter((appt) => {
    const key = appt.outlook_event_id || appt.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getAppointmentConfidence(appt, products = []) {
  const text = `${appt.title || ""} ${appt.body || ""}`;
  const hasProduct = Boolean(suggestProductIdFromText(products, text));
  const hasVehicle = guessVehicleFromAppointment(appt) !== "Vehicle TBD";
  if (hasProduct && hasVehicle) return { label: "High match", className: "high" };
  if (hasProduct || hasVehicle) return { label: "Needs review", className: "medium" };
  return { label: "Missing info", className: "low" };
}

function loadOutlookAppointments() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem("hhpm_outlook_queue") || "[]");
  } catch {
    return [];
  }
}

function saveOutlookAppointments(appointments) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("hhpm_outlook_queue", JSON.stringify(appointments));
  }
}

function makeOutlookAppointment({ title, date, start, body }) {
  const cleanTitle = title || "Outlook Appointment";
  const cleanDate = normalizeDateInput(date) || todayIso();
  const cleanStart = normalizeTimeInput(start) || "08:00";
  const seed = `${cleanTitle}|${cleanDate}|${cleanStart}|${body || ""}`;
  return {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    outlook_event_id: `manual-${hashString(seed)}`,
    title: cleanTitle,
    date: cleanDate,
    start: cleanStart,
    body: body || "",
  };
}

function parseOutlookPaste(text, fallbackDate) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length >= 3) {
        return makeOutlookAppointment({
          title: parts[0],
          date: parts[1] || fallbackDate || todayIso(),
          start: parts[2] || "08:00",
          body: parts.slice(3).join(" | "),
        });
      }

      const dateMatch = line.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
      const timeMatch = line.match(/\b(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?|\d{1,2}\s?(?:AM|PM|am|pm))\b/);
      let title = line;
      if (dateMatch) title = title.replace(dateMatch[0], "").trim();
      if (timeMatch) title = title.replace(timeMatch[0], "").trim();
      title = title.replace(/^[|,\-\s]+|[|,\-\s]+$/g, "") || line;

      return makeOutlookAppointment({
        title,
        date: dateMatch ? dateMatch[0] : fallbackDate || todayIso(),
        start: timeMatch ? timeMatch[0] : "08:00",
        body: line,
      });
    });
}


function loadIcsFeedUrl() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("hhpm_ics_feed_url") || "";
}

function saveIcsFeedUrl(url) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("hhpm_ics_feed_url", String(url || "").trim());
}

function loadIcsLastSync() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("hhpm_ics_last_sync") || "";
}

function saveIcsLastSync(value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("hhpm_ics_last_sync", value || "");
}

async function fetchIcsFeedText(url) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) throw new Error("Missing ICS feed URL.");

  const localProxy = `/api/ics?url=${encodeURIComponent(cleanUrl)}`;
  const attempts = [localProxy];

  let lastError = "";
  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const response = await fetch(attempt, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch (_) {}
        throw new Error(message);
      }

      const text = await response.text();
      if (!/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(text)) {
        throw new Error("That URL did not return a valid ICS calendar.");
      }
      return text;
    } catch (err) {
      lastError = err.name === "AbortError" ? "ICS request timed out." : (err.message || String(err));
    }
  }

  throw new Error(`Unable to load the ICS feed through the Vercel proxy. ${lastError}`);
}

function parseIcsAppointments(icsText) {
  const unfolded = String(icsText || "").replace(/\r?\n[ \t]/g, "");
  const events = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  return events
    .map((block) => {
      const uid = getIcsField(block, "UID") || hashString(block);
      const title = decodeIcsText(getIcsField(block, "SUMMARY") || "Outlook Appointment");
      const description = decodeIcsText(getIcsField(block, "DESCRIPTION") || "");
      const location = decodeIcsText(getIcsField(block, "LOCATION") || "");
      const dtStart = getIcsField(block, "DTSTART");
      const parsedStart = parseIcsDateTime(dtStart);
      if (!parsedStart?.date) return null;

      const body = [description, location ? `Location: ${location}` : ""]
        .filter(Boolean)
        .join("\n");

      return {
        id: `ics-${hashString(`${uid}|${parsedStart.date}|${parsedStart.time}`)}`,
        outlook_event_id: `ics-${uid}`,
        title,
        date: parsedStart.date,
        start: parsedStart.time || "08:00",
        body,
        source: "ICS Feed",
      };
    })
    .filter(Boolean);
}

function getIcsField(block, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}(?:;[^:]*)?:(.*)$`, "im");
  return block.match(regex)?.[1]?.trim() || "";
}

function decodeIcsText(value) {
  return String(value || "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: "08:00" };

  const dateTime = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dateTime) return null;

  if (dateTime[7]) {
    const utc = new Date(Date.UTC(
      Number(dateTime[1]),
      Number(dateTime[2]) - 1,
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
      Number(dateTime[6] || 0)
    ));
    return {
      date: toLocalIsoDate(utc),
      time: `${String(utc.getHours()).padStart(2, "0")}:${String(utc.getMinutes()).padStart(2, "0")}`,
    };
  }

  return {
    date: `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`,
    time: `${dateTime[4]}:${dateTime[5]}`,
  };
}

function toLocalIsoDate(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function isAppointmentInRange(appt, startDate, days) {
  const start = startDate || todayIso();
  const end = addDaysIso(start, Number(days || 30));
  return (appt.date || "") >= start && (appt.date || "") <= end;
}

function normalizeDateInput(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = slash[1].padStart(2, "0");
    const day = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
  }
  return "";
}

function normalizeTimeInput(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) return `${twentyFour[1].padStart(2, "0")}:${twentyFour[2]}`;
  const ampm = raw.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM|am|pm)$/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2] || "00";
    const suffix = ampm[3].toLowerCase();
    if (suffix === "pm" && h < 12) h += 12;
    if (suffix === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  return raw.slice(0, 5);
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function guessCustomerFromAppointment(appointment) {
  const title = appointment.title || "";
  const beforeDash = title.split(/[-–—|]/)[0]?.trim();
  return beforeDash || title || "Outlook Customer";
}

function guessVehicleFromAppointment(appointment) {
  const text = `${appointment.title || ""} ${appointment.body || ""}`;
  const vehicle = text.match(/\b(19|20)\d{2}\s+[A-Za-z]+\s+[A-Za-z0-9][A-Za-z0-9\- ]{1,30}\b/);
  return vehicle ? vehicle[0].trim() : "Vehicle TBD";
}

function suggestProductIdFromText(products, text) {
  const haystack = String(text || "").toLowerCase();
  const exact = products.find((product) => haystack.includes((product.name || "").toLowerCase()));
  if (exact) return exact.id;

  const keywordMap = [
    ["airlift", "airlift"],
    ["air lift", "airlift"],
    ["wireless", "wireless"],
    ["gooseneck", "gooseneck"],
    ["b&w", "gooseneck"],
    ["bedliner", "bedliner"],
    ["bed liner", "bedliner"],
    ["camper", "camper"],
    ["shell", "camper"],
    ["level", "level"],
    ["lift", "lift"],
    ["tint", "tint"],
  ];

  for (const [needle, productNeedle] of keywordMap) {
    if (haystack.includes(needle)) {
      const match = products.find((product) => (product.name || "").toLowerCase().includes(productNeedle));
      if (match) return match.id;
    }
  }

  return "";
}

function formatOutlookDate(value) {
  const normalized = normalizeDateInput(value) || value;
  const d = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(d.getTime())) return normalized || "No date";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}


function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function getStoreSlug() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const queryStore = params.get("store");
  if (queryStore) return queryStore;
  const firstPath = window.location.pathname.split("/").filter(Boolean)[0];
  return firstPath && firstPath !== "app" ? firstPath : "";
}

function jobDate(job) {
  return job.scheduled_date || todayIso();
}

function jobsForDate(jobs, date) {
  return jobs.filter((job) => jobDate(job) === date);
}

async function rollForwardOverdueJobs(companyId, jobs, statuses) {
  const today = todayIso();
  const completeIds = statuses
    .filter((s) => (s.name || "").toLowerCase().includes("complete"))
    .map((s) => s.id);

  const overdue = jobs.filter(
    (job) =>
      job.scheduled_date &&
      job.scheduled_date < today &&
      !completeIds.includes(job.status_id)
  );

  if (!overdue.length) return jobs;

  const { error } = await supabase
    .from("jobs")
    .update({ scheduled_date: today, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .in("id", overdue.map((job) => job.id));

  if (error) {
    console.error(error);
    return jobs;
  }

  const { data, error: reloadError } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (reloadError) {
    console.error(reloadError);
    return jobs;
  }

  return data || jobs;
}

function makeAccessFromProfile(profile) {
  if (!profile) return null;
  const role = normalizeRole(profile.role);
  return {
    role,
    technicianId: profile.technician_id || "",
    companyId: profile.company_id || profile.companies?.id || "",
    fullName: profile.full_name || "",
    email: profile.email || "",
  };
}

function normalizeRole(role) {
  const value = String(role || "technician").toLowerCase();
  if (value === "tech") return "technician";
  if (["admin", "manager", "foreman", "service_writer", "technician"].includes(value)) return value;
  return "technician";
}

function getAllowedViewNames(access) {
  const role = normalizeRole(access?.role);
  const map = {
    admin: ["Performance", "Mobile Manager", "Dashboard", "Schedule", "Outlook Calendar", "Foreman", "Production Log", "Technicians", "Tech Clock", "Products", "Admin", "Cloud Status"],
    manager: ["Performance", "Mobile Manager", "Dashboard", "Schedule", "Outlook Calendar", "Foreman", "Production Log", "Technicians", "Tech Clock", "Products", "Cloud Status"],
    foreman: ["Mobile Manager", "Dashboard", "Schedule", "Foreman", "Production Log", "Technicians"],
    service_writer: ["Dashboard", "Schedule", "Outlook Calendar", "Production Log"],
    technician: ["Mobile Manager", "Dashboard"],
  };
  return map[role] || map.technician;
}

function filterJobsForAccess(jobs, access) {
  const role = normalizeRole(access?.role);
  if (role === "technician" && access?.technicianId) {
    return jobs.filter((job) => job.technician_id === access.technicianId);
  }
  return jobs;
}

function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
}

function notifyUser(message) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("H&H Production", { body: message });
  }
}

function AccessGate({ technicians, onSave }) {
  const [role, setRole] = useState("manager");
  const [technicianId, setTechnicianId] = useState(technicians[0]?.id || "");

  function submit(e) {
    e.preventDefault();
    const access = saveAccess({ role, technicianId: role === "tech" ? technicianId : "" });
    onSave(access);
  }

  return (
    <div className="accessGate">
      <form className="accessPanel" onSubmit={submit}>
        <div className="brandLogo">H&H</div>
        <h1>Production Access</h1>
        <p className="muted">Choose the mode for this device. For full security, connect this to Supabase Auth before multi-store rollout.</p>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="foreman">Foreman</option>
            <option value="tech">Technician</option>
          </select>
        </label>
        {role === "tech" && (
          <label>
            Technician
            <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              {technicians.filter((t) => t.active).map((tech) => (
                <option value={tech.id} key={tech.id}>{tech.name}</option>
              ))}
            </select>
          </label>
        )}
        <button className="primary wide">Continue</button>
      </form>
    </div>
  );
}

function LiveTechnicianAvailability({ jobs, ctx }) {
  const now = new Date();

  function getTechCurrentJob(techId) {
    const activeStatusNames = ["In Progress", "Waiting", "QC"];
    const helperAssignment = getHelperAssignmentForTech(techId, ctx, todayIso());
    if (helperAssignment) {
      const primaryJob = (ctx.jobs || jobs).find((j) => j.id === helperAssignment.job_id);
      if (primaryJob && !ctx.isComplete(primaryJob.status_id)) {
        return {
          ...primaryJob,
          technician_id: techId,
          start_time: shortTime(helperAssignment.start_time),
          book_hours: Number(helperAssignment.book_hours || 0),
          helper_assignment: helperAssignment,
          helper_label: `Assisting ${getPrimaryTechNameForJob(primaryJob, ctx)}`,
        };
      }
    }

    return jobs
      .filter(
        (j) =>
          j.technician_id === techId &&
          !ctx.isComplete(j.status_id) &&
          activeStatusNames.includes(ctx.status(j.status_id)?.name)
      )
      .sort((a, b) => {
        const aStarted = a.production_started_at || a.updated_at || a.created_at || "";
        const bStarted = b.production_started_at || b.updated_at || b.created_at || "";
        return String(aStarted).localeCompare(String(bStarted));
      })[0];
  }

  function getProjectedFinish(job) {
    if (!job?.book_hours) return null;

    let start = null;

    if (job.production_started_at) {
      start = new Date(job.production_started_at);
    } else if (job.start_time) {
      const [h, m] = shortTime(job.start_time).split(":").map(Number);
      start = new Date();
      start.setHours(h, m, 0, 0);
    }

    if (!start || Number.isNaN(start.getTime())) return null;

    const projected = getJobProjectedFinish({ ...job, start_time: shortTime(start.toTimeString()) }, ctx);
    const [fh, fm] = shortTime(projected.finishTime).split(":").map(Number);
    const finish = new Date(start);
    finish.setHours(fh, fm, 0, 0);
    if (projected.dayOffset) finish.setDate(finish.getDate() + projected.dayOffset);
    return finish;
  }

  function getTimeRemaining(finish, hasCurrentJob) {
    if (!finish) return hasCurrentJob ? "Unknown" : "0:00";

    const diffMs = finish - now;
    const totalMinutes = Math.ceil(Math.abs(diffMs) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const value = `${hours}:${String(minutes).padStart(2, "0")}`;

    return diffMs < 0 ? `-${value}` : value;
  }

  function isOverdue(finish, hasCurrentJob) {
    return Boolean(hasCurrentJob && finish && finish < now);
  }

  function formatAvailableAt(finish, hasCurrentJob) {
    if (!hasCurrentJob) return "Now";
    if (!finish) return "Unknown";
    if (finish <= now) return "Overdue";
    return finish.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function getNextJob(techId, currentJobId) {
    return jobs.find(
      (j) =>
        j.technician_id === techId &&
        j.id !== currentJobId &&
        ctx.status(j.status_id)?.name === "Scheduled"
    );
  }

  return (
    <Panel title="Live Technician Availability" chip="Current">
      <div className="availabilityTable">
        <div className="availabilityRow availabilityHeader">
          <span>Technician</span>
          <span>Current Job</span>
          <span>Status</span>
          <span>Time Remaining</span>
          <span>Available At</span>
          <span>Next Job</span>
        </div>

        {ctx.technicians
          .filter((t) => t.active)
          .map((tech) => {
            const clockedIn = ctx.isTechClockedIn?.(tech.id, todayIso());
            const attendanceStatus = getTechAttendanceStatus(ctx, tech.id, todayIso());
            const currentJob = clockedIn ? getTechCurrentJob(tech.id) : null;
            const finish = getProjectedFinish(currentJob);
            const overdue = isOverdue(finish, Boolean(currentJob));
            const nextJob = clockedIn ? getNextJob(tech.id, currentJob?.id) : null;
            const status = !clockedIn
              ? attendanceStatus.label
              : currentJob
                ? overdue
                  ? `${ctx.status(currentJob.status_id)?.name || "Working"} • Overdue`
                  : ctx.status(currentJob.status_id)?.name
                : "Available";
            const product = !clockedIn ? "Not Available" : currentJob ? currentJob.helper_label || ctx.jobProductsSummary(currentJob) : "Available";
            const nextProduct = nextJob ? ctx.jobProductsSummary(nextJob) : "—";

            return (
              <div
                className={`availabilityRow ${
                  !clockedIn
                    ? "availabilityOffClock"
                    : overdue
                      ? "availabilityOverdue"
                      : currentJob
                        ? "availabilityBusy"
                        : "availabilityAvailable"
                }`}
                key={tech.id}
              >
                <strong>{tech.name}</strong>
                <span>{product}</span>
                <span>{status}</span>
                <span className={overdue ? "negativeTime" : ""}>{clockedIn ? getTimeRemaining(finish, Boolean(currentJob)) : "—"}</span>
                <span>{clockedIn ? formatAvailableAt(finish, Boolean(currentJob)) : "Not clocked in"}</span>
                <span>{nextProduct}</span>
              </div>
            );
          })}
      </div>
    </Panel>
  );
}
