import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardList,
  Database,
  ImagePlus,
  Edit3,
  LayoutDashboard,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Smartphone,
  Trophy,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "../supabaseClient";

const nav = [
  ["Performance", BarChart3],
  ["Mobile Manager", Smartphone],
  ["Notifications", Bell],
  ["Hall of Fame", Trophy],
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

const navGroups = [
  ["Command", ["Performance", "Mobile Manager", "Notifications", "Hall of Fame"]],
  ["Operations", ["Dashboard", "Schedule", "Outlook Calendar", "Foreman", "Production Log"]],
  ["Shop Setup", ["Technicians", "Tech Clock", "Products"]],
  ["System", ["Admin", "Cloud Status"]],
];

const LIVE_REFRESH_MS = 3000;
const ACTIVE_VIEW_STORAGE_KEY = "hhpm_v1_active_view";

function readStoredActiveView() {
  if (typeof window === "undefined") return "Dashboard";
  try {
    return window.localStorage?.getItem(ACTIVE_VIEW_STORAGE_KEY) || "Dashboard";
  } catch (_) {
    return "Dashboard";
  }
}

function writeStoredActiveView(nextView) {
  if (typeof window === "undefined" || !nextView) return;
  try {
    window.localStorage?.setItem(ACTIVE_VIEW_STORAGE_KEY, nextView);
  } catch (_) {}
}

function getDefaultViewForAccess(access) {
  const allowed = getAllowedViewNames(access);
  return allowed[0] || "Mobile Manager";
}

function getNavIcon(name) {
  return nav.find(([navName]) => navName === name)?.[1] || LayoutDashboard;
}

export default function ProductionManager({ authProfile, onSignOut }) {
  const [view, setView] = useState(readStoredActiveView);
  const [showNewJob, setShowNewJob] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [state, setState] = useState(emptyState());
  const [loading, setLoading] = useState(true);
  const [cloudError, setCloudError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const access = useMemo(() => makeAccessFromProfile(authProfile), [authProfile]);
  const notifiedRealtimeIds = useRef(new Set());
  const notificationPollSeeded = useRef(false);
  const notificationPollRunning = useRef(false);
  const liveRefreshRunning = useRef(false);
  const notificationAudioRef = useRef(null);
  const pushRegistrationAttempted = useRef(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    writeStoredActiveView(view);
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__hhNotificationAudioRef = notificationAudioRef;
    return () => {
      if (window.__hhNotificationAudioRef === notificationAudioRef) delete window.__hhNotificationAudioRef;
    };
  }, []);

  const pwaInstall = usePwaInstall();

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
        comebackReworkResult,
        auditLogResult,
        accessLogResult,
        damagePhotosResult,
        notificationResult,
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
        fetchOptionalComebackRework(companyId),
        fetchOptionalAuditLogs(companyId),
        fetchOptionalAccessLogs(companyId),
        fetchOptionalDamagePhotos(companyId),
        fetchOptionalNotifications(companyId),
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
        comebackRework: comebackReworkResult || [],
        auditLogs: auditLogResult || [],
        accessLogs: accessLogResult || [],
        damagePhotos: damagePhotosResult || [],
        notifications: notificationResult || [],
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comeback_rework", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_logs", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "access_logs", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_damage_photos", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "statuses", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delay_reasons", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_settings", filter: `company_id=eq.${state.company.id}` },
        loadAll
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_notifications", filter: `company_id=eq.${state.company.id}` },
        (payload) => {
          const notification = payload.new;
          if (notification?.id && !notifiedRealtimeIds.current.has(notification.id) && canReceiveNotification(notification, access)) {
            notifiedRealtimeIds.current.add(notification.id);
            notifyRealtimeNotification(notification);
          }
          loadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "app_notifications", filter: `company_id=eq.${state.company.id}` },
        (payload) => {
          const notification = payload.new;
          if (notification?.id && !notifiedRealtimeIds.current.has(notification.id) && canReceiveNotification(notification, access)) {
            notifiedRealtimeIds.current.add(notification.id);
            notifyRealtimeNotification(notification);
          }
          loadAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.company?.id, access]);

  useEffect(() => {
    if (!supabase || !state.company?.id) return undefined;

    let cancelled = false;

    async function refreshLiveData({ silent = false } = {}) {
      if (liveRefreshRunning.current) return;
      liveRefreshRunning.current = true;

      try {
        const companyId = state.company.id;
        const [
          jobs,
          jobProducts,
          jobHelpers,
          technicianAttendance,
          comebackRework,
          auditLogs,
          damagePhotos,
          notifications,
        ] = await Promise.all([
          fetchJobs(companyId),
          fetchTable("job_products", companyId),
          fetchOptionalJobHelpers(companyId),
          fetchOptionalTechnicianAttendance(companyId),
          fetchOptionalComebackRework(companyId),
          fetchOptionalAuditLogs(companyId),
          fetchOptionalDamagePhotos(companyId),
          fetchOptionalNotifications(companyId),
        ]);
        if (cancelled) return;

        const visibleNotifications = (notifications || [])
          .filter((notification) => canReceiveNotification(notification, access))
          .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

        if (!notificationPollSeeded.current) {
          visibleNotifications.forEach((notification) => {
            if (notification?.id) notifiedRealtimeIds.current.add(notification.id);
          });
          notificationPollSeeded.current = true;
        } else {
          const newNotifications = visibleNotifications.filter(
            (notification) => notification?.id && !notifiedRealtimeIds.current.has(notification.id)
          );
          newNotifications.forEach((notification) => {
            notifiedRealtimeIds.current.add(notification.id);
            if (!silent) notifyRealtimeNotification(notification);
          });
        }

        setState((current) => ({
          ...current,
          jobs: jobs || current.jobs,
          jobProducts: jobProducts || current.jobProducts,
          jobHelpers: jobHelpers || current.jobHelpers,
          technicianAttendance: technicianAttendance || current.technicianAttendance,
          comebackRework: comebackRework || current.comebackRework,
          auditLogs: auditLogs || current.auditLogs,
          damagePhotos: damagePhotos || current.damagePhotos,
          notifications: notifications || [],
        }));
      } catch (error) {
        console.warn("Live refresh failed", error);
      } finally {
        liveRefreshRunning.current = false;
      }
    }

    refreshLiveData({ silent: true });
    const intervalId = window.setInterval(() => refreshLiveData(), LIVE_REFRESH_MS);

    const handleFocus = () => refreshLiveData();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshLiveData();
    };
    const handleOnline = () => refreshLiveData();
    const handlePageShow = () => refreshLiveData();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [state.company?.id, access?.role, access?.technicianId, access?.email, access?.fullName]);

  const ctx = useMemo(() => makeContext(state), [state]);
  const allowedViewNames = useMemo(() => getAllowedViewNames(access), [access]);
  const visibleJobs = useMemo(() => filterJobsForAccess(state.jobs, access), [state.jobs, access]);
  const dailyJobs = useMemo(() => jobsForDate(visibleJobs, selectedDate), [visibleJobs, selectedDate]);
  const allDailyJobs = useMemo(() => jobsForDate(state.jobs, selectedDate), [state.jobs, selectedDate]);
  const metrics = useMemo(() => calculateMetrics(dailyJobs, ctx, selectedDate), [dailyJobs, ctx, selectedDate]);

  useEffect(() => {
    if (!allowedViewNames.includes(view)) {
      const fallbackView = getDefaultViewForAccess(access);
      setView(fallbackView);
      writeStoredActiveView(fallbackView);
    }
  }, [allowedViewNames, view, access]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || pushRegistrationAttempted.current) return;
    if (!ctx?.company?.id) return;
    if (window.localStorage?.getItem("hh_notifications_enabled") !== "yes") return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    pushRegistrationAttempted.current = true;
    registerHhPushSubscription(ctx, access).catch((error) => {
      pushRegistrationAttempted.current = false;
      console.warn("Push registration refresh failed", error);
    });
  }, [ctx?.company?.id, access?.role, access?.technicianId, access?.email, access?.fullName]);

  if (loading) {
    return (
      <div className="loading">
        <img className="brandLogo" src="/brand/hh-shield.png" alt="H&H" />
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
          <img className="brandLogo" src="/brand/hh-shield.png" alt="H&H" />
          <div>
            <h1>Production Manager</h1>
            <p>Live cloud shop command center</p>
          </div>
        </div>

        <nav className="sideNavGrouped">
          {navGroups.map(([groupName, itemNames]) => {
            const groupItems = itemNames.filter((name) => allowedViewNames.includes(name));
            if (!groupItems.length) return null;
            return (
              <details key={groupName} className="navGroup" open>
                <summary>{groupName}</summary>
                <div className="navGroupItems">
                  {groupItems.map((name) => {
                    const Icon = getNavIcon(name);
                    return (
                      <button
                        key={name}
                        className={`sidebarButton ${view === name ? "active" : ""}`}
                        onClick={() => setView(name)}
                      >
                        <Icon size={18} />
                        <span>{name}</span>
                      </button>
                    );
                  })}
                </div>
              </details>
            );
          })}
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
              <img className="phoneHeaderLogo" src="/brand/hh-shield.png" alt="H&H" />
              <h2>{view}</h2>
              <input className="phoneDatePicker" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </div>
            <div className="phoneHeaderActions">
              {pwaInstall.canInstall && (
                <button className="phoneInstallButton" onClick={pwaInstall.install} aria-label="Install app">
                  Install
                </button>
              )}
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
  <PerformanceCenter jobs={visibleJobs} ctx={ctx} metrics={metrics} access={access} />
)}
        {view === "Mobile Manager" && (
          <MobileManager jobs={dailyJobs} allJobs={allDailyJobs} ctx={ctx} reload={loadAll} setEditingJob={setEditingJob} selectedDate={selectedDate} access={access} />
        )}
        {view === "Notifications" && <NotificationsCenter ctx={ctx} access={access} reload={loadAll} />}
        {view === "Hall of Fame" && <HallOfFame ctx={ctx} access={access} />}
        {view === "Dashboard" && (isMobile ? <MobileDashboard jobs={dailyJobs} allJobs={allDailyJobs} ctx={ctx} metrics={metrics} selectedDate={selectedDate} access={access} onOpenHelpShortcut={() => setView("Mobile Manager")} /> : <Dashboard jobs={dailyJobs} allJobs={visibleJobs} ctx={ctx} metrics={metrics} selectedDate={selectedDate} access={access} reload={loadAll} />)}
        {view === "Schedule" && <Schedule jobs={dailyJobs} ctx={ctx} selectedDate={selectedDate} />}
        {view === "Outlook Calendar" && <OutlookCalendar jobs={visibleJobs} ctx={ctx} reload={loadAll} selectedDate={selectedDate} setSelectedDate={setSelectedDate} access={access} />}
        {view === "Foreman" && <Foreman jobs={dailyJobs} ctx={ctx} reload={loadAll} selectedDate={selectedDate} access={access} />}
        {view === "Production Log" && <ProductionLog jobs={visibleJobs} ctx={ctx} reload={loadAll} setEditingJob={setEditingJob} access={access} />}
        {view === "Technicians" && <Technicians jobs={visibleJobs} ctx={ctx} />}
        {view === "Tech Clock" && <TechnicianClock ctx={ctx} reload={loadAll} selectedDate={selectedDate} />}
        {view === "Products" && <Products ctx={ctx} reload={loadAll} />}
        {view === "Admin" && <Admin ctx={ctx} reload={loadAll} access={access} />}
        {view === "Cloud Status" && <CloudStatus state={state} />}

        {showNewJob && <NewJobModal onClose={() => setShowNewJob(false)} ctx={ctx} reload={loadAll} selectedDate={selectedDate} access={access} />}
        {editingJob && (
          <EditJobModal
            job={editingJob}
            ctx={ctx}
            reload={loadAll}
            onClose={() => setEditingJob(null)}
            access={access}
          />
        )}

        {isMobile && !showNewJob && !editingJob && (
          <>
            {pwaInstall.showIosHint && (
              <div className="phoneInstallHint">
                To install: tap Share, then Add to Home Screen.
                <button onClick={pwaInstall.dismissIosHint}>Got it</button>
              </div>
            )}
            {!showNewJob && !editingJob && (
              <button className="phoneFab" onClick={() => setShowNewJob(true)} aria-label="New Job">
                <Plus size={26} />
              </button>
            )}
            <nav className="phoneBottomNav" aria-label="Mobile navigation">
              {[
                ["Dashboard", LayoutDashboard, "Home"],
                ["Mobile Manager", Smartphone, "Current"],
                ["Performance", BarChart3, "Performance"],
                ["Hall of Fame", Trophy, "Records"],
                ["Notifications", Bell, "Alerts"],
              ].filter(([name]) => allowedViewNames.includes(name)).map(([name, Icon, label]) => (
                <button
                  key={name}
                  className={view === name ? "active" : ""}
                  onClick={() => setView(name)}
                  aria-label={label}
                  title={label}
                >
                  <Icon aria-hidden="true" />
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



function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(() => isRunningStandalone());
  const [hideIosHint, setHideIosHint] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("hh-hide-ios-install-hint") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
  }

  function dismissIosHint() {
    setHideIosHint(true);
    if (typeof window !== "undefined") window.localStorage.setItem("hh-hide-ios-install-hint", "1");
  }

  const isiOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent || "");

  return {
    canInstall: Boolean(installPrompt) && !isStandalone,
    install,
    showIosHint: isiOS && !isStandalone && !hideIosHint,
    dismissIosHint,
  };
}

function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
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

      .dashboardRequestBlock { margin: 16px 0; padding: 18px; border-radius: 24px; background: linear-gradient(135deg, #3b0f24, #1f1230); border: 1px solid rgba(244,63,94,.45); box-shadow: 0 18px 45px rgba(88,28,135,.18); }
      .dashboardRequestHeader { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
      .dashboardRequestHeader h3 { margin: 0; color: #fff; font-size: 24px; letter-spacing: -.03em; }
      .dashboardRequestHeader span { display: block; margin-top: 4px; color: #cbd5e1; font-weight: 800; }
      .dashboardRequestHeader strong { min-width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; background: #f43f5e; color: #fff; font-size: 24px; }
      .dashboardRequestList { display: grid; gap: 12px; }
      .dashboardRequestBlock .notificationCard { background: rgba(255,255,255,.94); border: 1px solid rgba(244,63,94,.22); box-shadow: 0 10px 30px rgba(15,23,42,.14); }
      .dashboardRequestBlock .notificationCard strong { color: #0f172a; }
      .dashboardRequestBlock .notificationCard p { color: #334155; }
      .dashboardRequestBlock .notificationCard span { color: #64748b; }

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
        html, body, #root { width: 100%; min-height: 100%; overflow-x: hidden; overscroll-behavior-y: none; }
        body { background: #070d1c; -webkit-tap-highlight-color: transparent; }
        button, input, select, textarea { font-size: 16px; }
        .app.phoneShell { display: block !important; width: 100%; min-height: 100vh; background: #070d1c; }
        .phoneMain { width: 100% !important; min-width: 0 !important; padding: 0 0 calc(112px + env(safe-area-inset-bottom)) !important; margin: 0 !important; }
        .phoneHeader { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: calc(14px + env(safe-area-inset-top)) 14px 10px; background: rgba(7, 13, 28, .96); backdrop-filter: blur(14px); border-bottom: 1px solid rgba(255,255,255,.08); }
        .phoneHeader h2 { margin: 0; color: #fff; font-size: 21px; line-height: 1.1; }
        .phoneHeaderLogo { display: block; width: 100px; max-height: 48px; object-fit: contain; margin: 0 0 4px; border-radius: 8px; }
        .topbarLogo { display: block; width: 96px; height: auto; object-fit: contain; margin: 0 0 5px; }
        .phoneDatePicker { margin-top: 6px; height: 34px; border: 0; border-radius: 10px; padding: 0 10px; font-weight: 900; color: #0f172a; background: #f8fafc; }
        .phoneHeaderActions { display: grid; gap: 8px; justify-items: end; }
        .phoneInstallButton { min-height: 34px; border: 0; border-radius: 999px; padding: 0 12px; background: #f97316; color: #fff; font-size: 12px; font-weight: 1000; box-shadow: 0 8px 18px rgba(249,115,22,.28); }
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
        .mobileTechName { display: inline-flex; align-items: center; gap: 6px; margin: 8px 0 6px; padding: 8px 10px; border-radius: 12px; background: #fff7ed; color: #9a3412; font-size: 18px; font-weight: 1000; letter-spacing: .02em; }
        .mobileBookCard { background: #111827 !important; color: white !important; border: 1px solid rgba(15,23,42,.16); }
        .mobileBookCard span { color: #fed7aa !important; }
        .mobileBookCard strong { color: white !important; font-size: 24px !important; }
        .mobileRemainingCard strong.remainingOk { color: #166534 !important; }
        .mobileRemainingCard strong.remainingOver { color: #dc2626 !important; }
        .mobileProgressTrack { width: 100%; height: 7px; overflow: hidden; border-radius: 999px; background: #e2e8f0; margin: 10px 0 12px; }
        .mobileProgressFill { height: 100%; width: 0%; border-radius: inherit; background: #94a3b8; transition: width .25s ease; }
        .mobileProgressFill.onTrack { background: #16a34a; }
        .mobileProgressFill.nearLimit { background: #f97316; }
        .mobileProgressFill.overBook { background: #dc2626; }
        .mobilePill { padding: 5px 9px !important; border-radius: 999px !important; font-size: 10px !important; font-weight: 900; }
        .mobileJob h2 { font-size: 23px !important; line-height: 1.05; margin: 0 !important; color: #0f172a; }
        .mobileJob > p { margin: 4px 0 12px !important; font-size: 15px !important; font-weight: 800; color: #64748b !important; }
        .mobileMetaGrid { display: grid !important; grid-template-columns: 1fr !important; gap: 8px !important; margin-bottom: 10px !important; }
        .mobileMetaGrid div { padding: 12px !important; border-radius: 14px !important; background: #eef2f7 !important; }
        .mobileMetaGrid span { font-size: 10px !important; font-weight: 900; letter-spacing: .1em; color: #64748b !important; text-transform: uppercase; }
        .mobileMetaGrid strong { display: block; font-size: 16px !important; color: #0f172a; margin-top: 2px; }

        .mobileDamagePanel { margin: 4px 0 12px; padding: 12px; border-radius: 16px; background: #fff7ed; border: 1px solid rgba(249,115,22,.22); }
        .mobileDamageHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .mobileDamageHead strong { display: block; color: #9a3412; font-size: 14px; }
        .mobileDamageHead span { display: block; margin-top: 2px; color: #c2410c; font-size: 11px; font-weight: 900; }
        .mobileDamageUpload { position: relative; overflow: hidden; flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 12px; border-radius: 12px; background: #f97316; color: white; font-size: 12px; font-weight: 1000; cursor: pointer; box-shadow: 0 10px 20px rgba(249,115,22,.24); }
        .mobileDamageUpload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .mobileDamageThumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 10px; }
        .mobileDamageThumbs a { display: block; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: #fed7aa; border: 1px solid rgba(249,115,22,.25); }
        .mobileDamageThumbs img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .mobileSelfHelperPanel { margin: 4px 0 12px; padding: 12px; border-radius: 16px; background: #f8fafc; border: 1px solid rgba(15,23,42,.12); }
        .mobileSelfHelperPanel strong { display: block; color: #0f172a; font-size: 14px; }
        .mobileSelfHelperPanel span { display: block; margin-top: 2px; color: #64748b; font-size: 11px; font-weight: 900; }
        .mobileSelfHelperPanel select, .mobileSelfHelperPanel input { width: 100%; min-height: 42px; border-radius: 12px; border: 1px solid rgba(15,23,42,.14); padding: 0 10px; background: white; color: #0f172a; font-size: 14px; font-weight: 800; }
        .mobileSelfHelperGrid { display: grid; grid-template-columns: 1fr 112px; gap: 8px; margin-top: 10px; }
        .mobileSelfHelperActions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
        .mobileSelfHelperActions button { min-height: 42px; border: 0; border-radius: 12px; background: #f97316; color: white; font-size: 13px; font-weight: 1000; }
        .mobileSelfHelperActions button:disabled { background: #e5e7eb !important; color: #334155 !important; opacity: 1 !important; cursor: not-allowed; }
        .mobileSelfHelperActions button.secondary { background: #e2e8f0; color: #0f172a; }
        .mobileSelfHelperActions button.stop { background: #dc2626; color: white; }
        .mobileHelpShortcut { width: 100%; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 13px 14px; border: 1px solid rgba(249,115,22,.55) !important; border-radius: 22px !important; background: rgba(17,24,39,.96) !important; color: white !important; box-shadow: 0 14px 34px rgba(249,115,22,.16); text-align: left; }
        .mobileHelpShortcut .mobileHelpIcon { width: 44px; height: 44px; border-radius: 16px; display: grid; place-items: center; background: linear-gradient(135deg,#f97316,#fb923c); font-size: 22px; }
        .mobileHelpShortcut strong { display: block; color: white; font-size: 16px; line-height: 1.1; }
        .mobileHelpShortcut small { display: block; margin-top: 3px; color: #cbd5e1; font-size: 11px; font-weight: 800; line-height: 1.25; }
        .mobileHelpShortcut b { justify-self: end; padding: 9px 12px; border-radius: 14px; background: #f97316; color: white; font-size: 12px; font-weight: 1000; }
        .mobileHelpShortcut.active { border-color: rgba(34,197,94,.60) !important; }
        .mobileHelpShortcut.active b { background: #16a34a; }
        .mobileActionGrid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 9px !important; }
        .mobileActionGrid button { min-height: 54px !important; border-radius: 13px !important; border: 0 !important; font-size: 16px !important; font-weight: 900 !important; background: #dbe2ec !important; color: #0f172a !important; }
        .mobileActionGrid button.complete { grid-column: 1 / -1 !important; background: #16a34a !important; color: white !important; }
        .phoneInstallHint { position: fixed; left: 10px; right: 10px; bottom: calc(74px + env(safe-area-inset-bottom)); z-index: 120; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 16px; background: #fff7ed; color: #9a3412; border: 1px solid rgba(249,115,22,.3); box-shadow: 0 12px 30px rgba(0,0,0,.25); font-size: 12px; font-weight: 900; }
        .phoneInstallHint button { border: 0; border-radius: 999px; padding: 8px 10px; background: #f97316; color: white; font-size: 12px; font-weight: 1000; }
        .phoneBottomNav { position: fixed; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); z-index: 100; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; padding: 5px; border-radius: 18px; background: rgba(15, 23, 42, .96); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 14px 30px rgba(0,0,0,.34); }
        .phoneBottomNav button { height: 48px; min-width: 0; border: 0; border-radius: 13px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: transparent; color: #94a3b8; font-size: 9px; font-weight: 900; padding: 0 2px; }
        .phoneBottomNav button svg { width: 17px; height: 17px; }
        .phoneBottomNav button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .phoneBottomNav button.active { background: #f97316; color: white; }
        .phoneFab { position: fixed; right: 18px; bottom: calc(78px + env(safe-area-inset-bottom)); z-index: 110; width: 56px; height: 56px; border-radius: 20px; border: 0; display: grid; place-items: center; background: #f97316; color: white; box-shadow: 0 14px 30px rgba(249,115,22,.42); }
        .page { padding: 10px !important; }
        .panel, .hero, .adminHero, .performanceHero, .mobileHero { border-radius: 18px !important; padding: 14px !important; }
        .grid.two, .cards3, .kpis, .formGrid { display: grid !important; grid-template-columns: 1fr !important; gap: 10px !important; }
        .modalBackdrop { position: fixed !important; inset: 0 !important; z-index: 300 !important; padding: calc(10px + env(safe-area-inset-top)) 10px calc(10px + env(safe-area-inset-bottom)) !important; align-items: flex-end !important; background: rgba(7,13,28,.62) !important; }
        .modal { width: 100% !important; max-width: none !important; max-height: calc(100vh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) !important; overflow: hidden !important; display: flex !important; flex-direction: column !important; border-radius: 22px 22px 0 0 !important; padding-bottom: calc(14px + env(safe-area-inset-bottom)) !important; }
        .modalHeader { flex: 0 0 auto !important; }
        .modal .formGrid { flex: 1 1 auto !important; min-height: 0 !important; overflow-y: auto !important; -webkit-overflow-scrolling: touch !important; padding-bottom: 16px !important; }
        .modal > button.primary.wide { flex: 0 0 auto !important; position: static !important; display: flex !important; align-items: center !important; justify-content: center !important; width: 100% !important; min-height: 58px !important; margin: 12px 0 0 !important; border-radius: 16px !important; background: #f97316 !important; color: #fff !important; opacity: 1 !important; visibility: visible !important; box-shadow: 0 12px 28px rgba(249,115,22,.24) !important; }
        .modalFooter { flex: 0 0 auto !important; position: static !important; background: #f8fafc !important; padding: 12px 0 0 !important; }
        .table, .performanceTable, .availabilityTable, .schedule { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        .outlookGrid { grid-template-columns: 1fr !important; }
        .productLineRow { grid-template-columns: 1fr !important; }
        .productLinesTotal { justify-content: flex-start !important; }
        .accessGate { min-height: 100vh; display: grid; place-items: center; padding: 18px; background: #070d1c; }
        .accessPanel { width: min(520px, 100%); border-radius: 22px; padding: 18px; background: #f8fafc; }
        .accessPanel label { display: grid; gap: 6px; margin: 12px 0; font-weight: 900; color: #0f172a; }

        .phoneHeader { padding: calc(10px + env(safe-area-inset-top)) 18px 10px !important; align-items: center !important; }
        .phoneHeader .eyebrow { font-size: 10px !important; letter-spacing: .20em !important; color: #f97316 !important; }
        .phoneHeader h2 { font-size: 26px !important; font-weight: 1000 !important; letter-spacing: -.04em; }
        .phoneDatePicker { height: 38px !important; border-radius: 16px !important; font-size: 18px !important; padding: 0 14px !important; box-shadow: 0 8px 22px rgba(255,255,255,.04); }
        .phoneHeaderActions { grid-template-columns: 1fr; gap: 8px !important; }
        .phoneIconButton { width: 48px !important; height: 48px !important; border-radius: 18px !important; background: rgba(248,250,252,.96) !important; color: #f97316 !important; box-shadow: 0 16px 34px rgba(249,115,22,.24) !important; }
        .phoneBottomNav { left: 14px !important; right: 14px !important; bottom: calc(12px + env(safe-area-inset-bottom)) !important; display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)) !important; min-height: 78px !important; border-radius: 26px !important; padding: 8px !important; gap: 7px !important; background: rgba(15,23,42,.94) !important; border: 1px solid rgba(255,255,255,.15) !important; backdrop-filter: blur(20px); box-shadow: 0 18px 42px rgba(0,0,0,.44) !important; }
        .phoneBottomNav button { position: relative; border-radius: 20px !important; min-height: 58px !important; color: #94a3b8 !important; font-weight: 900 !important; padding: 0 !important; gap: 0 !important; transition: transform .18s ease, background .18s ease, color .18s ease, box-shadow .18s ease; }
        .phoneBottomNav button svg { width: 24px !important; height: 24px !important; stroke-width: 2.45 !important; }
        .phoneBottomNav button span { position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important; clip: rect(0 0 0 0) !important; white-space: nowrap !important; }
        .phoneBottomNav button.active { background: #f97316 !important; color: #fff !important; transform: translateY(-2px) scale(1.02); box-shadow: 0 12px 24px rgba(249,115,22,.40); }
        .phoneBottomNav button.active svg { width: 26px !important; height: 26px !important; }
        .phoneFab { right: 18px !important; bottom: calc(96px + env(safe-area-inset-bottom)) !important; width: 58px !important; height: 58px !important; border-radius: 21px !important; background: #f97316 !important; color: white !important; box-shadow: 0 16px 30px rgba(249,115,22,.36) !important; }

        .mobileDashScreen { padding: 16px 12px 114px; background: #070d1c; min-height: calc(100vh - 84px); display: grid; gap: 16px; }
        .mobileHeroCard { border-radius: 30px; padding: 20px; background: radial-gradient(circle at top left, rgba(249,115,22,.28), transparent 36%), linear-gradient(145deg, #172033, #253246); border: 1px solid rgba(255,255,255,.10); box-shadow: 0 24px 60px rgba(0,0,0,.34); }
        .mobileHeroTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .mobileHeroTop p { margin: 0 0 8px; color: #f97316; font-size: 12px; font-weight: 1000; letter-spacing: .24em; text-transform: uppercase; }
        .mobileHeroTop h1 { margin: 0; color: #fff; font-size: 38px; line-height: .95; letter-spacing: -.06em; }
        .mobileHeroTop span { display: block; margin-top: 10px; color: #cbd5e1; font-weight: 800; }
        .mobileEfficiencyRing { flex: 0 0 104px; width: 104px; height: 104px; border-radius: 999px; display: grid; place-items: center; align-content: center; background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.16); }
        .mobileEfficiencyRing strong { color: #fff; font-size: 30px; line-height: 1; }
        .mobileEfficiencyRing small { margin-top: 5px; color: #cbd5e1; font-weight: 900; font-size: 11px; }
        .mobileHeroStats { margin-top: 20px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
        .mobileHeroStats div { padding: 12px 8px; border-radius: 18px; background: rgba(15,23,42,.58); border: 1px solid rgba(255,255,255,.08); text-align: center; }
        .mobileHeroStats strong { display: block; color: #fff; font-size: 21px; }
        .mobileHeroStats span { display: block; margin-top: 3px; color: #94a3b8; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; }
        .mobileKpiGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .mobileKpiCard { min-height: 122px; padding: 16px; border-radius: 26px; background: #f8fafc; color: #0f172a; border: 1px solid rgba(255,255,255,.08); box-shadow: 0 18px 44px rgba(0,0,0,.18); }
        .mobileKpiCard.orange { background: linear-gradient(145deg, #fb923c, #ea580c); color: white; }
        .mobileKpiCard span { display: block; color: inherit; opacity: .72; font-size: 13px; font-weight: 1000; }
        .mobileKpiCard strong { display: block; margin-top: 16px; font-size: 34px; line-height: .9; letter-spacing: -.05em; }
        .mobileKpiCard small { display: block; margin-top: 11px; color: inherit; opacity: .66; font-weight: 800; }
        .mobileSectionHead { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 0; }
        .mobileSectionHead h2 { margin: 0; color: #fff; font-size: 22px; letter-spacing: -.03em; }
        .mobileSectionHead span { color: #f97316; font-size: 12px; font-weight: 1000; text-transform: uppercase; letter-spacing: .08em; }
        .mobileLiveList { display: grid; gap: 12px; }
        .mobileLiveCard { padding: 16px; border-radius: 24px; background: rgba(17,24,39,.96); border: 1px solid rgba(255,255,255,.10); box-shadow: 0 18px 44px rgba(0,0,0,.20); }
        .mobileLiveTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .mobileLiveTop strong { display: block; color: #fff; font-size: 18px; }
        .mobileLiveTop span { display: block; margin-top: 3px; color: #94a3b8; font-size: 12px; font-weight: 800; line-height: 1.25; }
        .mobileLiveTop em { flex: 0 0 auto; font-style: normal; font-size: 11px; font-weight: 1000; text-transform: uppercase; letter-spacing: .08em; }
        .mobileLiveCard h3 { margin: 14px 0 10px; color: #f8fafc; font-size: 20px; line-height: 1.1; letter-spacing: -.03em; }
        .mobileProgressTrack.dark { background: rgba(255,255,255,.10) !important; }
        .mobileLiveMeta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
        .mobileLiveMeta span { color: #cbd5e1; font-size: 12px; font-weight: 900; }
        .darkEmpty { background: rgba(17,24,39,.96) !important; color: white !important; border: 1px solid rgba(255,255,255,.10); }
        .darkEmpty h2 { color: white !important; }
        .darkEmpty p { color: #94a3b8 !important; }

      }
    `}</style>
  );
}

function MobileManager({ jobs, allJobs = jobs, ctx, reload, setEditingJob, selectedDate, access }) {
  const [filter, setFilter] = useState("Open");
  const currentMinute = useCurrentMinute();

  const openJobs = jobs.filter((j) => !ctx.isComplete(j.status_id));
  const shownJobs = sortJobsByEarliestStart(
    filter === "Open"
      ? openJobs
      : jobs.filter((j) => ctx.status(j.status_id)?.name === filter)
  );

  const getStatusId = (name) =>
    ctx.statuses.find((s) => s.name.toLowerCase() === name.toLowerCase())?.id;

  async function updateStatus(job, statusName) {
    const statusId = getStatusId(statusName);
    if (!statusId) return alert(`Missing status: ${statusName}`);

    const previousStatus = ctx.status(job.status_id)?.name || "Unknown";
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
    await logAuditEvent(ctx, access, {
      action: `Job status changed to ${statusName}`,
      entityType: "job",
      entityId: job.id,
      summary: `${job.vehicle || "Job"} changed from ${previousStatus} to ${statusName}`,
      metadata: { job_id: job.id, previousStatus, statusName },
    });
    await createAppNotification(ctx, access, {
      type: "status_changed",
      title: "Job Status Changed",
      body: `${jobDisplayName(job, ctx)} changed from ${previousStatus} to ${statusName}.`,
      jobId: job.id,
      audienceRoles: managerAudience(),
      metadata: { previousStatus, statusName },
    });
    await reload();
  }

  async function pauseJob(job) {
    const pausedId = getStatusId("Paused");
    if (!pausedId) return alert("Missing status: Paused. Apply the mobile update Supabase migration first.");
    const reason = window.prompt("Pause reason? Examples: Helping another technician, Waiting on parts, Waiting on approval, Lunch / Break");
    if (!reason) return;
    const previousStatus = ctx.status(job.status_id)?.name || "Unknown";
    const now = new Date().toISOString();
    const updatePayload = {
      status_id: pausedId,
      pause_started_at: now,
      pause_reason: reason,
      updated_at: now,
    };
    if (!job.production_started_at) updatePayload.production_started_at = now;
    const { error } = await supabase.from("jobs").update(updatePayload).eq("id", job.id);
    if (error) return alert(error.message);
    await logAuditEvent(ctx, access, {
      action: "Job paused",
      entityType: "job",
      entityId: job.id,
      summary: `${job.vehicle || "Job"} paused. Reason: ${reason}`,
      metadata: { job_id: job.id, previousStatus, reason },
    });
    await createAppNotification(ctx, access, {
      type: "job_paused",
      title: "Job Paused",
      body: `${jobDisplayName(job, ctx)} paused by ${ctx.tech(job.technician_id)?.name || "technician"}. Reason: ${reason}.`,
      jobId: job.id,
      technicianId: job.technician_id,
      audienceRoles: managerAudience(),
      metadata: { previousStatus, reason },
    });
    await reload();
  }

  async function resumeJob(job) {
    const inProgressId = getStatusId("In Progress");
    if (!inProgressId) return alert("Missing status: In Progress");
    const nowDate = new Date();
    const pauseStarted = job.pause_started_at ? new Date(job.pause_started_at) : null;
    const additionalPaused = pauseStarted && !Number.isNaN(pauseStarted.getTime()) ? Math.max(0, Math.round((nowDate - pauseStarted) / 1000)) : 0;
    const totalPaused = Number(job.total_paused_seconds || 0) + additionalPaused;
    const { error } = await supabase.from("jobs").update({
      status_id: inProgressId,
      total_paused_seconds: totalPaused,
      pause_started_at: null,
      pause_reason: null,
      updated_at: nowDate.toISOString(),
    }).eq("id", job.id);
    if (error) return alert(error.message);
    await logAuditEvent(ctx, access, {
      action: "Job resumed",
      entityType: "job",
      entityId: job.id,
      summary: `${job.vehicle || "Job"} resumed`,
      metadata: { job_id: job.id, totalPaused },
    });
    await createAppNotification(ctx, access, {
      type: "job_resumed",
      title: "Job Resumed",
      body: `${jobDisplayName(job, ctx)} resumed by ${ctx.tech(job.technician_id)?.name || "technician"}.`,
      jobId: job.id,
      technicianId: job.technician_id,
      audienceRoles: managerAudience(),
      metadata: { totalPaused },
    });
    await reload();
  }


  function getPendingExtensionRequest(job) {
    return getPendingRoadblockExtensionRequest(ctx, job.id);
  }

  async function requestRoadblockExtension(job) {
    const pending = getPendingExtensionRequest(job);
    if (pending) return alert("An extension request is already pending for this job.");

    const reason = window.prompt("Roadblock reason? The job will stay In Progress; use Pause only when work actually stops.");
    if (!reason || !reason.trim()) return alert("A reason is required.");

    const requestedRaw = window.prompt("Requested extension time in minutes (example: 15, 30, 45, 60):", "30");
    if (requestedRaw === null) return;
    const requestedMinutes = Math.max(1, Math.round(Number(requestedRaw)));
    if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) return alert("Enter a valid number of minutes.");

    const techName = ctx.tech(job.technician_id)?.name || access?.fullName || "Technician";
    const metadata = {
      status: "pending",
      request_id: `${job.id}-${Date.now()}`,
      requested_minutes: requestedMinutes,
      approved_minutes: requestedMinutes,
      reason: reason.trim(),
      requested_by: techName,
      requested_by_technician_id: job.technician_id || access?.technicianId || null,
      requested_at: new Date().toISOString(),
      current_book_hours: Number(job.book_hours || 0),
      current_roadblock_reason: reason.trim(),
      current_pause_reason: job.pause_reason || null,
      job_status_when_requested: ctx.status(job.status_id)?.name || null,
    };

    await createAppNotification(ctx, access, {
      type: "roadblock_extension_request",
      title: "Roadblock Extension Requested",
      body: `${techName} requested +${requestedMinutes} min on ${jobDisplayName(job, ctx)}. Reason: ${reason.trim()}`,
      jobId: job.id,
      technicianId: null,
      audienceRoles: managerAudience(),
      metadata,
    });
    await logAuditEvent(ctx, access, {
      action: "Roadblock extension requested",
      entityType: "job",
      entityId: job.id,
      summary: `${techName} requested +${requestedMinutes} min on ${job.vehicle || "job"}`,
      metadata,
    });
    notifyUser(`Roadblock extension requested: +${requestedMinutes} min`);
    await reload();
  }

  async function endActiveHelpersForCompletedJob(job, completedAt = new Date()) {
    const scheduledDate = job.scheduled_date || selectedDate || todayIso();
    const activeHelpers = (ctx.jobHelpers || []).filter((helper) => helper.job_id === job.id && helper.scheduled_date === scheduledDate && isActiveHelper(helper));
    if (!activeHelpers.length) return [];

    const endTime = shortTime(completedAt.toTimeString());
    const ended = [];
    for (const helper of activeHelpers) {
      const actualHours = calculateWorkingHoursBetween(helper.start_time, endTime, ctx);
      const creditedHours = calculateHelperCreditedHours(job, helper.start_time, endTime, ctx);
      const { error } = await supabase
        .from("job_helpers")
        .update({
          end_time: endTime,
          book_hours: creditedHours,
          actual_hours: actualHours,
          status: "ended",
          ended_at: completedAt.toISOString(),
          updated_at: completedAt.toISOString(),
        })
        .eq("id", helper.id);
      if (error) throw error;
      ended.push({ helper, actualHours, creditedHours });
    }

    await logAuditEvent(ctx, access, {
      action: "Helper sessions auto-ended",
      entityType: "job",
      entityId: job.id,
      summary: `${ended.length} helper session${ended.length === 1 ? "" : "s"} ended when ${job.vehicle || "job"} was completed`,
      metadata: { job_id: job.id, ended: ended.map(({ helper, actualHours, creditedHours }) => ({ helper_id: helper.id, technician_id: helper.technician_id, actualHours, creditedHours })) },
    });
    await createAppNotification(ctx, access, {
      type: "helper_auto_ended",
      title: "Helper Session Ended",
      body: `${ended.length} helper session${ended.length === 1 ? "" : "s"} ended automatically when ${jobDisplayName(job, ctx)} was completed.`,
      jobId: job.id,
      technicianId: job.technician_id,
      audienceRoles: managerAudience(),
      metadata: { count: ended.length },
    });
    return ended;
  }

  async function editJobStartTime(job) {
    const currentStart = getEffectiveJobStartTime(job);
    const entered = window.prompt("Edit job start time (example: 1:30 PM or 13:30)", currentStart);
    if (entered === null) return;

    const cleanTime = normalizeTimeInput(entered);
    if (!cleanTime || !/^\d{2}:\d{2}$/.test(cleanTime)) {
      return alert("Enter a valid start time, like 08:30 or 1:30 PM.");
    }

    const datePart = job.scheduled_date || selectedDate || todayIso();
    const localStart = new Date(`${datePart}T${cleanTime}:00`);
    const productionStartedAt = localStart.toISOString();

    const { error } = await supabase
      .from("jobs")
      .update({
        start_time: cleanTime,
        production_started_at: productionStartedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) return alert(error.message);
    await logAuditEvent(ctx, access, {
      action: "Job start time edited",
      entityType: "job",
      entityId: job.id,
      summary: `${job.vehicle || "Job"} start time changed to ${formatTime(cleanTime)}`,
      metadata: { job_id: job.id, start_time: cleanTime },
    });
    await reload();
  }

  async function completeJob(job) {
    const completedId = getStatusId("Completed");
    if (!completedId) return alert("Missing status: Completed");

    const now = new Date();
    const startedAt = getJobStartedAt(job) || getScheduledStartDate(job) || now;
    const actualHours = roundHours(getActiveElapsedHours(job, now, startedAt));
    const adjustedBook = getAdjustedBookHours(job);
    const efficiency = actualHours ? (adjustedBook / actualHours) * 100 : 0;

    const { error } = await supabase
      .from("jobs")
      .update({
        status_id: completedId,
        actual_hours: actualHours,
        active_time_hours: actualHours,
        production_started_at: job.production_started_at || startedAt.toISOString(),
        production_completed_at: now.toISOString(),
        pause_started_at: null,
        pause_reason: null,
        qc: "Yes",
        updated_at: now.toISOString(),
      })
      .eq("id", job.id);

    if (error) return alert(error.message);
    let autoEndedHelpers = [];
    try {
      autoEndedHelpers = await endActiveHelpersForCompletedJob(job, now);
    } catch (helperError) {
      return alert(`Job was completed, but helper sessions could not be ended automatically: ${helperError.message}`);
    }
    await logAuditEvent(ctx, access, {
      action: "Job completed",
      entityType: "job",
      entityId: job.id,
      summary: `${job.vehicle || "Job"} completed with ${actualHours} active hrs`,
      metadata: { actualHours, adjustedBook, efficiency, autoEndedHelpers: autoEndedHelpers.length },
    });
    await createAppNotification(ctx, access, {
      type: "job_completed",
      title: "Job Completed",
      body: `${jobDisplayName(job, ctx)} completed at ${Math.round(efficiency)}% efficiency.`,
      jobId: job.id,
      technicianId: job.technician_id,
      audienceRoles: managerAudience(),
      metadata: { actualHours, adjustedBook, efficiency },
    });
    if (efficiency >= 100) {
      await createAppNotification(ctx, access, {
        type: "beat_book",
        title: "Beat Book Time",
        body: `${jobDisplayName(job, ctx)} finished at ${Math.round(efficiency)}% efficiency.`,
        jobId: job.id,
        technicianId: job.technician_id,
        audienceRoles: ["technician", "foreman"],
        metadata: { actualHours, adjustedBook, efficiency },
      });
    }
    await createStreakNotificationsForCompletion(ctx, access, job, { actualHours, adjustedBook, efficiency });
    await createRecordNotificationsForCompletion(ctx, access, job, { actualHours, adjustedBook, efficiency });
    notifyUser(`Completed: ${job.vehicle || "job"} • ${actualHours} active hrs`);
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
    await logAuditEvent(ctx, access, {
      action: "Job rolled over",
      entityType: "job",
      entityId: job.id,
      summary: `${job.vehicle || "Job"} rolled to ${nextDate}`,
      metadata: { nextDate, remainingBookHours, todayBookHours },
    });
    notifyUser(`Rolled ${job.vehicle || "job"} to ${nextDate}`);
    await reload();
  }

  async function addHelperToJob(job, helperTechnicianId, helperStartTime) {
    if (!helperTechnicianId) return alert("Select a helper technician.");
    if (helperTechnicianId === job.technician_id) return alert("Helper cannot be the lead technician on the same job.");

    const scheduledDate = job.scheduled_date || selectedDate || todayIso();
    const activeExistingHelper = (ctx.jobHelpers || []).find(
      (h) =>
        h.job_id === job.id &&
        h.technician_id === helperTechnicianId &&
        h.scheduled_date === scheduledDate &&
        isActiveHelper(h)
    );

    if (activeExistingHelper) {
      return alert(`${ctx.tech(helperTechnicianId)?.name || "Helper"} is already actively helping on this job. End the active helper session before starting another one.`);
    }

    // If the time picker is blank, start the helper session right now.
    // This prevents a re-added helper from reusing an old on-screen timestamp.
    const effectiveHelperStartTime = helperStartTime || shortTime(new Date().toTimeString());
    const helperBookHours = calculateHelperBookHours(job, effectiveHelperStartTime, ctx);
    const overBook = isJobPastBookTime(job, ctx);

    const helperRow = {
      company_id: ctx.company.id,
      job_id: job.id,
      technician_id: helperTechnicianId,
      start_time: effectiveHelperStartTime,
      book_hours: helperBookHours,
      status: "active",
      end_time: null,
      ended_at: null,
      scheduled_date: scheduledDate,
      actual_hours: null,
      notes: overBook
        ? `Assisting ${getPrimaryTechNameForJob(job, ctx)} after book time on ${job.vehicle || job.customer || "job"}. Helper credit is capped at 100% actual time for core efficiency. A separate helper curve bonus is applied in performance reports.`
        : `Assisting ${getPrimaryTechNameForJob(job, ctx)} on ${job.vehicle || job.customer || "job"}. Helper credit is capped at 100% actual time for core efficiency. A separate helper curve bonus is applied in performance reports.`,
      updated_at: new Date().toISOString(),
    };

    // Insert a new row for every helper session. Do not upsert.
    // Re-adding a helper later in the day must create a fresh session so availability
    // and overdue timers do not reuse the original helper timestamp.
    const { error } = await supabase
      .from("job_helpers")
      .insert(helperRow);

    if (error) return alert(error.message);
    await logAuditEvent(ctx, access, {
      action: "Helper added",
      entityType: "job_helper",
      entityId: job.id,
      summary: `${ctx.tech(helperTechnicianId)?.name || "Helper"} added to assist ${getPrimaryTechNameForJob(job, ctx)}`,
      metadata: helperRow,
    });
    await createAppNotification(ctx, access, {
      type: "helper_added",
      title: "Helper Added",
      body: `${ctx.tech(helperTechnicianId)?.name || "Helper"} added to assist ${getPrimaryTechNameForJob(job, ctx)} on ${jobDisplayName(job, ctx)}.`,
      jobId: job.id,
      technicianId: helperTechnicianId,
      audienceRoles: managerAudience(),
      metadata: helperRow,
    });
    notifyUser(`${ctx.tech(helperTechnicianId)?.name || "Helper"} added to assist ${getPrimaryTechNameForJob(job, ctx)}`);
    await reload();
  }

  async function selfStartHelping(job, helperStartTime) {
    const techId = access?.technicianId;
    if (!techId) return alert("This login is not linked to a technician profile.");
    if (!job?.id) return alert("Select a job to help on.");
    if (job.technician_id === techId) return alert("You are already the lead technician on that job.");

    const currentHelper = getHelperAssignmentForTech(techId, ctx, selectedDate);
    if (currentHelper) {
      const currentJob = (allJobs || []).find((j) => j.id === currentHelper.job_id) || (ctx.jobs || []).find((j) => j.id === currentHelper.job_id);
      return alert(`You are already helping ${getPrimaryTechNameForJob(currentJob, ctx)}. Stop helping first.`);
    }

    const activeLeadJob = (allJobs || []).find(
      (j) =>
        j.technician_id === techId &&
        !ctx.isComplete(j.status_id) &&
        ["In Progress", "Paused", "QC"].includes(ctx.status(j.status_id)?.name)
    );

    if (activeLeadJob) {
      const ok = window.confirm(`You are currently assigned to ${activeLeadJob.vehicle || "another job"}. Start helping anyway?`);
      if (!ok) return;
    }

    await addHelperToJob(job, techId, helperStartTime || shortTime(new Date().toTimeString()));
  }

  async function selfStopHelping(helper) {
    const job = (allJobs || []).find((j) => j.id === helper?.job_id) || (ctx.jobs || []).find((j) => j.id === helper?.job_id);
    if (!job) return alert("Could not find the job for this helper session.");
    await endHelperOnJob(helper, job);
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
    await logAuditEvent(ctx, access, {
      action: "Helper ended",
      entityType: "job_helper",
      entityId: helper.id,
      summary: `${ctx.tech(helper.technician_id)?.name || "Helper"} ended help on ${job.vehicle || "job"}`,
      metadata: { helper_id: helper.id, job_id: job.id, creditedHours, actualHours },
    });
    await createAppNotification(ctx, access, {
      type: "helper_removed",
      title: "Helper Removed",
      body: `${ctx.tech(helper.technician_id)?.name || "Helper"} ended help on ${jobDisplayName(job, ctx)}.`,
      jobId: job.id,
      technicianId: helper.technician_id,
      audienceRoles: managerAudience(),
      metadata: { helper_id: helper.id, creditedHours, actualHours },
    });
    notifyUser(`${ctx.tech(helper.technician_id)?.name || "Helper"} ended help with ${creditedHours} credited hrs (${actualHours} actual hrs)`);
    await reload();
  }

  async function removeHelperFromJob(helperId) {
    const { error } = await supabase.from("job_helpers").delete().eq("id", helperId);
    if (error) return alert(error.message);
    await logAuditEvent(ctx, access, {
      action: "Helper removed",
      entityType: "job_helper",
      entityId: helperId,
      summary: "Helper removed with no credited hours",
      metadata: { helperId },
    });
    notifyUser("Helper removed with no credited hours");
    await reload();
  }

  async function uploadDamagePhotos(job, fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const note = window.prompt("Photo note / location on truck (example: scratch on driver bedside)", "Photo added");
    if (note === null) return;

    for (const file of files) {
      if (!file.type?.startsWith("image/")) {
        alert(`${file.name} is not an image.`);
        continue;
      }

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${ctx.company.id}/${job.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("truck-damage-photos")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "image/jpeg" });

      if (uploadError) {
        alert(`Photo upload failed: ${uploadError.message}. Make sure supabase/pre_install_damage_photos.sql has been run.`);
        return;
      }

      const { data: publicData } = supabase.storage.from("truck-damage-photos").getPublicUrl(path);

      const row = {
        company_id: ctx.company.id,
        job_id: job.id,
        uploaded_by: access?.fullName || access?.email || access?.role || "Unknown",
        note: note || "Photo added",
        storage_path: path,
        public_url: publicData?.publicUrl || null,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size || null,
      };

      const { error: insertError } = await supabase.from("job_damage_photos").insert(row);
      if (insertError) {
        alert(`Damage log failed: ${insertError.message}. Make sure supabase/pre_install_damage_photos.sql has been run.`);
        return;
      }
    }

    await logAuditEvent(ctx, access, {
      action: "Job photos uploaded",
      entityType: "job",
      entityId: job.id,
      summary: `${files.length} photo${files.length === 1 ? "" : "s"} uploaded for ${job.vehicle || "job"}`,
      metadata: { job_id: job.id, photo_count: files.length, note },
    });
    notifyUser(`${files.length} photo${files.length === 1 ? "" : "s"} uploaded`);
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
        {["Open", "Scheduled", "In Progress", "Paused", "QC"].map((x) => (
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
        <SelfHelpPanel
          job={null}
          allJobs={allJobs}
          ctx={ctx}
          access={access}
          selectedDate={selectedDate}
          onStartHelping={selfStartHelping}
          onStopHelping={selfStopHelping}
        />

        {shownJobs.map((job) => {
          const productName = ctx.jobProductsSummary(job);
          const tech = ctx.tech(job.technician_id);
          const status = ctx.status(job.status_id);
          const projected = getJobProjectedFinish(job, ctx);
          const timing = getMobileJobTiming(job, ctx, currentMinute);

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
              <div className="mobileTechName">👤 {tech?.name || "Unassigned"}</div>
              <p>{productName}</p>

              <div className="mobileProgressTrack" aria-label="Job progress">
                <div
                  className={`mobileProgressFill ${timing.progressClass}`}
                  style={{ width: `${timing.progressPercent}%` }}
                />
              </div>

              <div className="mobileMetaGrid">
                <div>
                  <span>Start</span>
                  <strong>{getEffectiveJobStartLabel(job)}</strong>
                </div>
                <div className="mobileBookCard">
                  <span>Book Time</span>
                  <strong>{Number(job.book_hours || 0).toFixed(1)} hr{Number(job.book_hours || 0) === 1 ? "" : "s"}</strong>
                </div>
                <div>
                  <span>Finish</span>
                  <strong>{formatTime(projected.finishTime)}{projected.dayOffset ? ` +${projected.dayOffset}d` : ""}</strong>
                </div>
                <div className="mobileRemainingCard">
                  <span>Time Remaining</span>
                  <strong className={timing.isOver ? "remainingOver" : "remainingOk"}>{timing.remainingLabel}</strong>
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

              <DamagePhotoPanel job={job} ctx={ctx} onUpload={uploadDamagePhotos} />
              <div className="mobileActionGrid">
                <button onClick={() => updateStatus(job, "In Progress")}>Start</button>
                {canEditJobs(access) && <button onClick={() => editJobStartTime(job)}>Edit Start</button>}
                {ctx.status(job.status_id)?.name === "Paused" ? <button onClick={() => resumeJob(job)}><Play size={16} /> Resume Job</button> : <button onClick={() => pauseJob(job)}><Pause size={16} /> Pause Job</button>}
                <button
                  disabled={Boolean(getPendingExtensionRequest(job))}
                  onClick={() => requestRoadblockExtension(job)}
                >
                  {getPendingExtensionRequest(job) ? "Extension Requested" : "Roadblock"}
                </button>
                <button onClick={() => setEditingJob(job)}>{canEditJobs(access) ? "Edit" : "Job Details"}</button>
                {canEditJobs(access) && <button onClick={() => rollJobToNextDay(job)}>Roll Over</button>}
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
            <p>Change tabs or use Help Another Tech when another technician has an open job.</p>
          </div>
        )}
      </div>
    </section>
  );
}


function SelfHelpPanel({ job, allJobs = [], ctx, access, selectedDate, onStartHelping, onStopHelping }) {
  const role = normalizeRole(access?.role);
  const technicianId = access?.technicianId;
  const [selectedJobId, setSelectedJobId] = useState("");
  const [helperStartTime, setHelperStartTime] = useState(() => getCurrentHelperStartTime());

  useEffect(() => {
    setHelperStartTime(getCurrentHelperStartTime());
  }, [selectedDate]);

  const canSelfHelp = ["technician", "foreman"].includes(role);
  if (!canSelfHelp || !technicianId) return null;

  const activeHelper = getHelperAssignmentForTech(technicianId, ctx, selectedDate);
  const activeHelperJob = activeHelper
    ? (allJobs || []).find((j) => j.id === activeHelper.job_id) || (ctx.jobs || []).find((j) => j.id === activeHelper.job_id)
    : null;

  const activePrimaryJob = (allJobs || []).find(
    (candidate) =>
      candidate.technician_id === technicianId &&
      !ctx.isComplete(candidate.status_id) &&
      ctx.status(candidate.status_id)?.name === "In Progress"
  );

  const helperOptions = sortJobsByEarliestStart(
    (allJobs || [])
      .filter((candidate) => !ctx.isComplete(candidate.status_id))
      .filter((candidate) => candidate.technician_id !== technicianId)
      .filter((candidate) => ["In Progress", "Paused", "QC"].includes(ctx.status(candidate.status_id)?.name))
  );

  if (activeHelper) {
    return (
      <div className="mobileSelfHelperPanel">
        <strong>Helping {getPrimaryTechNameForJob(activeHelperJob, ctx)}</strong>
        <span>{activeHelperJob?.vehicle || "Active helper session"} • Started {formatTime(activeHelper.start_time)}</span>
        <div className="mobileSelfHelperActions">
          <button className="stop" onClick={() => onStopHelping(activeHelper)}>Stop Helping</button>
          <button className="secondary" onClick={() => setSelectedJobId(activeHelper.job_id)}>View Job</button>
        </div>
      </div>
    );
  }

  if (activePrimaryJob) return null;

  return (
    <div className="mobileSelfHelperPanel">
      <strong>Help Another Tech</strong>
      <span>Start time defaults to now. Change it if you are backlogging.</span>
      <div className="mobileSelfHelperGrid">
        <select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}>
          <option value="">Select technician to help</option>
          {helperOptions.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {ctx.tech(candidate.technician_id)?.name || "Unassigned"} — {ctx.jobProductsSummary(candidate) || candidate.vehicle || candidate.customer || "Active job"}
            </option>
          ))}
        </select>
        <input type="time" value={helperStartTime} onChange={(event) => setHelperStartTime(event.target.value)} />
      </div>
      <div className="mobileSelfHelperActions">
        <button
          disabled={!selectedJobId}
          onClick={() => {
            const targetJob = helperOptions.find((candidate) => candidate.id === selectedJobId);
            if (!targetJob) return alert("Select the technician you are helping.");
            onStartHelping(targetJob, helperStartTime || getCurrentHelperStartTime());
            setSelectedJobId("");
            setHelperStartTime(getCurrentHelperStartTime());
          }}
        >
          {selectedJobId ? "Start Helping" : "Select Tech First"}
        </button>
        <button
          className="secondary"
          onClick={() => {
            setSelectedJobId("");
            setHelperStartTime(getCurrentHelperStartTime());
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function DamagePhotoPanel({ job, ctx, onUpload }) {
  const photos = (ctx.damagePhotos || [])
    .filter((photo) => photo.job_id === job.id)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return (
    <div className="mobileDamagePanel">
      <div className="mobileDamageHead">
        <div>
          <strong>Photos</strong>
          <span>{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} logged` : "No photos logged"}</span>
        </div>
        <label className="mobileDamageUpload">
          <ImagePlus size={18} /> Upload
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(event) => {
              onUpload(job, event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {photos.length > 0 && (
        <div className="mobileDamageThumbs">
          {photos.slice(0, 4).map((photo) => (
            <a key={photo.id || photo.storage_path} href={photo.public_url} target="_blank" rel="noreferrer" title={photo.note || "Job photo"}>
              <img src={photo.public_url} alt={photo.note || "Job photo"} loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}


function MobileDashboard({ jobs, allJobs = jobs, ctx, metrics, selectedDate, access, onOpenHelpShortcut }) {
  const currentMinute = getCurrentMinuteOfDay();
  const activeStatuses = new Set(["In Progress", "Paused", "QC"]);
  const openJobs = jobs.filter((j) => !ctx.isComplete(j.status_id));
  const completed = jobs.filter((j) => ctx.isComplete(j.status_id));
  const activeJobs = openJobs.filter((j) => activeStatuses.has(ctx.status(j.status_id)?.name));
  const scheduledJobs = openJobs.filter((j) => ctx.status(j.status_id)?.name === "Scheduled");
  const role = normalizeRole(access?.role);
  const isTechnicianUser = role === "technician" && Boolean(access?.technicianId);
  const openJobIds = new Set(openJobs.map((job) => job.id));
  const techActiveHelperBookHours = isTechnicianUser
    ? (ctx.jobHelpers || []).reduce((sum, helper) => {
        if (helper.technician_id !== access.technicianId) return sum;
        if (helper.scheduled_date !== selectedDate || !isActiveHelper(helper)) return sum;
        if (helper.job_id && !openJobIds.has(helper.job_id)) return sum;
        return sum + getCappedHelperBookHours(helper, ctx);
      }, 0)
    : 0;
  const techBookedCapacity = isTechnicianUser
    ? Math.min(100, Math.round(((openJobs.reduce((a, j) => a + getAdjustedBookHours(j), 0) + techActiveHelperBookHours) / 8) * 100))
    : null;
  const capacity = isTechnicianUser ? techBookedCapacity : Number(metrics.capacity || 0);
  const capacityLabel = isTechnicianUser ? "My Capacity" : "Shop Capacity";
  const capacityCaption = isTechnicianUser ? "My remaining workload" : "Current workload";
  const efficiency = Number(metrics.efficiency || 0);
  const dayLabel = selectedDate === todayIso()
    ? new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })
    : selectedDate;
  const isFloorUser = ["technician", "foreman"].includes(role);
  const techName = access?.technicianId ? ctx.tech(access.technicianId)?.name : "";
  const displayName = (techName || access?.fullName || access?.email || "").trim();
  const firstName = (displayName.split(/\s+/)[0] || "").toUpperCase();
  const heroEyebrow = isFloorUser ? `Welcome back${firstName ? ` ${firstName}` : ""}` : "Live Production";
  const heroTitle = isFloorUser ? "My Daily Stats" : "Today's Shop";
  const activePrimaryJob = isFloorUser && access?.technicianId
    ? (jobs || []).find((job) => job.technician_id === access.technicianId && ctx.status(job.status_id)?.name === "In Progress" && !ctx.isComplete(job.status_id))
    : null;
  const activeHelper = isFloorUser && access?.technicianId ? getHelperAssignmentForTech(access.technicianId, ctx, selectedDate) : null;
  const canUseHelpShortcut = Boolean(isFloorUser && !activePrimaryJob);

  return (
    <section className="mobileDashScreen">
      <div className="mobileHeroCard">
        <div className="mobileHeroTop">
          <div>
            <p>{heroEyebrow}</p>
            <h1>{heroTitle}</h1>
            <span>{dayLabel}</span>
          </div>
          <div className="mobileEfficiencyRing">
            <strong className={effClass(efficiency)}>{Math.round(efficiency)}%</strong>
            <small>Efficiency</small>
          </div>
        </div>
        <div className="mobileHeroStats">
          <div><strong>{capacity}%</strong><span>Capacity</span></div>
          <div><strong>{activeJobs.length}</strong><span>Active</span></div>
          <div><strong>{completed.length}</strong><span>Done</span></div>
          <div><strong>{openJobs.length}</strong><span>Open</span></div>
        </div>
      </div>

      {canUseHelpShortcut && (
        <button className={`mobileHelpShortcut ${activeHelper ? "active" : ""}`} onClick={onOpenHelpShortcut}>
          <span className="mobileHelpIcon">🤝</span>
          <span>
            <strong>{activeHelper ? "Stop Helping" : "Help Another Tech"}</strong>
            <small>{activeHelper ? "You have an active helper session." : "No active primary job? Assist another technician."}</small>
          </span>
          <b>{activeHelper ? "Open" : "Start"}</b>
        </button>
      )}

      <div className="mobileKpiGrid">
        <div className="mobileKpiCard orange"><span>{capacityLabel}</span><strong>{capacity}%</strong><small>{capacityCaption}</small></div>
        <div className="mobileKpiCard"><span>Booked Open</span><strong>{openJobs.reduce((a, j) => a + Number(j.book_hours || 0), 0).toFixed(1)}h</strong><small>Remaining work</small></div>
        <div className="mobileKpiCard"><span>Completed</span><strong>{completed.length}</strong><small>Jobs today</small></div>
        <div className="mobileKpiCard"><span>Scheduled</span><strong>{scheduledJobs.length}</strong><small>Waiting to start</small></div>
      </div>

      <div className="mobileSectionHead">
        <h2>Live Floor</h2>
        <span>{activeJobs.length || 0} active</span>
      </div>

      <div className="mobileLiveList">
        {(activeJobs.length ? activeJobs : openJobs).slice(0, 8).map((job) => {
          const tech = ctx.tech(job.technician_id);
          const status = ctx.status(job.status_id);
          const timing = getMobileJobTiming(job, ctx, currentMinute);
          const projected = getJobProjectedFinish(job, ctx);
          return (
            <article className="mobileLiveCard" key={job.id}>
              <div className="mobileLiveTop">
                <div>
                  <strong>{tech?.name || "Unassigned"}</strong>
                  <span>{ctx.jobProductsSummary(job)}</span>
                </div>
                <em style={{ color: status?.color || "#f97316" }}>{status?.name || "Open"}</em>
              </div>
              <h3>{job.vehicle || job.customer || "Shop Job"}</h3>
              <div className="mobileProgressTrack dark" aria-label="Job progress">
                <div className={`mobileProgressFill ${timing.progressClass}`} style={{ width: `${timing.progressPercent}%` }} />
              </div>
              <div className="mobileLiveMeta">
                <span>{Number(job.book_hours || 0).toFixed(1)}h book</span>
                <span>{timing.remainingLabel}</span>
                <span>{formatTime(projected.finishTime)}</span>
              </div>
            </article>
          );
        })}
        {!openJobs.length && (
          <div className="mobileEmpty darkEmpty">
            <h2>Shop is clear</h2>
            <p>No open jobs scheduled for this date.</p>
          </div>
        )}
      </div>
    </section>
  );
}


function DashboardRoadblockRequests({ ctx, access, reload }) {
  const pendingRoadblockRequests = (ctx.notifications || [])
    .filter((notification) => canReceiveNotification(notification, access))
    .filter(isPendingRoadblockExtensionRequest)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  if (!pendingRoadblockRequests.length) return null;

  return (
    <div className="dashboardRequestBlock">
      <div className="dashboardRequestHeader">
        <div>
          <p className="eyebrow">Action required</p>
          <h3>Pending roadblock requests</h3>
          <span>These requests are now shown on the dashboard until approved or denied.</span>
        </div>
        <strong>{pendingRoadblockRequests.length}</strong>
      </div>
      <div className="dashboardRequestList">
        {pendingRoadblockRequests.map((notification) => (
          <PendingRoadblockExtensionCard
            key={notification.id}
            notification={notification}
            ctx={ctx}
            access={access}
            reload={reload}
          />
        ))}
      </div>
    </div>
  );
}

function buildDashboardRequestItems(ctx, access) {
  return (ctx.notifications || [])
    .filter((notification) => canReceiveNotification(notification, access))
    .filter(isPendingRoadblockExtensionRequest)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function getTomorrowIso(selectedDate) {
  const d = new Date(`${selectedDate || todayIso()}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getJobsForExactDate(jobs, date) {
  return (jobs || []).filter((job) => (job.scheduled_date || todayIso()) === date);
}

function getSimpleDailyMetrics(jobs, ctx, selectedDate) {
  return calculateMetrics(getJobsForExactDate(jobs, selectedDate), ctx, selectedDate);
}

function getPulseState({ efficiency, capacity, activeJobs, overdueJobs, requestCount, comebackCount }) {
  if (overdueJobs > 2 || requestCount > 4 || efficiency < 85 || capacity >= 115) {
    return { label: "Critical", className: "critical", note: "Immediate attention needed." };
  }
  if (overdueJobs > 0 || requestCount > 0 || capacity >= 95 || efficiency < 100 || comebackCount > 0) {
    return { label: "Watch", className: "watch", note: "Stable, but needs management focus." };
  }
  if (activeJobs === 0) {
    return { label: "Idle", className: "idle", note: "No active production pressure." };
  }
  return { label: "Strong", className: "strong", note: "Shop is running ahead of pace." };
}

function getDashboardTiming(job, ctx) {
  const finish = getJobProjectedFinish(job, ctx);
  const finishMinutes = timeStringToMinutes(finish.finishTime);
  const now = getCurrentMinuteOfDay();
  const openToday = !finish.dayOffset;
  const overdue = openToday && finishMinutes < now && !ctx.isComplete(job.status_id);
  return { finish, finishMinutes, overdue };
}

function ShopPulseCard({ jobs, allJobs, ctx, metrics, selectedDate, requestCount }) {
  const activeJobs = jobs.filter((j) => ctx.status(j.status_id)?.name === "In Progress" && !ctx.isComplete(j.status_id));
  const pausedJobs = jobs.filter((j) => ctx.status(j.status_id)?.name === "Paused");
  const qcJobs = jobs.filter((j) => ctx.status(j.status_id)?.name === "QC");
  const overdueJobs = activeJobs.filter((job) => getDashboardTiming(job, ctx).overdue);
  const comebackCount = (ctx.comebacks || ctx.comebackRework || []).filter((row) => (row.status || "open") !== "resolved").length;
  const pulse = getPulseState({
    efficiency: Number(metrics.efficiency || 0),
    capacity: Number(metrics.capacity || 0),
    activeJobs: activeJobs.length,
    overdueJobs: overdueJobs.length,
    requestCount,
    comebackCount,
  });
  const tomorrowDate = getTomorrowIso(selectedDate);
  const tomorrowMetrics = getSimpleDailyMetrics(allJobs, ctx, tomorrowDate);
  const focusItems = [];
  if (requestCount) focusItems.push(`${requestCount} request${requestCount === 1 ? "" : "s"} waiting`);
  if (overdueJobs.length) focusItems.push(`${overdueJobs.length} job${overdueJobs.length === 1 ? "" : "s"} over book time`);
  if (pausedJobs.length) focusItems.push(`${pausedJobs.length} paused job${pausedJobs.length === 1 ? "" : "s"}`);
  if (qcJobs.length) focusItems.push(`${qcJobs.length} job${qcJobs.length === 1 ? "" : "s"} in QC`);
  if (tomorrowMetrics.capacity >= 95) focusItems.push(`Tomorrow ${tomorrowMetrics.capacity}% booked`);
  if (!focusItems.length) focusItems.push("No immediate manager action detected");

  return (
    <section className={`shopPulseCard ${pulse.className}`}>
      <div className="shopPulseMain">
        <p className="eyebrow">Shop Pulse</p>
        <div className="shopPulseTitleRow">
          <h3>{pulse.label}</h3>
          <strong className={effClass(metrics.efficiency)}>{Math.round(metrics.efficiency)}%</strong>
        </div>
        <p>{pulse.note}</p>
      </div>
      <div className="shopPulseStats">
        <div><span>Capacity</span><strong>{metrics.capacity}%</strong></div>
        <div><span>Active</span><strong>{activeJobs.length}</strong></div>
        <div><span>Requests</span><strong>{requestCount}</strong></div>
        <div><span>Overdue</span><strong>{overdueJobs.length}</strong></div>
      </div>
      <div className="managerFocusStrip">
        <span>Manager Focus</span>
        <div>{focusItems.slice(0, 3).map((item) => <b key={item}>{item}</b>)}</div>
      </div>
    </section>
  );
}

function CompactKpiStrip({ jobs, ctx, metrics }) {
  const inProgress = jobs.filter(j => ctx.status(j.status_id)?.name === "In Progress").length;
  const paused = jobs.filter(j => ctx.status(j.status_id)?.name === "Paused").length;
  const qc = jobs.filter(j => ctx.status(j.status_id)?.name === "QC").length;
  const items = [
    { label: "Capacity", value: `${metrics.capacity}%`, caption: "Workload" },
    { label: "Completed", value: metrics.completedJobs, caption: "Jobs" },
    { label: "In Progress", value: inProgress, caption: "Live jobs" },
    { label: "Book Hrs", value: metrics.bookComplete.toFixed(1), caption: "Complete" },
    { label: "Actual Hrs", value: metrics.actualUsed.toFixed(1), caption: "Used" },
    { label: "Helpers", value: `${metrics.helperBookComplete.toFixed(1)} / ${metrics.helperActualUsed.toFixed(1)}`, caption: "Book / actual" },
    { label: "Avg Install", value: `${metrics.avgActualTime.toFixed(2)}h`, caption: "Completed" },
    { label: "Efficiency", value: `${Math.round(metrics.efficiency)}%`, caption: "Overall" },
  ];
  if (paused > 0) items.splice(3, 0, { label: "Paused", value: paused, caption: "Needs attention", alert: true });
  if (qc > 0) items.splice(4, 0, { label: "QC", value: qc, caption: "Awaiting inspection", alert: true });

  return (
    <div className="compactKpiStrip">
      {items.map((item) => (
        <article key={item.label} className={`compactKpi ${item.alert ? "alert" : ""}`}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.caption}</small>
        </article>
      ))}
    </div>
  );
}

function DashboardRequestsPanel({ ctx, access, reload, requests }) {
  if (!requests.length) {
    return (
      <Panel title="Outstanding Requests" chip="Clear">
        <div className="emptyRequestState">
          <strong>No pending requests</strong>
          <p className="muted">Roadblock extensions and approval requests will stay here until handled.</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Outstanding Requests" chip={`${requests.length} pending`}>
      <div className="dashboardRequestList compact">
        {requests.slice(0, 4).map((notification) => (
          <PendingRoadblockExtensionCard
            key={notification.id}
            notification={notification}
            ctx={ctx}
            access={access}
            reload={reload}
          />
        ))}
      </div>
    </Panel>
  );
}

function WeeklyTrendPanel({ allJobs, ctx, selectedDate }) {
  const base = new Date(`${selectedDate || todayIso()}T00:00:00`);
  const days = Array.from({ length: 5 }, (_, index) => {
    const d = new Date(base);
    d.setDate(base.getDate() - (4 - index));
    const date = d.toISOString().slice(0, 10);
    const dayJobs = getJobsForExactDate(allJobs, date);
    const dayMetrics = calculateMetrics(dayJobs, ctx, date);
    return {
      date,
      label: d.toLocaleDateString([], { weekday: "short" }),
      efficiency: Math.round(dayMetrics.efficiency || 0),
      book: Number(dayMetrics.bookComplete || 0),
      completed: Number(dayMetrics.completedJobs || 0),
    };
  });
  const maxBook = Math.max(1, ...days.map((day) => day.book));

  return (
    <Panel title="Weekly Trend" chip="Book hours">
      <div className="weeklyTrendRows">
        {days.map((day) => (
          <div className="weeklyTrendRow" key={day.date}>
            <span>{day.label}</span>
            <div className="weeklyTrendTrack"><b style={{ width: `${Math.max(4, (day.book / maxBook) * 100)}%` }} /></div>
            <strong>{day.book.toFixed(1)}h</strong>
            <small>{day.completed} jobs</small>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CapacityForecastPanel({ allJobs, ctx, selectedDate }) {
  const days = [0, 1, 2].map((offset) => {
    const d = new Date(`${selectedDate || todayIso()}T00:00:00`);
    d.setDate(d.getDate() + offset);
    const date = d.toISOString().slice(0, 10);
    const metrics = getSimpleDailyMetrics(allJobs, ctx, date);
    return {
      date,
      label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long" }),
      capacity: metrics.capacity,
      openBook: getJobsForExactDate(allJobs, date).filter((j) => !ctx.isComplete(j.status_id)).reduce((sum, job) => sum + getAdjustedBookHours(job), 0),
    };
  });

  return (
    <Panel title="Capacity Forecast" chip="Next 3 days">
      <div className="capacityForecastList">
        {days.map((day) => (
          <div className={`capacityForecastRow ${day.capacity >= 100 ? "over" : day.capacity >= 85 ? "watch" : ""}`} key={day.date}>
            <div><strong>{day.label}</strong><span>{day.openBook.toFixed(1)} open book hrs</span></div>
            <div className="capacityMiniTrack"><b style={{ width: `${Math.min(100, Math.max(2, day.capacity))}%` }} /></div>
            <em>{day.capacity}%</em>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Dashboard({ jobs, allJobs = jobs, ctx, metrics, selectedDate, access, reload }) {
  const openJobs = jobs.filter((j) => !ctx.isComplete(j.status_id));
  const requests = buildDashboardRequestItems(ctx, access);

  return (
    <section className="page dashboardPolished">
      <ShopPulseCard jobs={jobs} allJobs={allJobs} ctx={ctx} metrics={metrics} selectedDate={selectedDate} requestCount={requests.length} />

      <div className="dashboardTopGrid">
        <DashboardRequestsPanel ctx={ctx} access={access} reload={reload} requests={requests} />
        <Panel title="Live Shop Status" chip={`${openJobs.length} open`}>
          <LiveTechnicianAvailability jobs={jobs} ctx={ctx} />
        </Panel>
      </div>

      <CompactKpiStrip jobs={jobs} ctx={ctx} metrics={metrics} />

      <div className="grid two dashboardLowerGrid">
        <Panel title="Jobs In Progress" chip="Open jobs">
          <div className="jobList compactJobList">
            {openJobs.length ? (
              openJobs.slice(0, 8).map((job) => <JobCard key={job.id} job={job} ctx={ctx} />)
            ) : (
              <p className="muted">No open jobs.</p>
            )}
          </div>
        </Panel>
        <div className="dashboardStack">
          <WeeklyTrendPanel allJobs={allJobs} ctx={ctx} selectedDate={selectedDate} />
          <CapacityForecastPanel allJobs={allJobs} ctx={ctx} selectedDate={selectedDate} />
          <Panel title="Monthly Efficiency Leaderboard" chip={currentMonthLabel()}>
            <TechLeaderboard jobs={allJobs} ctx={ctx} monthly />
          </Panel>
        </div>
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
  return addBookMinutesWithinShop(getEffectiveJobStartTime(job), getBookMinutes(job), ctx);
}

function getRemainingBookHoursForRollover(job, ctx) {
  const schedule = getShopSchedule(ctx);
  const start = timeStringToMinutes(getEffectiveJobStartTime(job));
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
  return (ctx.jobHelpers || [])
    .filter((h) => h.technician_id === techId && h.scheduled_date === selectedDate && isActiveHelper(h))
    .sort((a, b) => {
      const aStamp = a.created_at || `${a.scheduled_date || ""}T${shortTime(a.start_time || "00:00")}`;
      const bStamp = b.created_at || `${b.scheduled_date || ""}T${shortTime(b.start_time || "00:00")}`;
      return String(bStamp).localeCompare(String(aStamp));
    })[0] || null;
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
  if (!job?.book_hours) return false;
  const projected = getJobProjectedFinish(job, ctx);
  if (projected.dayOffset > 0) return false;
  return timeStringToMinutes(shortTime(new Date().toTimeString())) >= timeStringToMinutes(projected.finishTime);
}

function formatDurationFromMinutes(minutes) {
  const safe = Math.max(0, Math.round(Number(minutes || 0)));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hrs <= 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr${hrs === 1 ? "" : "s"}`;
  return `${hrs} hr ${mins} min`;
}

function getMobileJobTiming(job, ctx, currentMinute = getCurrentMinuteOfDay()) {
  const projected = getJobProjectedFinish(job, ctx);
  const startedAt = getJobStartedAt(job);
  const startMinute = timeStringToMinutes(getEffectiveJobStartTime(job));
  const finishMinute = projected.dayOffset > 0 ? getShopSchedule(ctx).close : timeStringToMinutes(projected.finishTime);
  const totalMinutes = Math.max(1, finishMinute - startMinute);

  if (!startedAt) {
    return {
      remainingLabel: `Starts at ${formatTime(job?.start_time || "08:00")}`,
      isOver: false,
      progressPercent: 0,
      progressClass: "scheduled",
    };
  }

  const rawRemaining = finishMinute - currentMinute;
  const elapsed = Math.max(0, currentMinute - startMinute);
  const progressPercent = Math.min(100, Math.max(0, (elapsed / totalMinutes) * 100));
  const isOver = rawRemaining < 0 && projected.dayOffset === 0;

  return {
    remainingLabel: isOver
      ? `Over by ${formatDurationFromMinutes(Math.abs(rawRemaining))}`
      : `${formatDurationFromMinutes(rawRemaining)} remaining`,
    isOver,
    progressPercent: isOver ? 100 : progressPercent,
    progressClass: isOver ? "overBook" : progressPercent >= 85 ? "nearLimit" : "onTrack",
  };
}

function calculateHelperCreditedHours(job, helperStartTime, helperEndTime, ctx) {
  // Helper credit is intentionally capped at 100% for core efficiency.
  // Helper work still helps the technician through a separate small curve bonus.
  // Formula: helper book credit = actual helper time.
  const actualHours = calculateWorkingHoursBetween(helperStartTime, helperEndTime, ctx);
  return roundHours(actualHours);
}

function calculateHelperBookHours(job, helperStartTime, ctx) {
  if (!job || !helperStartTime) return 0;

  const projected = getJobProjectedFinish(job, ctx);
  const schedule = getShopSchedule(ctx);
  const nowTime = shortTime(new Date().toTimeString());
  const helperStart = timeStringToMinutes(helperStartTime);
  const projectedFinish = projected.dayOffset > 0 ? schedule.close : timeStringToMinutes(projected.finishTime);

  // Active helper estimate: show 110% capped helper credit from helper start to either
  // projected finish or current time if the job has already passed book time.
  const liveEnd = Math.min(timeStringToMinutes(nowTime), schedule.close);
  const endMinute = projectedFinish > helperStart ? projectedFinish : liveEnd;

  return calculateHelperCreditedHours(job, helperStartTime, minutesToTime(endMinute), ctx);
}

function getHelperDisplayHours(helper, job, ctx) {
  if (!helper) return 0;
  if (!isActiveHelper(helper)) return getCappedHelperBookHours(helper);
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
    if (!job.book_hours) return false;

    const schedule = getShopSchedule(ctx);
    const slotStart = timeStringToMinutes(slotTime);
    const slotEnd = slotStart + 30;
    let minute = timeStringToMinutes(getEffectiveJobStartTime(job));
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
    return getEffectiveJobStartTime(job) === slotTime;
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
                                  {formatTime(getEffectiveJobStartTime(j))} → {formatTime(projected.finishTime)}{projected.dayOffset ? ` +${projected.dayOffset}d` : ""} • {j.book_hours} hrs • {status?.name}
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


function getCurrentHelperStartTime() {
  return shortTime(new Date().toTimeString());
}

function HelperControls({ job, ctx, onAddHelper, onEndHelper, onRemoveHelper }) {
  const [helperTechnicianId, setHelperTechnicianId] = useState("");
  const [helperStartTime, setHelperStartTime] = useState(() => getCurrentHelperStartTime());
  const helpers = getHelpersForJob(job, ctx);

  useEffect(() => {
    setHelperStartTime(getCurrentHelperStartTime());
    setHelperTechnicianId("");
  }, [job?.id]);

  async function handleAddHelper() {
    await onAddHelper(job, helperTechnicianId, helperStartTime || getCurrentHelperStartTime());
    setHelperTechnicianId("");
    setHelperStartTime(getCurrentHelperStartTime());
  }

  function handleHelperSelection(e) {
    setHelperTechnicianId(e.target.value);
    setHelperStartTime(getCurrentHelperStartTime());
  }

  return (
    <div className="helperBox">
      <label>Add assisting technician</label>
      <div className="helperControlsRow">
        <select value={helperTechnicianId} onChange={handleHelperSelection}>
          <option value="">Select helper</option>
          {ctx.technicians
            .filter((t) => t.active && t.id !== job.technician_id)
            .map((t) => (
              <option value={t.id} key={t.id}>{t.name}</option>
            ))}
        </select>
        <input type="time" value={helperStartTime} onChange={(e) => setHelperStartTime(e.target.value)} />
        <button onClick={handleAddHelper}>Add Helper Now</button>
      </div>
      {helpers.map((helper) => {
        const active = isActiveHelper(helper);
        const displayHours = getHelperDisplayHours(helper, job, ctx);
        return (
          <div className="helperLine" key={helper.id}>
            <span>
              {ctx.tech(helper.technician_id)?.name || "Helper"} • {formatTime(helper.start_time)}
              {active ? " → Active" : ` → ${formatTime(helper.end_time)}`} • {displayHours} hrs
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

function Foreman({ jobs, ctx, reload, access }) {
  const open = jobs.filter((j) => !ctx.isComplete(j.status_id));
  const inProgress = ctx.statuses.find((s) => s.name === "In Progress")?.id;
  const paused = ctx.statuses.find((s) => s.name === "Paused")?.id;
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

  async function editJobStartTime(job) {
    const currentStart = getEffectiveJobStartTime(job);
    const entered = window.prompt("Edit job start time (example: 1:30 PM or 13:30)", currentStart);
    if (entered === null) return;

    const cleanTime = normalizeTimeInput(entered);
    if (!cleanTime || !/^\d{2}:\d{2}$/.test(cleanTime)) {
      return alert("Enter a valid start time, like 08:30 or 1:30 PM.");
    }

    const datePart = job.scheduled_date || todayIso();
    const localStart = new Date(`${datePart}T${cleanTime}:00`);
    const productionStartedAt = localStart.toISOString();

    const { error } = await supabase
      .from("jobs")
      .update({
        start_time: cleanTime,
        production_started_at: productionStartedAt,
        updated_at: new Date().toISOString(),
      })
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
              <b>{ctx.tech(job.technician_id)?.name}</b> • {formatTime(getEffectiveJobStartTime(job))} • {job.book_hours} book hrs
            </p>
            <div className="buttonGrid">
              {paused && <button onClick={() => setStatus(job, paused)}>Pause</button>}
              {inProgress && <button onClick={() => setStatus(job, inProgress)}>Start</button>}
              {canEditJobs(access) && ctx.status(job.status_id)?.name === "In Progress" && <button onClick={() => editJobStartTime(job)}>Edit Start</button>}
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

function ProductionLog({ jobs, ctx, reload, setEditingJob, access }) {
  const [search, setSearch] = useState("");
  const [logTab, setLogTab] = useState("completed");
  const [photoJob, setPhotoJob] = useState(null);
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

    await logAuditEvent(ctx, access, {
      action: "Job deleted",
      entityType: "job",
      entityId: id,
      summary: "Job deleted from production log",
      metadata: { jobId: id },
    });

    await reload();
  }

  return (
    <section className="page">
      <Panel title="Production Log" chip={logTab === "completed" ? `${filteredJobs.length} jobs` : `${ctx.comebackRework?.length || 0} comebacks`}>
        <div className="subTabs productionSubTabs">
          <button className={logTab === "completed" ? "active" : ""} onClick={() => setLogTab("completed")}>Completed Jobs</button>
          <button className={logTab === "comebacks" ? "active" : ""} onClick={() => setLogTab("comebacks")}>Comebacks / Rework</button>
        </div>

        {logTab === "completed" ? (
          <>
            <div className="adminActions">
              <input placeholder="Search customer, vehicle, job, tech..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="table">
              <div className="row header productionLogRow">
                <span>Customer</span>
                <span>Vehicle</span>
                <span>Job</span>
                <span>Tech</span>
                <span>Status</span>
                <span>Book</span>
                <span>Actual</span>
                <span>Eff.</span>
                <span>QC</span>
                <span>Photos</span>
                <span></span>
              </div>

              {filteredJobs.map((j) => {
                const eff = efficiency(j);
                return (
                  <div className="row productionLogRow" key={j.id}>
                    <b>{j.customer}</b>
                    <span>{j.vehicle}</span>
                    <span>{ctx.jobProductsSummary(j)}</span>
                    <span>{ctx.tech(j.technician_id)?.name}</span>
                    <StatusPill status={ctx.status(j.status_id)} />
                    <span>{j.book_hours}</span>
                    <span>{j.actual_hours ?? "—"}</span>
                    <b className={effClass(eff)}>{eff ? `${Math.round(eff)}%` : "—"}</b>
                    <span>{j.qc || "N/A"}</span>
                    <button className="photosLogButton" onClick={() => setPhotoJob(j)}>
                      <ImagePlus size={15} /> {(ctx.damagePhotos || []).filter((photo) => photo.job_id === j.id).length}
                    </button>
                    <div className="rowActions">
                      <button onClick={() => setEditingJob(j)}>{canEditJobs(access) ? "Edit" : "Details"}</button>
                      {canEditJobs(access) && <button onClick={() => deleteJob(j.id)}>Delete</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <ComebackReworkManager ctx={ctx} reload={reload} access={access} />
        )}
      </Panel>
      {photoJob && <JobPhotosModal job={photoJob} ctx={ctx} onClose={() => setPhotoJob(null)} />}
    </section>
  );
}

function JobPhotosModal({ job, ctx, onClose }) {
  const photos = (ctx.damagePhotos || [])
    .filter((photo) => photo.job_id === job.id)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return (
    <div className="modalBackdrop">
      <div className="modal photoModal">
        <div className="modalHeader">
          <div>
            <h3>Photos</h3>
            <p className="muted">{job.customer || "Customer"} • {job.vehicle || "Vehicle"} • {photos.length} photo{photos.length === 1 ? "" : "s"}</p>
          </div>
          <button onClick={onClose} aria-label="Close photos"><X size={22} /></button>
        </div>

        {photos.length ? (
          <div className="productionPhotoGrid">
            {photos.map((photo) => (
              <a className="productionPhotoCard" key={photo.id || photo.storage_path} href={photo.public_url} target="_blank" rel="noreferrer">
                <img src={photo.public_url} alt={photo.note || "Job photo"} loading="lazy" />
                <div>
                  <strong>{photo.note || "Job photo"}</strong>
                  <span>{photo.uploaded_by || "Unknown"} • {formatDateTime(photo.created_at)}</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <ImagePlus size={30} />
            <h2>No photos attached</h2>
            <p>Photos uploaded from Mobile Manager will stay attached to this production log job.</p>
          </div>
        )}
      </div>
    </div>
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
          const baseEff = actualWithHelpers ? (bookWithHelpers / actualWithHelpers) * 100 : 0;
          const helperCurveBonus = getHelperCurveBonusPercent(helperStats.actualHours);
          const eff = baseEff ? baseEff + helperCurveBonus : 0;

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
                <Metric label="Helper Curve" value={`+${helperCurveBonus.toFixed(1)}%`} />
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


function NotificationsCenter({ ctx, access, reload }) {
  const visibleNotifications = (ctx.notifications || [])
    .filter((notification) => canReceiveNotification(notification, access))
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const pendingRoadblockRequests = visibleNotifications.filter(isPendingRoadblockExtensionRequest);
  const regularNotifications = visibleNotifications.filter(
    (notification) => !isPendingRoadblockExtensionRequest(notification) && !getNotificationRead(notification, access)
  );
  const displayCount = pendingRoadblockRequests.length + regularNotifications.length;

  return (
    <Panel title="Notifications" chip={`${displayCount} alerts`}>
      <div className="notificationPermissionRow">
        <div>
          <strong>Desktop alerts</strong>
          <span>{getNotificationPermissionLabel()}</span>
        </div>
        <div className="rowActions">
          <button className="primary" onClick={() => enableHhNotifications(ctx, access)}>Enable Notifications</button>
          <button onClick={() => clearVisibleNotifications(ctx, access, visibleNotifications, reload)}>Clear Notifications</button>
        </div>
      </div>
      <div className="notificationList">
        {pendingRoadblockRequests.map((notification) => (
          <PendingRoadblockExtensionCard
            key={notification.id}
            notification={notification}
            ctx={ctx}
            access={access}
            reload={reload}
          />
        ))}
        {regularNotifications.map((notification) => (
          <div className="notificationCard unread" key={notification.id}>
            <div>
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
              <span>{notification.created_at ? new Date(notification.created_at).toLocaleString() : ""}</span>
            </div>
            <button onClick={() => markNotificationRead(ctx, access, notification, reload)}>Clear</button>
          </div>
        ))}
        {!displayCount && <div className="emptyState"><h2>No notifications</h2><p>Status changes, assigned jobs, helper changes, streaks, and records will appear here.</p></div>}
      </div>
    </Panel>
  );
}

function PendingRoadblockExtensionCard({ notification, ctx, access, reload }) {
  const metadata = notification.metadata || {};
  const job = (ctx.jobs || []).find((item) => item.id === notification.job_id);
  const requestedMinutes = Number(metadata.requested_minutes || 0);
  const [approvedMinutes, setApprovedMinutes] = useState(Number(metadata.approved_minutes || requestedMinutes || 30));
  const [managerNote, setManagerNote] = useState("");
  const techName = metadata.requested_by || ctx.tech(metadata.requested_by_technician_id || job?.technician_id)?.name || "Technician";

  async function updateNotificationStatus(status, extraMetadata = {}) {
    const nextMetadata = {
      ...metadata,
      ...extraMetadata,
      status,
      decided_by: access?.fullName || access?.email || access?.role || "Manager",
      decided_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("app_notifications")
      .update({ metadata: nextMetadata })
      .eq("id", notification.id);
    if (error) return alert(error.message);
    return nextMetadata;
  }

  async function approveRequest() {
    const minutes = Math.max(1, Math.round(Number(approvedMinutes)));
    if (!Number.isFinite(minutes) || minutes <= 0) return alert("Enter a valid approved extension time.");
    if (!job) return alert("Could not find the job attached to this request.");

    const addedHours = roundHours(minutes / 60);
    const previousBookHours = Number(job.book_hours || 0);
    const nextBookHours = roundHours(previousBookHours + addedHours);
    const noteLine = `Roadblock extension approved: +${minutes} min by ${access?.fullName || access?.email || access?.role || "manager"}. Tech requested +${requestedMinutes} min. Reason: ${metadata.reason || "No reason recorded"}${managerNote ? `. Manager note: ${managerNote}` : ""}`;

    const { error: jobError } = await supabase
      .from("jobs")
      .update({
        book_hours: nextBookHours,
        notes: `${job.notes || ""}
${noteLine}`.trim(),
        approved_variance_hours: roundHours(Number(job.approved_variance_hours || 0) + addedHours),
        approved_variance_reason: metadata.reason || job.approved_variance_reason || "Roadblock extension",
        approved_variance_approved_by: access?.fullName || access?.email || access?.role || "Manager",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (jobError) return alert(jobError.message);

    const nextMetadata = await updateNotificationStatus("approved", {
      approved_minutes: minutes,
      manager_note: managerNote || null,
      previous_book_hours: previousBookHours,
      new_book_hours: nextBookHours,
    });
    if (!nextMetadata) return;

    await logAuditEvent(ctx, access, {
      action: "Roadblock extension approved",
      entityType: "job",
      entityId: job.id,
      summary: `${job.vehicle || "Job"} roadblock extension approved for +${minutes} min`,
      metadata: nextMetadata,
    });
    await createAppNotification(ctx, access, {
      type: "roadblock_extension_approved",
      title: "Extension Approved",
      body: `${jobDisplayName(job, ctx)} extension approved for +${minutes} min${managerNote ? `. ${managerNote}` : ""}`,
      jobId: job.id,
      technicianId: metadata.requested_by_technician_id || job.technician_id,
      audienceRoles: ["technician", "foreman"],
      metadata: nextMetadata,
    });
    notifyUser(`Extension approved: +${minutes} min`);
    await reload();
  }

  async function denyRequest() {
    const nextMetadata = await updateNotificationStatus("denied", {
      approved_minutes: 0,
      manager_note: managerNote || null,
    });
    if (!nextMetadata) return;

    await logAuditEvent(ctx, access, {
      action: "Roadblock extension denied",
      entityType: "job",
      entityId: notification.job_id,
      summary: `${job?.vehicle || "Job"} roadblock extension denied`,
      metadata: nextMetadata,
    });
    await createAppNotification(ctx, access, {
      type: "roadblock_extension_denied",
      title: "Extension Denied",
      body: `${job ? jobDisplayName(job, ctx) : "Roadblock"} extension request denied${managerNote ? `. ${managerNote}` : ""}`,
      jobId: notification.job_id,
      technicianId: metadata.requested_by_technician_id || job?.technician_id || null,
      audienceRoles: ["technician", "foreman"],
      metadata: nextMetadata,
    });
    notifyUser("Extension request denied");
    await reload();
  }

  return (
    <div className="notificationCard roadblockRequestCard unread">
      <div>
        <strong>Roadblock Extension Request</strong>
        <p><b>{techName}</b> requested <b>+{requestedMinutes} min</b> on {job ? jobDisplayName(job, ctx) : "a job"}.</p>
        <p><b>Reason:</b> {metadata.reason || "No reason recorded"}</p>
        <p><b>Roadblock:</b> {metadata.current_roadblock_reason || metadata.reason || "Roadblock request"}</p>
        {metadata.job_status_when_requested && <p><b>Job status stayed:</b> {metadata.job_status_when_requested}</p>}
        <span>{notification.created_at ? new Date(notification.created_at).toLocaleString() : ""}</span>
      </div>
      <div className="roadblockRequestControls">
        <label>
          Approved time, minutes
          <input type="number" min="1" step="1" value={approvedMinutes} onChange={(event) => setApprovedMinutes(event.target.value)} />
        </label>
        <label>
          Manager note
          <input value={managerNote} onChange={(event) => setManagerNote(event.target.value)} placeholder="Optional" />
        </label>
        <div className="roadblockRequestActions">
          <button className="primary" onClick={approveRequest}>Approve Extension</button>
          <button onClick={denyRequest}>Deny Request</button>
        </div>
      </div>
    </div>
  );
}

function HallOfFame({ ctx, access }) {
  const products = (ctx.products || []).filter((product) => product.active !== false);
  const rows = products.map((product) => {
    const record = buildProductRecordData(ctx, product.id);
    const personal = access?.technicianId ? buildProductRecordData(ctx, product.id, access.technicianId) : null;
    return { product, record, personal };
  }).filter((row) => row.record.count > 0);

  return (
    <div className="grid two">
      <Panel title="Hall of Fame" chip="Product based records">
        <p className="muted">Records are based on the product assigned to the ticket from the Products page. Shop records unlock after 10 qualifying installs of that exact product.</p>
        <div className="hofList">
          {rows.map(({ product, record, personal }) => {
            const holder = record.fastest ? ctx.tech(record.fastest.technician_id)?.name || "Technician" : "—";
            return (
              <div className="hofCard" key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <span>{record.count} / 10 qualifying installs{record.unlocked ? " • Unlocked" : " • Locked"}</span>
                </div>
                <div className="hofStats">
                  <span>Shop Record</span>
                  <strong>{record.unlocked && record.fastest ? `${Number(record.fastest.actual_hours || 0).toFixed(2)} hrs` : "Locked"}</strong>
                  <em>{record.unlocked ? holder : "Record starts at 10 installs"}</em>
                </div>
                <div className="hofStats">
                  <span>My Best</span>
                  <strong>{personal?.fastest ? `${Number(personal.fastest.actual_hours || 0).toFixed(2)} hrs` : "—"}</strong>
                  <em>{personal?.count || 0} qualifying installs</em>
                </div>
              </div>
            );
          })}
          {!rows.length && <div className="emptyState"><h2>No qualifying installs yet</h2><p>Complete jobs linked to Products page items to build Hall of Fame records.</p></div>}
        </div>
      </Panel>
      <Panel title="Qualification Rules" chip="Locked until 10">
        <div className="simpleRules">
          <p><b>Source:</b> Product selected on the work order.</p>
          <p><b>Unlock:</b> 10 qualifying installs of that product.</p>
          <p><b>Qualifying:</b> completed normally, no approved variance, no comeback.</p>
          <p><b>Initial record:</b> fastest qualifying install from the first 10.</p>
        </div>
      </Panel>
    </div>
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

function PerformanceCenter({ jobs, ctx, metrics, access }) {
  const activeTechs = ctx.technicians.filter((t) => t.active);
  const [selectedTechId, setSelectedTechId] = useState(activeTechs[0]?.id || "");
  const canViewDevelopment = canViewTechnicianDevelopment(access);
  const [performanceMode, setPerformanceMode] = useState("performance");

  useEffect(() => {
    if (!selectedTechId && activeTechs[0]?.id) setSelectedTechId(activeTechs[0].id);
  }, [selectedTechId, activeTechs]);

  useEffect(() => {
    if (!canViewDevelopment && performanceMode === "development") setPerformanceMode("performance");
  }, [canViewDevelopment, performanceMode]);

  const selectedTech = ctx.tech(selectedTechId) || activeTechs[0];
  const performanceWeekStart = currentWeekStartIso();
  const performanceWeekJobs = currentWeekCompletedJobs(jobs, ctx);
  const performanceStats = getTechStats(performanceWeekJobs, ctx, null, { sinceDate: performanceWeekStart });
  const shopRows = buildProductPerformanceRows(performanceWeekJobs, ctx, null);
  const techRows = buildProductPerformanceRows(performanceWeekJobs, ctx, selectedTech?.id);

  return (
    <section className="page">
      <div className="performanceHero">
        <div>
          <p className="eyebrow">Performance Platform</p>
          <h3>Install times, efficiency, records, and shop averages</h3>
          <p>No labor dollars. This page measures execution, production, teamwork, and improvement.</p>
        </div>
        <div className="performanceHeroStats">
          <div>
            <span>Shop Efficiency</span>
            <strong className={effClass(metrics.efficiency)}>{Math.round(metrics.efficiency)}%</strong>
          </div>
          <div>
            <span>Avg Job Time</span>
            <strong>{performanceStats.avgActual.toFixed(2)}h</strong>
          </div>
          <div>
            <span>Completed</span>
            <strong>{performanceStats.completedJobs}</strong>
          </div>
        </div>
      </div>

      <div className="performanceTabs">
        <button className={performanceMode === "performance" ? "active" : ""} onClick={() => setPerformanceMode("performance")}>Technician Performance</button>
        {canViewDevelopment && (
          <button className={performanceMode === "development" ? "active" : ""} onClick={() => setPerformanceMode("development")}>Technician Development</button>
        )}
      </div>

      {performanceMode === "development" && canViewDevelopment ? (
        <TechnicianDevelopmentCenter jobs={jobs} ctx={ctx} selectedTech={selectedTech} selectedTechId={selectedTechId} setSelectedTechId={setSelectedTechId} activeTechs={activeTechs} />
      ) : (
        <>
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
              {selectedTech && <TechnicianDashboard technician={selectedTech} jobs={performanceWeekJobs} ctx={ctx} rows={techRows} statsOptions={{ sinceDate: performanceWeekStart }} />}
            </Panel>

            <Panel title="Weekly Leaderboard" chip={currentWeekLabel()}>
              <TechLeaderboard jobs={performanceWeekJobs} ctx={ctx} detailed statsOptions={{ sinceDate: performanceWeekStart }} />
            </Panel>
          </div>

          <Panel title="Average Job Times by Product" chip="This week">
            <PerformanceTable rows={shopRows} emptyText="Complete jobs with actual hours to build shop averages." />
          </Panel>
        </>
      )}
    </section>
  );
}

function TechnicianDashboard({ technician, jobs, ctx, rows, statsOptions = {} }) {
  const stats = getTechStats(jobs, ctx, technician.id, statsOptions);
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
        <MiniStat label="Helper Curve" value={`+${stats.helperCurveBonus.toFixed(1)}%`} />
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


function TechnicianDevelopmentCenter({ jobs, ctx, selectedTech, selectedTechId, setSelectedTechId, activeTechs }) {
  const techSummary = selectedTech ? buildTechnicianDevelopmentSummary(selectedTech, jobs, ctx) : null;
  const teamSummaries = activeTechs
    .map((tech) => buildTechnicianDevelopmentSummary(tech, jobs, ctx))
    .sort((a, b) => b.developmentScore - a.developmentScore);

  return (
    <div className="developmentModule">
      <Panel title="Technician Development" chip="Leadership only">
        <div className="developmentIntro">
          <div>
            <p className="eyebrow">Foreman • Manager • Admin</p>
            <h3>Long-term technician growth and coaching</h3>
            <p>Built only from production, efficiency, over-book, job mix, and helper contribution data.</p>
          </div>
          <label className="developmentSelector">
            Technician
            <select value={selectedTech?.id || ""} onChange={(e) => setSelectedTechId(e.target.value)}>
              {activeTechs.map((tech) => (
                <option value={tech.id} key={tech.id}>{tech.name}</option>
              ))}
            </select>
          </label>
        </div>

        {techSummary && (
          <>
            <div className="developmentScoreCard">
              <div>
                <span>Development score</span>
                <strong>{techSummary.developmentScore}/100</strong>
                <p>{techSummary.trendLabel}</p>
              </div>
              <div>
                <span>90-day efficiency</span>
                <strong className={effClass(techSummary.efficiency90)}>{Math.round(techSummary.efficiency90)}%</strong>
                <p>{formatTrendPoints(techSummary.efficiencyTrend)} vs previous 90 days</p>
              </div>
              <div>
                <span>Helper contribution</span>
                <strong>{techSummary.helperHours90.toFixed(1)}h</strong>
                <p>{techSummary.jobsAssisted90} assisted jobs</p>
              </div>
            </div>

            <div className="developmentCharts">
              <TrendChart title="Efficiency trend" rows={techSummary.monthlyRows} valueKey="efficiency" suffix="%" />
              <TrendChart title="Book hours produced" rows={techSummary.monthlyRows} valueKey="bookHours" suffix="h" />
            </div>

            <div className="grid two">
              <DevelopmentNarrative summary={techSummary} />
              <SpecialtyAnalysis rows={techSummary.specialties} />
            </div>
          </>
        )}
      </Panel>

      <Panel title="Team Development Snapshot" chip="90 days">
        <div className="developmentTeamList">
          {teamSummaries.map((summary) => (
            <button key={summary.technician.id} className="developmentTeamRow" onClick={() => setSelectedTechId(summary.technician.id)}>
              <strong>{summary.technician.name}</strong>
              <span>{summary.developmentScore}/100</span>
              <span>{Math.round(summary.efficiency90)}%</span>
              <span>{summary.bookHours90.toFixed(1)} book hrs</span>
              <span>{summary.helperHours90.toFixed(1)} helped hrs</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TrendChart({ title, rows, valueKey, suffix = "" }) {
  const cleanRows = rows.length ? rows : [{ label: "No data", [valueKey]: 0 }];
  const max = Math.max(...cleanRows.map((row) => Number(row[valueKey] || 0)), 1);

  return (
    <div className="trendChartCard">
      <h3>{title}</h3>
      <div className="trendBars">
        {cleanRows.map((row) => {
          const value = Number(row[valueKey] || 0);
          const height = Math.max(6, Math.round((value / max) * 100));
          return (
            <div className="trendBarGroup" key={row.label}>
              <div className="trendBarTrack">
                <div className="trendBarFill" style={{ height: `${height}%` }} />
              </div>
              <strong>{formatChartValue(value, suffix)}</strong>
              <span>{row.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DevelopmentNarrative({ summary }) {
  return (
    <div className="developmentNarrative">
      <h3>Automated coaching notes</h3>
      <div>
        <h4>Strengths</h4>
        {summary.strengths.map((item) => <p key={item}>{item}</p>)}
      </div>
      <div>
        <h4>Focus areas</h4>
        {summary.focusAreas.map((item) => <p key={item}>{item}</p>)}
      </div>
      <div>
        <h4>Recommended coaching</h4>
        {summary.recommendations.map((item) => <p key={item}>{item}</p>)}
      </div>
    </div>
  );
}

function SpecialtyAnalysis({ rows }) {
  return (
    <div className="specialtyBox">
      <h3>Job mix and specialties</h3>
      {rows.length ? rows.map((row) => (
        <div className="specialtyRow" key={row.name}>
          <span>{row.name}</span>
          <strong>{renderStars(row.rating)}</strong>
          <small>{row.jobs} jobs • {Math.round(row.efficiency)}%</small>
        </div>
      )) : <p className="muted">Complete jobs with actual hours to build specialty analysis.</p>}
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


function canViewTechnicianDevelopment(access) {
  return ["admin", "manager", "foreman"].includes(normalizeRole(access?.role));
}

function canEditJobs(access) {
  return ["admin", "manager", "foreman", "service_writer"].includes(normalizeRole(access?.role));
}

function isTechnicianOnly(access) {
  return normalizeRole(access?.role) === "technician";
}

function buildTechnicianDevelopmentSummary(technician, jobs, ctx) {
  const now = new Date();
  const last90Start = addDays(now, -90);
  const prev90Start = addDays(now, -180);
  const completed = jobs.filter((job) => job.technician_id === technician.id && ctx.isComplete(job.status_id) && Number(job.actual_hours) > 0);
  const last90 = completed.filter((job) => getJobDate(job) >= last90Start && getJobDate(job) <= now);
  const prev90 = completed.filter((job) => getJobDate(job) >= prev90Start && getJobDate(job) < last90Start);
  const stats90 = summarizeCompletedJobs(last90);
  const statsPrev90 = summarizeCompletedJobs(prev90);
  const helper90 = getHelperPerformanceStats(ctx, technician.id, { sinceDate: toIsoDate(last90Start) });
  const helperPrev90 = getHelperPerformanceStats(ctx, technician.id, { sinceDate: toIsoDate(prev90Start), beforeDate: toIsoDate(last90Start) });
  const monthlyRows = buildMonthlyDevelopmentRows(technician.id, jobs, ctx, 6);
  const specialties = buildSpecialtyDevelopmentRows(technician.id, jobs, ctx);
  const efficiencyTrend = stats90.efficiency - statsPrev90.efficiency;
  const bookTrend = stats90.bookHours - statsPrev90.bookHours;
  const helperTrend = helper90.actualHours - helperPrev90.actualHours;
  const overBookRate = stats90.completedJobs ? (stats90.overBookJobs / stats90.completedJobs) * 100 : 0;
  const trendLabel = efficiencyTrend > 3 ? "Improving" : efficiencyTrend < -3 ? "Needs attention" : "Steady";
  const developmentScore = calculateDevelopmentScore(stats90, statsPrev90, helper90);

  return {
    technician,
    completedJobs90: stats90.completedJobs,
    bookHours90: stats90.bookHours,
    actualHours90: stats90.actualHours,
    efficiency90: stats90.efficiency,
    efficiencyTrend,
    bookTrend,
    helperHours90: helper90.actualHours,
    helperTrend,
    jobsAssisted90: helper90.assignments,
    overBookJobs90: stats90.overBookJobs,
    overBookRate,
    avgMinutesOverBook: stats90.avgMinutesOverBook,
    monthlyRows,
    specialties,
    trendLabel,
    developmentScore,
    strengths: buildDevelopmentStrengths(stats90, statsPrev90, helper90, helperPrev90, specialties),
    focusAreas: buildDevelopmentFocusAreas(stats90, statsPrev90, helper90, overBookRate, specialties),
    recommendations: buildDevelopmentRecommendations(stats90, helper90, overBookRate, specialties, efficiencyTrend),
  };
}

function summarizeCompletedJobs(rows) {
  const completedJobs = rows.length;
  const bookHours = roundHours(rows.reduce((sum, job) => sum + Number(job.book_hours || 0), 0));
  const actualHours = roundHours(rows.reduce((sum, job) => sum + Number(job.actual_hours || 0), 0));
  const efficiency = actualHours ? (bookHours / actualHours) * 100 : 0;
  const overRows = rows.filter((job) => Number(job.actual_hours || 0) > Number(job.book_hours || 0));
  const minutesOver = overRows.map((job) => Math.max(0, (Number(job.actual_hours || 0) - Number(job.book_hours || 0)) * 60));
  return {
    completedJobs,
    bookHours,
    actualHours,
    efficiency,
    overBookJobs: overRows.length,
    avgMinutesOverBook: minutesOver.length ? minutesOver.reduce((a, b) => a + b, 0) / minutesOver.length : 0,
  };
}

function calculateDevelopmentScore(current, previous, helperStats) {
  let score = 70;
  score += clamp((current.efficiency - 90) * 0.35, -15, 18);
  score += clamp((current.bookHours - 20) * 0.25, -8, 12);
  score += clamp((current.efficiency - previous.efficiency) * 0.9, -12, 12);
  score += clamp(helperStats.actualHours * 0.8, 0, 8);
  score -= clamp(current.overBookJobs * 1.5, 0, 10);
  return Math.round(clamp(score, 0, 100));
}

function buildMonthlyDevelopmentRows(technicianId, jobs, ctx, monthsBack = 6) {
  const now = new Date();
  const rows = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.getMonth();
    const year = d.getFullYear();
    const monthJobs = jobs.filter((job) => {
      if (job.technician_id !== technicianId || !ctx.isComplete(job.status_id) || Number(job.actual_hours) <= 0) return false;
      const jd = getJobDate(job);
      return jd.getFullYear() === year && jd.getMonth() === month;
    });
    const summary = summarizeCompletedJobs(monthJobs);
    const helper = getHelperPerformanceStats(ctx, technicianId, { monthDate: d });
    rows.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      efficiency: Math.round(summary.efficiency),
      bookHours: roundHours(summary.bookHours + helper.bookHours),
      helperHours: helper.actualHours,
      jobs: summary.completedJobs,
    });
  }
  return rows;
}

function buildSpecialtyDevelopmentRows(technicianId, jobs, ctx) {
  const completed = jobs.filter((job) => job.technician_id === technicianId && ctx.isComplete(job.status_id) && Number(job.actual_hours) > 0);
  const byCategory = new Map();

  for (const job of completed) {
    const savedLines = ctx.jobProductLines(job.id);
    const productLines = savedLines.length
      ? savedLines
      : [{
          product_id: job.product_id,
          book_hours: job.book_hours,
          quantity: 1,
        }];

    const normalizedLines = productLines
      .filter((line) => line?.product_id)
      .map((line) => {
        const product = ctx.product(line.product_id);
        const lineBookHours = Number(line.book_hours ?? product?.book_hours ?? 0) * Number(line.quantity || 1);
        return { line, product, lineBookHours };
      });

    if (!normalizedLines.length) continue;

    const jobBookHours = Number(job.book_hours || 0);
    const totalLineBookHours = normalizedLines.reduce((sum, line) => sum + Number(line.lineBookHours || 0), 0);
    const actualHours = Number(job.actual_hours || 0);

    for (const item of normalizedLines) {
      const category = item.product ? ctx.category(item.product.category_id) : null;
      const name = category?.name || item.product?.name || "General installs";
      const lineBookHours = item.lineBookHours || (jobBookHours / normalizedLines.length);
      const actualShare = totalLineBookHours > 0
        ? actualHours * (Number(item.lineBookHours || 0) / totalLineBookHours)
        : actualHours / normalizedLines.length;

      const current = byCategory.get(name) || { name, jobs: 0, bookHours: 0, actualHours: 0 };
      current.jobs += 1;
      current.bookHours += Number(lineBookHours || 0);
      current.actualHours += Number(actualShare || 0);
      byCategory.set(name, current);
    }
  }

  return [...byCategory.values()]
    .map((row) => {
      const efficiency = row.actualHours ? (row.bookHours / row.actualHours) * 100 : 0;
      return { ...row, efficiency, rating: efficiencyToStars(efficiency, row.jobs) };
    })
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 6);
}

function buildDevelopmentStrengths(current, previous, helperStats, previousHelperStats, specialties) {
  const items = [];
  if (current.efficiency >= 105) items.push("High production efficiency over the last 90 days.");
  if (current.efficiency - previous.efficiency >= 5) items.push("Efficiency trend is improving compared with the previous 90 days.");
  if (current.bookHours >= previous.bookHours + 5) items.push("Book hours produced are increasing.");
  if (helperStats.actualHours >= 2) items.push("Strong helper contribution and teamwork.");
  if (helperStats.actualHours > previousHelperStats.actualHours) items.push("Helper contribution is trending up.");
  if (specialties[0]?.jobs >= 2) items.push(`Strongest category: ${specialties[0].name}.`);
  return items.length ? items : ["Baseline data is building. Continue completing jobs with actual hours." ];
}

function buildDevelopmentFocusAreas(current, previous, helperStats, overBookRate, specialties) {
  const items = [];
  if (current.efficiency > 0 && current.efficiency < 95) items.push("Overall production efficiency is below target.");
  if (current.efficiency - previous.efficiency <= -5) items.push("Efficiency has declined versus the previous 90 days.");
  if (overBookRate >= 35) items.push("High percentage of jobs are finishing over book time.");
  if (current.avgMinutesOverBook >= 30) items.push(`Average over-book time is ${Math.round(current.avgMinutesOverBook)} minutes on jobs that exceed book.`);
  const lowSpecialty = specialties.find((row) => row.jobs >= 2 && row.efficiency < 90);
  if (lowSpecialty) items.push(`${lowSpecialty.name} is tracking below normal efficiency.`);
  if (helperStats.actualHours < 0.5 && current.completedJobs > 0) items.push("Low helper contribution; look for safe opportunities to assist other techs when available.");
  return items.length ? items : ["No major focus area detected from the current production data." ];
}

function buildDevelopmentRecommendations(current, helperStats, overBookRate, specialties, efficiencyTrend) {
  const items = [];
  if (current.efficiency < 95) items.push("Review recent over-book jobs and identify the repeat causes before assigning similar work." );
  if (overBookRate >= 35) items.push("Use prep/staging checklists on larger installs until over-book percentage drops." );
  if (efficiencyTrend >= 5) items.push("Keep the current job mix steady; the trend is moving in the right direction." );
  if (helperStats.actualHours >= 2) items.push("Continue using this technician as a support resource when primary workload allows." );
  const highSpecialty = specialties.find((row) => row.jobs >= 2 && row.efficiency >= 105);
  if (highSpecialty) items.push(`Assign more ${highSpecialty.name} work when schedule pressure is high.` );
  return items.length ? items : ["Keep collecting production data and review again after more completed work." ];
}

function getJobDate(job) {
  const value = job.completed_at || job.updated_at || job.scheduled_date || job.created_at || todayIso();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date(`${todayIso()}T00:00:00`) : d;
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function toIsoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function formatTrendPoints(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.1) return "steady";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

function formatChartValue(value, suffix) {
  const n = Number(value || 0);
  return `${suffix === "%" ? Math.round(n) : n.toFixed(1)}${suffix}`;
}

function efficiencyToStars(efficiency, jobs) {
  if (!jobs) return 0;
  if (efficiency >= 110) return 5;
  if (efficiency >= 100) return 4;
  if (efficiency >= 90) return 3;
  if (efficiency >= 80) return 2;
  return 1;
}

function renderStars(rating) {
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

// 8) Add these helper functions near the bottom:
function getTechStats(jobs, ctx, technicianId, options = {}) {
  const completed = jobs.filter(
    (j) => (!technicianId || j.technician_id === technicianId) && ctx.isComplete(j.status_id) && Number(j.actual_hours) > 0
  );

  const jobBookHours = completed.reduce((a, j) => a + getAdjustedBookHours(j), 0);
  const jobActualHours = completed.reduce((a, j) => a + Number(j.actual_hours || 0), 0);
  const helperStats = getHelperPerformanceStats(ctx, technicianId, options);
  const receivedStats = getHelpReceivedStats(ctx, technicianId, options);
  const bookHours = jobBookHours + helperStats.bookHours;
  const actualHours = jobActualHours + helperStats.actualHours;
  const baseEfficiency = actualHours ? (bookHours / actualHours) * 100 : 0;
  const helperCurveBonus = getHelperCurveBonusPercent(helperStats.actualHours);
  const efficiencyWithHelperCurve = baseEfficiency ? baseEfficiency + helperCurveBonus : 0;
  const qcPassed = completed.filter((j) => (j.qc || "").toLowerCase() === "yes").length;

  return {
    completedJobs: completed.length,
    bookHours,
    actualHours,
    jobBookHours,
    jobActualHours,
    helperBookHours: helperStats.bookHours,
    helperActualHours: helperStats.actualHours,
    helperCurveBonus,
    baseEfficiency,
    helperAssignments: helperStats.assignments,
    helpReceivedAssignments: receivedStats.assignments,
    helpReceivedBookHours: receivedStats.bookHours,
    helpReceivedActualHours: receivedStats.actualHours,
    efficiency: efficiencyWithHelperCurve,
    avgActual: completed.length ? jobActualHours / completed.length : 0,
    qcPassRate: completed.length ? (qcPassed / completed.length) * 100 : 0,
  };
}

function getHelperActualHoursForStats(helper, ctx) {
  if (!helper) return 0;

  const storedActual = Number(helper.actual_hours || 0);
  if (storedActual > 0) return roundHours(storedActual);

  if (helper.end_time) {
    return calculateWorkingHoursBetween(helper.start_time, helper.end_time, ctx);
  }

  // Active helpers should still show contribution on dashboards.
  // This prevents a foreman/manager who is helping but has no assigned primary jobs
  // from showing 0% while they are actively assisting.
  if (isActiveHelper(helper) && helper.scheduled_date === todayIso()) {
    return calculateWorkingHoursBetween(helper.start_time, shortTime(new Date().toTimeString()), ctx);
  }

  return 0;
}

function getHelperBookHoursForStats(helper, ctx) {
  // Core performance counts helper work at 100%: 1.0 helped hour = 1.0 book hour.
  // The incentive is handled separately through Helper Curve, so helper time cannot
  // inflate a technician to unrealistic efficiency.
  return getHelperActualHoursForStats(helper, ctx);
}

// Backward-compatible wrappers used by older UI sections.
function getCappedHelperActualHours(helper, ctx) {
  return getHelperActualHoursForStats(helper, ctx);
}

function getCappedHelperBookHours(helper, ctx) {
  return getHelperBookHoursForStats(helper, ctx);
}

function getHelperCurveBonusPercent(helperActualHours) {
  // Incentive curve: +0.5 efficiency point per helper hour, capped at +5 points.
  // This rewards helping without allowing a few minutes of helper time to create extreme efficiency.
  return Math.min(5, roundHours(Number(helperActualHours || 0) * 0.5));
}

function getHelperPerformanceStats(ctx, technicianId = null, options = {}) {
  const helpers = (ctx.jobHelpers || []).filter((helper) => {
    if (technicianId && helper.technician_id !== technicianId) return false;
    const hasRecordedTime = Number(helper.actual_hours) > 0 || Boolean(helper.end_time);
    const hasLiveTime = isActiveHelper(helper) && helper.scheduled_date === todayIso();
    if (!hasRecordedTime && !hasLiveTime) return false;

    if (options.selectedDate && helper.scheduled_date !== options.selectedDate) return false;

    const stamp = helper.ended_at || helper.scheduled_date || helper.updated_at || helper.created_at;
    const d = stamp ? new Date(stamp) : null;

    if (options.sinceDate && (!d || d < new Date(`${options.sinceDate}T00:00:00`))) return false;
    if (options.beforeDate && (!d || d >= new Date(`${options.beforeDate}T00:00:00`))) return false;
    if (options.monthDate) {
      const monthDate = new Date(options.monthDate);
      if (!d || d.getFullYear() !== monthDate.getFullYear() || d.getMonth() !== monthDate.getMonth()) return false;
    }

    if (options.monthly) {
      if (!d) return false;
      const now = new Date();
      if (Number.isNaN(d.getTime())) return false;
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
    }

    return true;
  });

  const receivedStats = technicianId ? getHelpReceivedStats(ctx, technicianId, options) : { assignments: 0, bookHours: 0, actualHours: 0 };

  return {
    assignments: helpers.length,
    bookHours: roundHours(helpers.reduce((sum, helper) => sum + getCappedHelperBookHours(helper, ctx), 0)),
    actualHours: roundHours(helpers.reduce((sum, helper) => sum + getCappedHelperActualHours(helper, ctx), 0)),
    receivedAssignments: receivedStats.assignments,
    receivedBookHours: receivedStats.bookHours,
    receivedActualHours: receivedStats.actualHours,
  };
}

function getHelpReceivedStats(ctx, technicianId = null, options = {}) {
  const helpers = (ctx.jobHelpers || []).filter((helper) => {
    const hasRecordedTime = Number(helper.actual_hours) > 0 || Boolean(helper.end_time);
    const hasLiveTime = isActiveHelper(helper) && helper.scheduled_date === todayIso();
    if (!hasRecordedTime && !hasLiveTime) return false;

    const primaryJob = (ctx.jobs || []).find((job) => job.id === helper.job_id);
    if (!primaryJob) return false;
    if (technicianId && primaryJob.technician_id !== technicianId) return false;

    if (options.selectedDate && helper.scheduled_date !== options.selectedDate) return false;

    const stamp = helper.ended_at || helper.scheduled_date || helper.updated_at || helper.created_at;
    const d = stamp ? new Date(stamp) : null;

    if (options.sinceDate && (!d || d < new Date(`${options.sinceDate}T00:00:00`))) return false;
    if (options.beforeDate && (!d || d >= new Date(`${options.beforeDate}T00:00:00`))) return false;
    if (options.monthDate) {
      const monthDate = new Date(options.monthDate);
      if (!d || d.getFullYear() !== monthDate.getFullYear() || d.getMonth() !== monthDate.getMonth()) return false;
    }

    if (options.monthly) {
      if (!d) return false;
      const now = new Date();
      if (Number.isNaN(d.getTime())) return false;
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
    }

    return true;
  });

  return {
    assignments: helpers.length,
    bookHours: roundHours(helpers.reduce((sum, helper) => sum + getCappedHelperBookHours(helper, ctx), 0)),
    actualHours: roundHours(helpers.reduce((sum, helper) => sum + getCappedHelperActualHours(helper, ctx), 0)),
  };
}

function getJobProductPerformanceEntries(job, ctx) {
  const savedLines = ctx.jobProductLines(job.id);
  const productLines = savedLines.length
    ? savedLines
    : [{
        product_id: job.product_id,
        book_hours: job.book_hours,
        quantity: 1,
      }];

  const normalizedLines = productLines
    .filter((line) => line?.product_id)
    .map((line) => {
      const product = ctx.product(line.product_id);
      const quantity = Number(line.quantity || 1);
      const unitBookHours = Number(line.book_hours ?? product?.book_hours ?? 0);
      const lineBookHours = unitBookHours * quantity;

      return {
        productId: line.product_id,
        productName: product?.name || "Unknown Product",
        productBookHours: Number(product?.book_hours ?? unitBookHours ?? 0),
        lineBookHours,
      };
    });

  if (!normalizedLines.length) return [];

  const actualHours = Number(job.actual_hours || 0);
  const totalLineBookHours = normalizedLines.reduce((sum, line) => sum + Number(line.lineBookHours || 0), 0);

  return normalizedLines.map((line) => {
    const actualShare = totalLineBookHours > 0
      ? actualHours * (Number(line.lineBookHours || 0) / totalLineBookHours)
      : actualHours / normalizedLines.length;

    return {
      ...line,
      jobId: job.id,
      technicianId: job.technician_id,
      actualHours: Number(actualShare || 0),
      completedAt: job.completed_at || job.updated_at || job.created_at,
    };
  });
}

function buildProductPerformanceRows(jobs, ctx, technicianId = null) {
  const completed = jobs.filter((j) => ctx.isComplete(j.status_id) && Number(j.actual_hours) > 0);
  const entries = completed.flatMap((job) => getJobProductPerformanceEntries(job, ctx));

  return ctx.products.map((product) => {
    const productEntries = entries.filter((entry) => entry.productId === product.id);
    const techEntries = technicianId
      ? productEntries.filter((entry) => entry.technicianId === technicianId)
      : productEntries;

    const shopAvg = avg(productEntries.map((entry) => Number(entry.actualHours)));
    const techAvg = avg(techEntries.map((entry) => Number(entry.actualHours)));
    const bestTime = minOrNull(techEntries.map((entry) => Number(entry.actualHours)));
    const lastEntry = [...techEntries].sort(
      (a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)
    )[0];

    const bookHours = Number(product.book_hours || 0);

    return {
      productId: product.id,
      productName: product.name,
      bookHours,
      jobs: techEntries.length,
      techAvg,
      shopAvg,
      vsBook: techAvg === null ? null : bookHours - techAvg,
      vsShop: techAvg === null || shopAvg === null ? null : shopAvg - techAvg,
      bestTime,
      lastActual: lastEntry ? Number(lastEntry.actualHours) : null,
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

function ComebackReworkManager({ ctx, reload, access }) {
  const completedJobs = (ctx.jobs || []).filter((job) => ctx.isComplete(job.status_id));
  const PRE_APP = "__pre_app_ticket__";
  const [draft, setDraft] = useState({
    original_job_id: completedJobs[0]?.id || PRE_APP,
    pre_app_ticket_ref: "",
    pre_app_customer: "",
    pre_app_vehicle: "",
    pre_app_product_summary: "",
    pre_app_completed_at: "",
    pre_app_original_technician_id: ctx.technicians[0]?.id || "",
    reason: "",
    rework_technician_id: ctx.technicians[0]?.id || "",
    rework_hours: "",
    status: "open",
    notes: "",
  });

  const isPreApp = draft.original_job_id === PRE_APP;
  const selectedJob = !isPreApp ? ctx.jobs.find((job) => job.id === draft.original_job_id) : null;
  const originalTech = isPreApp
    ? ctx.tech(draft.pre_app_original_technician_id)
    : selectedJob
      ? ctx.tech(selectedJob.technician_id)
      : null;
  const rows = [...(ctx.comebackRework || [])].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  async function createComeback(e) {
    e.preventDefault();
    if (!isPreApp && !selectedJob) return alert("Select the original completed job or choose Pre-App Ticket.");
    if (isPreApp && !draft.pre_app_customer.trim()) return alert("Enter the pre-app customer name.");
    if (isPreApp && !draft.pre_app_vehicle.trim()) return alert("Enter the pre-app vehicle.");
    if (isPreApp && !draft.pre_app_product_summary.trim()) return alert("Enter the pre-app original job / product.");
    if (!draft.reason.trim()) return alert("Enter the comeback / rework reason.");

    const payload = isPreApp
      ? {
          company_id: ctx.company.id,
          original_job_id: null,
          is_pre_app_ticket: true,
          pre_app_ticket_ref: draft.pre_app_ticket_ref || null,
          original_technician_id: draft.pre_app_original_technician_id || null,
          rework_technician_id: draft.rework_technician_id || null,
          customer: draft.pre_app_customer.trim(),
          vehicle: draft.pre_app_vehicle.trim(),
          product_summary: draft.pre_app_product_summary.trim(),
          original_completed_at: draft.pre_app_completed_at ? `${draft.pre_app_completed_at}T12:00:00` : null,
          reason: draft.reason.trim(),
          rework_hours: draft.rework_hours === "" ? null : Number(draft.rework_hours),
          status: draft.status || "open",
          notes: draft.notes || "",
          created_by_name: access?.fullName || access?.email || access?.role || "Unknown",
          updated_at: new Date().toISOString(),
        }
      : {
          company_id: ctx.company.id,
          original_job_id: selectedJob.id,
          is_pre_app_ticket: false,
          pre_app_ticket_ref: null,
          original_technician_id: selectedJob.technician_id || null,
          rework_technician_id: draft.rework_technician_id || null,
          customer: selectedJob.customer || "",
          vehicle: selectedJob.vehicle || "",
          product_summary: ctx.jobProductsSummary(selectedJob),
          original_completed_at: selectedJob.production_completed_at || selectedJob.updated_at || null,
          reason: draft.reason.trim(),
          rework_hours: draft.rework_hours === "" ? null : Number(draft.rework_hours),
          status: draft.status || "open",
          notes: draft.notes || "",
          created_by_name: access?.fullName || access?.email || access?.role || "Unknown",
          updated_at: new Date().toISOString(),
        };

    const { data, error } = await supabase.from("comeback_rework").insert(payload).select("id").single();
    if (error) return alert(error.message);

    await logAuditEvent(ctx, access, {
      action: isPreApp ? "Pre-app comeback created" : "Comeback created",
      entityType: "comeback_rework",
      entityId: data?.id,
      summary: `${payload.vehicle || "Job"} comeback tied to ${originalTech?.name || "original installer"}`,
      metadata: payload,
    });

    setDraft({
      original_job_id: completedJobs[0]?.id || PRE_APP,
      pre_app_ticket_ref: "",
      pre_app_customer: "",
      pre_app_vehicle: "",
      pre_app_product_summary: "",
      pre_app_completed_at: "",
      pre_app_original_technician_id: ctx.technicians[0]?.id || "",
      reason: "",
      rework_technician_id: ctx.technicians[0]?.id || "",
      rework_hours: "",
      status: "open",
      notes: "",
    });
    await reload();
  }

  async function updateComeback(row, updates) {
    const payload = { ...updates, updated_at: new Date().toISOString() };
    if (updates.status === "resolved") payload.resolved_at = new Date().toISOString();

    const { error } = await supabase.from("comeback_rework").update(payload).eq("id", row.id);
    if (error) return alert(error.message);

    await logAuditEvent(ctx, access, {
      action: updates.status === "resolved" ? "Comeback resolved" : "Comeback updated",
      entityType: "comeback_rework",
      entityId: row.id,
      summary: `${row.vehicle || "Job"} comeback ${updates.status === "resolved" ? "resolved" : "updated"}`,
      metadata: { before: row, updates },
    });

    await reload();
  }

  async function removeComeback(row) {
    if (!confirm("Delete this comeback / rework record?")) return;
    const { error } = await supabase.from("comeback_rework").delete().eq("id", row.id);
    if (error) return alert(error.message);
    await logAuditEvent(ctx, access, {
      action: "Comeback deleted",
      entityType: "comeback_rework",
      entityId: row.id,
      summary: `${row.vehicle || "Job"} comeback deleted`,
      metadata: row,
    });
    await reload();
  }

  return (
    <div className="comebackTabContent">
      <form className="comebackForm" onSubmit={createComeback}>
        <label className="fullWidth">
          Original completed job
          <select value={draft.original_job_id} onChange={(e) => setDraft({ ...draft, original_job_id: e.target.value })}>
            <option value={PRE_APP}>Pre-App Ticket / older install</option>
            {completedJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.customer} • {job.vehicle} • {ctx.jobProductsSummary(job)} • {ctx.tech(job.technician_id)?.name || "No tech"}
              </option>
            ))}
          </select>
        </label>

        {isPreApp && (
          <>
            <label>
              Pre-app ticket / invoice #
              <input value={draft.pre_app_ticket_ref} onChange={(e) => setDraft({ ...draft, pre_app_ticket_ref: e.target.value })} placeholder="Optional" />
            </label>
            <label>
              Original completed date
              <input type="date" value={draft.pre_app_completed_at} onChange={(e) => setDraft({ ...draft, pre_app_completed_at: e.target.value })} />
            </label>
            <label>
              Customer
              <input value={draft.pre_app_customer} onChange={(e) => setDraft({ ...draft, pre_app_customer: e.target.value })} placeholder="Customer name" />
            </label>
            <label>
              Vehicle
              <input value={draft.pre_app_vehicle} onChange={(e) => setDraft({ ...draft, pre_app_vehicle: e.target.value })} placeholder="Vehicle" />
            </label>
            <label className="fullWidth">
              Original job / product
              <input value={draft.pre_app_product_summary} onChange={(e) => setDraft({ ...draft, pre_app_product_summary: e.target.value })} placeholder="Lift kit, gooseneck, wiring, cover install..." />
            </label>
          </>
        )}

        <label>
          Original installer
          {isPreApp ? (
            <select value={draft.pre_app_original_technician_id} onChange={(e) => setDraft({ ...draft, pre_app_original_technician_id: e.target.value })}>
              <option value="">Unknown / not assigned</option>
              {ctx.technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
            </select>
          ) : (
            <input value={originalTech?.name || "—"} readOnly />
          )}
        </label>
        <label>
          Fixed by
          <select value={draft.rework_technician_id} onChange={(e) => setDraft({ ...draft, rework_technician_id: e.target.value })}>
            <option value="">Not assigned</option>
            {ctx.technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
          </select>
        </label>
        <label>
          Rework hours
          <input type="number" step="0.1" value={draft.rework_hours} onChange={(e) => setDraft({ ...draft, rework_hours: e.target.value })} />
        </label>
        <label className="fullWidth">
          Reason
          <input value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder="Loose hardware, adjustment, alignment issue, wiring correction..." />
        </label>
        <label className="fullWidth">
          Notes
          <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
        <button className="primary wide">Add Comeback / Rework</button>
      </form>

      <div className="auditList comebackList">
        {rows.map((row) => {
          const original = ctx.tech(row.original_technician_id)?.name || "Unknown";
          const fixedBy = ctx.tech(row.rework_technician_id)?.name || "Unassigned";
          return (
            <div className="auditItem" key={row.id}>
              <div>
                <b>{row.vehicle || "Vehicle"} • {row.product_summary || "Job"}</b>
                <span>
                  {row.customer || "Customer"} • caused by {original} • fixed by {fixedBy}
                  {row.is_pre_app_ticket ? " • Pre-App Ticket" : ""}
                  {row.pre_app_ticket_ref ? ` #${row.pre_app_ticket_ref}` : ""}
                </span>
                <small>{row.reason} {row.rework_hours ? `• ${Number(row.rework_hours).toFixed(1)} rework hrs` : ""}</small>
              </div>
              <div className="rowActions">
                <span className={`statusMini ${row.status === "resolved" ? "done" : "open"}`}>{row.status || "open"}</span>
                {row.status !== "resolved" && <button onClick={() => updateComeback(row, { status: "resolved" })}>Resolve</button>}
                <button onClick={() => removeComeback(row)}>Delete</button>
              </div>
            </div>
          );
        })}
        {!rows.length && <p className="muted">No comeback or rework records yet.</p>}
      </div>
    </div>
  );
}

function AuditLogPanel({ ctx }) {
  const rows = [...(ctx.auditLogs || [])].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 250);
  return (
    <Panel title="Audit Log" chip={`${rows.length}`}>
      <div className="auditList">
        {rows.map((row) => (
          <div className="auditItem" key={row.id}>
            <div>
              <b>{row.action || "Action"}</b>
              <span>{row.summary || `${row.entity_type || "Record"} ${row.entity_id || ""}`}</span>
              <small>{formatDateTime(row.created_at)} • {row.actor_name || "Unknown"} • {String(row.actor_role || "").replace("_", " ")}</small>
            </div>
            <span className="auditType">{row.entity_type || "system"}</span>
          </div>
        ))}
        {!rows.length && <p className="muted">No audit activity yet.</p>}
      </div>
    </Panel>
  );
}


function AccessLogPanel({ ctx }) {
  const rows = [...(ctx.accessLogs || [])].sort((a, b) => String(b.accessed_at || b.created_at || "").localeCompare(String(a.accessed_at || a.created_at || ""))).slice(0, 250);
  return (
    <Panel title="Login / Access Log" chip={`${rows.length}`}>
      <div className="auditList">
        {rows.map((row) => (
          <div className="auditItem" key={row.id}>
            <div>
              <b>{row.full_name || row.email || "Unknown User"}</b>
              <span>{row.email || "No email"}</span>
              <small>{formatDateTime(row.accessed_at || row.created_at)} • {String(row.role || "").replace("_", " ") || "unknown role"}</small>
            </div>
            <span className="auditType">login</span>
          </div>
        ))}
        {!rows.length && <p className="muted">No login/access records yet.</p>}
      </div>
    </Panel>
  );
}

function Admin({ ctx, reload, access }) {
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

      <div className="adminOpsGrid">
        <AuditLogPanel ctx={ctx} />
        <AccessLogPanel ctx={ctx} />
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


function OutlookCalendar({ jobs, ctx, reload, selectedDate, setSelectedDate, access }) {
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

    await logAuditEvent(ctx, access, {
      action: "Job created",
      entityType: "job",
      entityId: data.id,
      summary: `${payload.vehicle || "Job"} imported from Outlook for ${payload.customer || "customer"}`,
      metadata: payload,
    });

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

function EditJobModal({ job, ctx, reload, onClose, access }) {
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
    approved_variance_hours: job.approved_variance_hours ?? "",
    approved_variance_reason: job.approved_variance_reason || "",
    exceptional_circumstance: Boolean(job.exceptional_circumstance),
  });

  const totalBookHours = totalProductLineHours(productLines);
  const totalLabor = totalProductLineLabor(productLines);
  const primaryProductId = productLines[0]?.product_id || null;
  const technicianDetailsOnly = isTechnicianOnly(access);

  async function saveTechJobDetails(e) {
    e.preventDefault();

    const payload = {
      qc: draft.qc,
      notes: draft.notes,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) return alert(error.message);

    await logAuditEvent(ctx, access, {
      action: "Job details updated",
      entityType: "job",
      entityId: job.id,
      summary: `${jobDisplayName(job, ctx)} details updated`,
      metadata: { before: { qc: job.qc, notes: job.notes }, after: payload },
    });

    await reload();
    onClose();
  }

  if (technicianDetailsOnly) {
    return (
      <div className="modalBackdrop">
        <form className="modal" onSubmit={saveTechJobDetails}>
          <div className="modalHeader">
            <h3>Job Details</h3>
            <button type="button" onClick={onClose}>×</button>
          </div>

          <div className="formGrid">
            <label>
              Customer
              <input value={draft.customer} readOnly />
            </label>
            <label>
              Vehicle
              <input value={draft.vehicle} readOnly />
            </label>
            <label>
              Product
              <input value={ctx.jobProductsSummary(job)} readOnly />
            </label>
            <label>
              Book Hours
              <input value={Number(job.book_hours || 0).toFixed(2)} readOnly />
            </label>
            <label>
              Status
              <input value={ctx.status(job.status_id)?.name || ""} readOnly />
            </label>
            <label>
              Scheduled Date
              <input value={draft.scheduled_date} readOnly />
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
              Job Details / Notes
              <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
          </div>

          <button className="primary wide">Save Job Details</button>
        </form>
      </div>
    );
  }

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
      approved_variance_hours: draft.approved_variance_hours === "" ? 0 : Number(draft.approved_variance_hours),
      approved_variance_reason: draft.approved_variance_reason || null,
      approved_variance_approved_by: Number(draft.approved_variance_hours || 0) > 0 ? (access?.fullName || access?.email || access?.role || "approved") : null,
      exceptional_circumstance: Boolean(draft.exceptional_circumstance),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) return alert(error.message);

    await logAuditEvent(ctx, access, {
      action: "Job edited",
      entityType: "job",
      entityId: job.id,
      summary: `${payload.vehicle || "Job"} edited`,
      metadata: { before: job, after: payload },
    });
    if (Number(payload.approved_variance_hours || 0) > Number(job.approved_variance_hours || 0)) {
      await createAppNotification(ctx, access, {
        type: "approved_variance",
        title: "Approved Variance Added",
        body: `${jobDisplayName({ ...job, ...payload }, ctx)} received +${Number(payload.approved_variance_hours || 0).toFixed(2)} approved variance hrs.`,
        jobId: job.id,
        technicianId: payload.technician_id,
        audienceRoles: managerAudience(),
        metadata: payload,
      });
    }

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

        <div className="modalBody">
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
            Approved Variance Hours
            <input type="number" step="0.25" value={draft.approved_variance_hours} onChange={(e) => setDraft({ ...draft, approved_variance_hours: e.target.value })} />
          </label>

          <label>
            Variance Reason
            <select value={draft.approved_variance_reason || ""} onChange={(e) => setDraft({ ...draft, approved_variance_reason: e.target.value })}>
              <option value="">None</option>
              <option>Broken / Rusted Hardware</option>
              <option>Previous Repair Damage</option>
              <option>Incorrect Parts</option>
              <option>Manufacturer Defect</option>
              <option>Customer Added Work</option>
              <option>Fabrication Required</option>
              <option>Diagnostic Extension</option>
              <option>Waiting on Parts</option>
              <option>Electrical Damage</option>
              <option>Shop Equipment Failure</option>
              <option>Other</option>
            </select>
          </label>

          <label className="checkLine">
            <input type="checkbox" checked={draft.exceptional_circumstance} onChange={(e) => setDraft({ ...draft, exceptional_circumstance: e.target.checked })} />
            Manager-approved exceptional circumstance
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
        </div>

        <div className="modalFooter">
          <button className="primary wide">Save Job</button>
        </div>
      </form>
    </div>
  );
}

function NewJobModal({ onClose, ctx, reload, selectedDate, access }) {
  const firstProduct = ctx.products[0] || null;
  const technicianWalkInMode = isTechnicianOnly(access);
  const assignedTechnicianId = technicianWalkInMode ? access?.technicianId : null;
  const defaultScheduledStatus = ctx.statuses.find((s) => ["scheduled", "open"].includes((s.name || "").toLowerCase())) || ctx.statuses[0] || null;
  const [productLines, setProductLines] = useState(() => normalizeProductLines(ctx, [makeProductLine(firstProduct)], true));
  const totalBookHours = totalProductLineHours(productLines);
  const totalLabor = totalProductLineLabor(productLines);
  const primaryProductId = productLines[0]?.product_id || null;

  async function submit(e) {
    e.preventDefault();

    const form = new FormData(e.currentTarget);
    const selectedTechnicianId = technicianWalkInMode ? assignedTechnicianId : form.get("technician_id");
    const selectedStatusId = technicianWalkInMode ? defaultScheduledStatus?.id : form.get("status_id");

    if (technicianWalkInMode && !selectedTechnicianId) {
      return alert("Your user profile is not linked to a technician record, so this walk-in job cannot be assigned to you.");
    }

    const job = {
      company_id: ctx.company.id,
      customer: form.get("customer"),
      vehicle: form.get("vehicle"),
      product_id: primaryProductId,
      technician_id: selectedTechnicianId,
      status_id: selectedStatusId,
      delay_reason_id: technicianWalkInMode ? null : (form.get("delay_reason_id") || null),
      start_time: form.get("start_time"),
      book_hours: totalBookHours,
      actual_hours: null,
      qc: form.get("qc"),
      scheduled_date: form.get("scheduled_date") || selectedDate || todayIso(),
      labor_sold: technicianWalkInMode ? null : (totalLabor || null),
    };

    const { data, error } = await supabase.from("jobs").insert(job).select("id").single();
    if (error) return alert(error.message);

    const lineError = await saveJobProductLines(ctx.company.id, data.id, productLines);
    if (lineError) return alert(lineError.message || lineError);

    await logAuditEvent(ctx, access, {
      action: "Job created",
      entityType: "job",
      entityId: data.id,
      summary: `${job.vehicle || "Job"} created for ${job.customer || "customer"}`,
      metadata: job,
    });
    await createAppNotification(ctx, access, {
      type: "job_assigned",
      title: "New Job Assigned",
      body: `${job.vehicle || "Job"} • ${productLines.map((line) => ctx.product(line.product_id)?.name || "Product").join(" + ")} assigned to ${ctx.tech(job.technician_id)?.name || "Unassigned"}.`,
      jobId: data.id,
      technicianId: job.technician_id,
      audienceRoles: ["technician", "foreman"],
      metadata: job,
    });
    await createAppNotification(ctx, access, {
      type: "job_added",
      title: "New Job Added",
      body: `${job.vehicle || "Job"} assigned to ${ctx.tech(job.technician_id)?.name || "Unassigned"}.`,
      jobId: data.id,
      technicianId: job.technician_id,
      audienceRoles: managerAudience(),
      metadata: job,
    });

    await reload();
    onClose();
  }

  return (
    <div className="modalBackdrop">
      <form className="modal" onSubmit={submit}>
        <div className="modalHeader">
          <h3>{technicianWalkInMode ? "Add Walk-In Job" : "New job"}</h3>
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
          <ProductLinesEditor ctx={ctx} lines={productLines} setLines={setProductLines} lockBookTime={technicianWalkInMode} hideLabor={technicianWalkInMode} />
          {technicianWalkInMode ? (
            <>
              <label>
                Assigned Tech
                <input value={ctx.tech(assignedTechnicianId)?.name || "You"} readOnly />
              </label>
              <label>
                Status
                <input value={defaultScheduledStatus?.name || "Scheduled"} readOnly />
              </label>
            </>
          ) : (
            <>
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
            </>
          )}
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
          {technicianWalkInMode && (
            <p className="fullWidth muted">Book time is pulled from the selected product and locks when the job is added. Technicians cannot edit book time.</p>
          )}
        </div>

        <button className="primary wide">{technicianWalkInMode ? "Add Walk-In Job" : "Add job"}</button>
      </form>
    </div>
  );
}

function ProductLinesEditor({ ctx, lines, setLines, lockBookTime = false, hideLabor = false }) {
  const safeLines = normalizeProductLines(ctx, lines, true);
  const totalHours = totalProductLineHours(safeLines);
  const totalLabor = totalProductLineLabor(safeLines);

  function updateLine(index, patch) {
    const sanitizedPatch = lockBookTime
      ? Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "book_hours" && key !== "labor_price"))
      : patch;
    const next = safeLines.map((line, i) => (i === index ? { ...line, ...sanitizedPatch } : line));
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
            <input type="number" step="0.25" value={line.book_hours} readOnly={lockBookTime} onChange={(e) => updateLine(index, { book_hours: e.target.value })} />
          </label>
          {!hideLabor && (
            <label>
              Labor
              <input type="number" step="1" value={line.labor_price} readOnly={lockBookTime} onChange={(e) => updateLine(index, { labor_price: e.target.value })} />
            </label>
          )}
          <button className="productLineRemove" type="button" onClick={() => removeProduct(index)} disabled={safeLines.length <= 1}>Remove</button>
        </div>
      ))}

      <div className="productLinesTotal">
        <span>Total Book Time: <strong>{totalHours.toFixed(2)} hrs</strong></span>
        {!hideLabor && <span>Total Labor: <strong>{money(totalLabor)}</strong></span>}
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
          {job.customer} • {tech?.name} • {formatTime(getEffectiveJobStartTime(job))} • {job.book_hours} book hrs
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

function TechLeaderboard({ jobs, ctx, detailed = false, monthly = false, statsOptions = {} }) {
  const sourceJobs = monthly ? currentMonthCompletedJobs(jobs, ctx) : jobs;
  const rows = ctx.technicians
    .map((tech) => {
      const stats = getTechStats(sourceJobs, ctx, tech.id, { monthly, ...statsOptions });
      return { tech, stats, savedHours: stats.bookHours - stats.actualHours, efficiencyStreak: getEfficiencyStreak(ctx, tech.id), noComebackStreak: getNoComebackStreak(ctx, tech.id) };
    })
    .sort((a, b) => {
      if (b.stats.efficiency !== a.stats.efficiency) return b.stats.efficiency - a.stats.efficiency;
      if (b.stats.completedJobs !== a.stats.completedJobs) return b.stats.completedJobs - a.stats.completedJobs;
      return b.stats.bookHours - a.stats.bookHours;
    });

  const shopStats = getTechStats(sourceJobs, ctx, null, { monthly, ...statsOptions });
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
      {rows.map(({ tech, stats, savedHours, efficiencyStreak, noComebackStreak }, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`;
        return (
          <div className={`leader ${index < 3 ? `leaderTop${index + 1}` : ""}`} key={tech.id}>
            <div>
              <b>
                {medal} {tech.name}
              </b>
              <span>
                🔥 {efficiencyStreak} eff streak • 🛡️ {noComebackStreak} no-comeback • {stats.completedJobs} jobs • helped {stats.helperActualHours.toFixed(1)}h • curve +{stats.helperCurveBonus.toFixed(1)}% • received {stats.helpReceivedActualHours.toFixed(1)}h • {stats.bookHours.toFixed(1)} book / {stats.actualHours.toFixed(1)} actual • {savedHours >= 0 ? "+" : ""}{savedHours.toFixed(1)} hrs saved
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


function getTechnicianCompletedJobs(ctx, technicianId) {
  return (ctx.jobs || [])
    .filter((job) => job.technician_id === technicianId && ctx.isComplete(job.status_id) && Number(job.actual_hours || 0) > 0)
    .sort((a, b) => new Date(b.production_completed_at || b.updated_at || b.created_at || 0) - new Date(a.production_completed_at || a.updated_at || a.created_at || 0));
}

function getEfficiencyStreak(ctx, technicianId) {
  let count = 0;
  for (const job of getTechnicianCompletedJobs(ctx, technicianId)) {
    if (Number(job.approved_variance_hours || 0) > 0 || job.exceptional_circumstance) continue;
    const actual = Number(job.actual_hours || 0);
    const adjustedBook = getAdjustedBookHours(job);
    if (actual > 0 && adjustedBook / actual >= 1) count += 1;
    else break;
  }
  return count;
}

function getNoComebackStreak(ctx, technicianId) {
  const comebackJobIds = new Set((ctx.comebackRework || []).flatMap((row) => [row.original_job_id, row.job_id].filter(Boolean)));
  let count = 0;
  for (const job of getTechnicianCompletedJobs(ctx, technicianId)) {
    if (comebackJobIds.has(job.id)) break;
    count += 1;
  }
  return count;
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

function currentWeekStartDate(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function currentWeekStartIso(date = new Date()) {
  return toIsoDate(currentWeekStartDate(date));
}

function currentWeekCompletedJobs(jobs, ctx) {
  const start = currentWeekStartDate();
  return jobs.filter((job) => {
    if (!ctx.isComplete(job.status_id)) return false;
    const completedAt = job.production_completed_at || job.updated_at || job.created_at;
    if (!completedAt) return false;
    const d = new Date(completedAt);
    if (Number.isNaN(d.getTime())) return false;
    return d >= start;
  });
}

function currentWeekLabel() {
  const start = currentWeekStartDate();
  const end = addDays(start, 6);
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel}–${endLabel}`;
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

async function fetchOptionalComebackRework(companyId) {
  const { data, error } = await supabase
    .from("comeback_rework")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01" || String(error.message || "").toLowerCase().includes("comeback_rework")) return [];
    throw error;
  }

  return data || [];
}

async function fetchOptionalAuditLogs(companyId) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    if (error.code === "42P01" || String(error.message || "").toLowerCase().includes("audit_logs")) return [];
    throw error;
  }

  return data || [];
}


async function fetchOptionalAccessLogs(companyId) {
  const { data, error } = await supabase
    .from("access_logs")
    .select("*")
    .eq("company_id", companyId)
    .order("accessed_at", { ascending: false })
    .limit(250);

  if (error) {
    if (error.code === "42P01" || String(error.message || "").toLowerCase().includes("access_logs")) return [];
    throw error;
  }

  return data || [];
}

async function fetchOptionalDamagePhotos(companyId) {
  const { data, error } = await supabase
    .from("job_damage_photos")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "42P01" || String(error.message || "").toLowerCase().includes("job_damage_photos")) return [];
    throw error;
  }

  return data || [];
}


async function fetchOptionalNotifications(companyId) {
  const { data, error } = await supabase
    .from("app_notifications")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "42P01" || String(error.message || "").toLowerCase().includes("app_notifications")) return [];
    throw error;
  }

  return data || [];
}

async function logAuditEvent(ctx, access, { action, entityType, entityId, summary, metadata = {} }) {
  if (!supabase || !ctx?.company?.id) return;

  const payload = {
    company_id: ctx.company.id,
    actor_name: access?.fullName || access?.email || access?.role || "Unknown",
    actor_role: access?.role || "unknown",
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    summary: summary || "",
    metadata,
  };

  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error && error.code !== "42P01") console.warn("Audit log failed", error.message);
}


async function createAppNotification(ctx, access, { type = "info", title, body, jobId = null, technicianId = null, audienceRoles = [], metadata = {} }) {
  if (!supabase || !ctx?.company?.id) return;
  const payload = {
    company_id: ctx.company.id,
    type,
    title: title || "Notification",
    body: body || "",
    job_id: jobId,
    technician_id: technicianId,
    audience_roles: audienceRoles,
    actor_name: access?.fullName || access?.email || access?.role || null,
    metadata,
    read_by: [],
  };

  const { data, error } = await supabase.from("app_notifications").insert(payload).select().single();
  if (error) {
    if (error.code !== "42P01") console.warn("Notification insert failed", error.message);
    return;
  }

  sendHhWebPush(data || payload);
}

async function sendHhWebPush(notification) {
  if (typeof window === "undefined" || !notification?.company_id) return;
  try {
    await fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification }),
    });
  } catch (error) {
    console.warn("Web Push send request failed", error);
  }
}

function canReceiveNotification(notification, access) {
  const role = normalizeRole(access?.role);
  const audience = (notification.audience_roles || []).map(normalizeRole);
  const roleMatch = !audience.length || audience.includes(role);
  const techMatch = !notification.technician_id || notification.technician_id === access?.technicianId;
  return roleMatch && techMatch;
}


function isPendingRoadblockExtensionRequest(notification) {
  return notification?.type === "roadblock_extension_request" && (notification.metadata || {}).status === "pending";
}

function getPendingRoadblockExtensionRequest(ctx, jobId) {
  if (!jobId) return null;
  return (ctx.notifications || []).find(
    (notification) => notification.job_id === jobId && isPendingRoadblockExtensionRequest(notification)
  ) || null;
}

async function markNotificationRead(ctx, access, notification, reload) {
  if (!supabase || !notification?.id) return;
  const key = getNotificationReadKey(access);
  const readBy = Array.from(new Set([...(notification.read_by || []), key]));
  const { error } = await supabase.from("app_notifications").update({ read_by: readBy }).eq("id", notification.id);
  if (error) return alert(error.message);
  await reload?.();
}

async function clearVisibleNotifications(ctx, access, notifications, reload) {
  if (!supabase || !ctx?.company?.id) return;
  const key = getNotificationReadKey(access);
  const clearable = (notifications || []).filter((notification) => !isPendingRoadblockExtensionRequest(notification));
  if (!clearable.length) return;

  for (const notification of clearable) {
    const readBy = Array.from(new Set([...(notification.read_by || []), key]));
    const { error } = await supabase.from("app_notifications").update({ read_by: readBy }).eq("id", notification.id);
    if (error) return alert(error.message);
  }
  await reload?.();
}

function getNotificationReadKey(access) {
  return access?.email || access?.fullName || access?.role || "user";
}

function getNotificationRead(notification, access) {
  const key = getNotificationReadKey(access);
  return (notification.read_by || []).includes(key);
}

function managerAudience() {
  return ["foreman", "manager", "admin"];
}

function jobDisplayName(job, ctx) {
  return `${job?.vehicle || job?.customer || "Job"}${ctx?.jobProductsSummary ? ` • ${ctx.jobProductsSummary(job)}` : ""}`;
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


function getAdjustedBookHours(job) {
  return Number(job?.book_hours || 0) + Number(job?.approved_variance_hours || 0);
}

function getActiveElapsedHours(job, nowDate = new Date(), fallbackStart = null) {
  const startedAt = getJobStartedAt(job) || fallbackStart || getScheduledStartDate(job) || nowDate;
  const totalSeconds = Math.max(0, Math.round((nowDate - startedAt) / 1000));
  const storedPaused = Number(job?.total_paused_seconds || 0);
  const currentPauseStarted = job?.pause_started_at ? new Date(job.pause_started_at) : null;
  const currentPauseSeconds = currentPauseStarted && !Number.isNaN(currentPauseStarted.getTime())
    ? Math.max(0, Math.round((nowDate - currentPauseStarted) / 1000))
    : 0;
  const activeSeconds = Math.max(60, totalSeconds - storedPaused - currentPauseSeconds);
  return activeSeconds / 3600;
}

function isQualifyingRecordInstall(job, ctx) {
  if (!job || !ctx?.isComplete?.(job.status_id)) return false;
  if (Number(job.actual_hours || 0) <= 0) return false;
  if (Number(job.approved_variance_hours || 0) > 0) return false;
  if (job.exceptional_circumstance) return false;
  const comeback = (ctx.comebackRework || []).some((row) => row.original_job_id === job.id || row.job_id === job.id);
  if (comeback) return false;
  return Boolean(job.product_id);
}

function getPrimaryProductNameForJob(job, ctx) {
  const lines = ctx?.jobProductLines?.(job?.id) || [];
  const productId = lines[0]?.product_id || job?.product_id;
  return ctx?.product?.(productId)?.name || ctx?.jobProductsSummary?.(job) || "Unknown Product";
}

function buildProductRecordData(ctx, productId, technicianId = null) {
  const qualifying = (ctx.jobs || [])
    .filter((job) => job.product_id === productId)
    .filter((job) => !technicianId || job.technician_id === technicianId)
    .filter((job) => isQualifyingRecordInstall(job, ctx))
    .sort((a, b) => Number(a.actual_hours || 999999) - Number(b.actual_hours || 999999));
  return {
    count: qualifying.length,
    fastest: qualifying[0] || null,
    installs: qualifying,
    unlocked: qualifying.length >= 10,
  };
}


async function createStreakNotificationsForCompletion(ctx, access, completedJob, stats) {
  const techId = completedJob?.technician_id;
  if (!techId) return;
  const milestones = new Set([5, 10, 25, 50, 100, 250, 500]);
  const completedLike = { ...completedJob, actual_hours: stats.actualHours };
  const priorJobs = getTechnicianCompletedJobs(ctx, techId);
  const jobsWithCurrent = [completedLike, ...priorJobs];
  let efficiencyStreak = 0;
  for (const job of jobsWithCurrent) {
    if (Number(job.approved_variance_hours || 0) > 0 || job.exceptional_circumstance) continue;
    const actual = Number(job.actual_hours || 0);
    const adjustedBook = getAdjustedBookHours(job);
    if (actual > 0 && adjustedBook / actual >= 1) efficiencyStreak += 1;
    else break;
  }
  if (milestones.has(efficiencyStreak)) {
    await createAppNotification(ctx, access, {
      type: "efficiency_streak",
      title: "Efficiency Streak",
      body: `${efficiencyStreak} consecutive jobs at or above book time.`,
      jobId: completedJob.id,
      technicianId: techId,
      audienceRoles: ["technician", "foreman"],
      metadata: { efficiencyStreak },
    });
  }

  const comebackJobIds = new Set((ctx.comebackRework || []).flatMap((row) => [row.original_job_id, row.job_id].filter(Boolean)));
  let noComebackStreak = 0;
  for (const job of jobsWithCurrent) {
    if (comebackJobIds.has(job.id)) break;
    noComebackStreak += 1;
  }
  if (milestones.has(noComebackStreak)) {
    await createAppNotification(ctx, access, {
      type: "no_comeback_streak",
      title: "No Comeback Streak",
      body: `${noComebackStreak} consecutive completed jobs without a comeback.`,
      jobId: completedJob.id,
      technicianId: techId,
      audienceRoles: ["technician", "foreman"],
      metadata: { noComebackStreak },
    });
  }
}

async function createRecordNotificationsForCompletion(ctx, access, completedJob, stats) {
  const productId = completedJob?.product_id;
  if (!productId || !isQualifyingRecordInstall({ ...completedJob, status_id: ctx.statuses.find((s) => (s.name || '').toLowerCase().includes('complete'))?.id || completedJob.status_id, actual_hours: stats.actualHours }, ctx)) return;
  const productName = getPrimaryProductNameForJob(completedJob, ctx);
  const shopRecord = buildProductRecordData(ctx, productId);
  const techRecord = buildProductRecordData(ctx, productId, completedJob.technician_id);
  const priorShopFastest = shopRecord.fastest;
  const priorTechFastest = techRecord.fastest;
  const completingTime = Number(stats.actualHours || completedJob.actual_hours || 0);

  if (priorTechFastest && priorTechFastest.id !== completedJob.id && completingTime < Number(priorTechFastest.actual_hours || 999999)) {
    await createAppNotification(ctx, access, {
      type: "personal_record",
      title: "New Personal Record",
      body: `Fastest ${productName}: ${completingTime.toFixed(2)} active hrs.`,
      jobId: completedJob.id,
      technicianId: completedJob.technician_id,
      audienceRoles: ["technician", "foreman"],
      metadata: { productId, productName, actualHours: completingTime },
    });
  }

  const productRecordAfterThis = (ctx.jobs || []).filter((job) => job.product_id === productId && isQualifyingRecordInstall(job, ctx)).length + 1;
  if (productRecordAfterThis >= 10 && (!priorShopFastest || completingTime < Number(priorShopFastest.actual_hours || 999999))) {
    await createAppNotification(ctx, access, {
      type: "shop_record",
      title: "Shop Record Set",
      body: `${ctx.tech(completedJob.technician_id)?.name || "Technician"} set the ${productName} record at ${completingTime.toFixed(2)} active hrs.`,
      jobId: completedJob.id,
      technicianId: completedJob.technician_id,
      audienceRoles: managerAudience(),
      metadata: { productId, productName, actualHours: completingTime },
    });
    await createAppNotification(ctx, access, {
      type: "hall_of_fame",
      title: "Hall of Fame Entry",
      body: `You now hold the ${productName} shop record at ${completingTime.toFixed(2)} active hrs.`,
      jobId: completedJob.id,
      technicianId: completedJob.technician_id,
      audienceRoles: ["technician", "foreman"],
      metadata: { productId, productName, actualHours: completingTime },
    });
  }
}

function calculateMetrics(jobs, ctx, selectedDate = todayIso()) {
  const completed = jobs.filter((j) => ctx.isComplete(j.status_id) && Number(j.actual_hours) > 0);
  const openJobs = jobs.filter((j) => !ctx.isComplete(j.status_id));
  const helperStats = getHelperPerformanceStats(ctx, null, { selectedDate });
  const receivedStats = getHelpReceivedStats(ctx, null, { selectedDate });
  const jobBookComplete = completed.reduce((a, j) => a + getAdjustedBookHours(j), 0);
  const jobActualUsed = completed.reduce((a, j) => a + Number(j.actual_hours || 0), 0);
  const bookComplete = jobBookComplete + helperStats.bookHours;
  const actualUsed = jobActualUsed + helperStats.actualHours;
  const helperCurveBonus = getHelperCurveBonusPercent(helperStats.actualHours);
  const baseEfficiency = actualUsed ? (bookComplete / actualUsed) * 100 : 0;
  const availableTechCount = getCapacityTechnicianCount(ctx, selectedDate);
  const remainingBookHours = openJobs.reduce((a, j) => a + getAdjustedBookHours(j), 0);
  const openJobIds = new Set(openJobs.map((j) => j.id));
  const activeHelperBookHours = (ctx.jobHelpers || []).reduce((sum, helper) => {
    if (helper.scheduled_date !== selectedDate || !isActiveHelper(helper)) return sum;
    if (helper.job_id && !openJobIds.has(helper.job_id)) return sum;
    return sum + getCappedHelperBookHours(helper, ctx);
  }, 0);
  const capacityHours = availableTechCount * 8;

  return {
    capacity: capacityHours
      ? Math.min(100, Math.round(((remainingBookHours + activeHelperBookHours) / capacityHours) * 100))
      : 0,
    efficiency: baseEfficiency ? baseEfficiency + helperCurveBonus : 0,
    baseEfficiency,
    helperCurveBonus,
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
    comebackRework: state.comebackRework || [],
    auditLogs: state.auditLogs || [],
    accessLogs: state.accessLogs || [],
    damagePhotos: state.damagePhotos || [],
    notifications: state.notifications || [],
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
    comebackRework: [],
    auditLogs: [],
    accessLogs: [],
    damagePhotos: [],
    notifications: [],
    shopSettings: null,
    jobs: [],
  };
}

function getClockedInTechnicians(ctx, selectedDate = todayIso()) {
  return (ctx.technicians || []).filter((tech) => tech.active && ctx.isTechClockedIn?.(tech.id, selectedDate));
}

function getProductionTechnicians(ctx) {
  return (ctx.technicians || []).filter((tech) => {
    if (!tech.active) return false;
    const role = normalizeRole(tech.role);
    return role === "technician";
  });
}

function getCapacityTechnicianCount(ctx, selectedDate = todayIso()) {
  const clockedInCount = getClockedInTechnicians(ctx, selectedDate).length;
  if (clockedInCount > 0) return clockedInCount;
  return getProductionTechnicians(ctx).length || 1;
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

function timeToSortMinutes(value) {
  const [h, m] = shortTime(value || "23:59").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 1439;
  return h * 60 + m;
}

function getJobStartSortMinutes(job) {
  return timeToSortMinutes(job?.start_time || getEffectiveJobStartTime(job));
}

function sortJobsByEarliestStart(jobs = []) {
  return [...jobs].sort((a, b) => {
    const startDiff = getJobStartSortMinutes(a) - getJobStartSortMinutes(b);
    if (startDiff) return startDiff;
    return String(a.vehicle || a.customer || "").localeCompare(String(b.vehicle || b.customer || ""));
  });
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

function getEffectiveJobStartTime(job) {
  const startedAt = getJobStartedAt(job);
  if (startedAt) return shortTime(startedAt.toTimeString());
  return shortTime(job?.start_time || "08:00");
}

function getEffectiveJobStartLabel(job) {
  const actual = getJobStartedAt(job);
  if (actual) return `${formatTime(actual.toTimeString())} actual`;
  return `${formatTime(job?.start_time || "08:00")} planned`;
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
  // User-facing time display: keep database values in 24-hour time, show AM/PM in the UI.
  const [h, m] = shortTime(value).split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
  const value = String(role || "technician")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["tech", "installer", "production_tech", "production_technician"].includes(value)) return "technician";
  if (["writer", "servicewriter", "service_writer", "service_advisor", "advisor"].includes(value)) return "service_writer";
  if (["admin", "manager", "foreman", "service_writer", "technician"].includes(value)) return value;
  return "technician";
}

function getAllowedViewNames(access) {
  const role = normalizeRole(access?.role);
  const sharedTechViews = ["Dashboard", "Mobile Manager", "Performance", "Hall of Fame", "Notifications"];
  const map = {
    admin: ["Performance", "Mobile Manager", "Notifications", "Hall of Fame", "Dashboard", "Schedule", "Outlook Calendar", "Foreman", "Production Log", "Technicians", "Tech Clock", "Products", "Admin", "Cloud Status"],
    manager: ["Performance", "Mobile Manager", "Notifications", "Hall of Fame", "Dashboard", "Schedule", "Outlook Calendar", "Foreman", "Production Log", "Technicians", "Tech Clock", "Products", "Cloud Status"],
    foreman: ["Performance", "Mobile Manager", "Notifications", "Hall of Fame", "Dashboard", "Schedule", "Foreman", "Production Log", "Technicians"],
    service_writer: ["Notifications", "Dashboard", "Schedule", "Outlook Calendar", "Production Log"],
    technician: sharedTechViews,
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
  if (Notification.permission === "default" && window.localStorage?.getItem("hh_notifications_enabled") === "yes") {
    Notification.requestPermission().catch(() => {});
  }
}

function getNotificationPermissionLabel() {
  if (typeof window === "undefined" || !("Notification" in window)) return "Notifications are not supported in this browser.";
  if (Notification.permission === "granted") {
    const pushEnabled = window.localStorage?.getItem("hh_push_subscription_saved") === "yes";
    return pushEnabled
      ? "Enabled. This device can receive live in-app alerts and Web Push when supported by the device."
      : "Browser permission is enabled. Press Enable Notifications again to register this device for closed-app push.";
  }
  if (Notification.permission === "denied") return "Blocked by the browser. Enable notifications for this site in Chrome/Edge settings.";
  return "Not enabled yet. On iPhone, install from Safari with Add to Home Screen first, then open that app icon and press Enable Notifications.";
}

async function enableHhNotifications(ctx = null, access = null) {
  if (typeof window === "undefined") return;
  window.localStorage?.setItem("hh_notifications_enabled", "yes");
  unlockHhDing();

  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await registerHhPushSubscription(ctx, access);
      notifyUser("Notifications enabled on this device.", {
        title: "H&H Notifications Enabled",
        important: true,
        tag: "hh-notifications-enabled",
      });
    } else if (permission === "denied") {
      alert("Notifications are blocked for this site. Enable them in browser site settings, then press Enable Notifications again.");
    }
  } catch (error) {
    console.warn("Notification permission request failed", error);
  }
}

async function registerHhPushSubscription(ctx, access) {
  if (typeof window === "undefined" || !supabase || !ctx?.company?.id) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    window.localStorage?.removeItem("hh_push_subscription_saved");
    return false;
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    console.warn("VITE_VAPID_PUBLIC_KEY is missing. iOS/closed-app Web Push cannot register without it.");
    window.localStorage?.removeItem("hh_push_subscription_saved");
    alert("Push is not fully configured yet. Add VITE_VAPID_PUBLIC_KEY in Vercel and redeploy.");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const payload = {
      company_id: ctx.company.id,
      endpoint: subscription.endpoint,
      subscription: subscription.toJSON(),
      role: normalizeRole(access?.role),
      technician_id: access?.technicianId || null,
      user_email: access?.email || null,
      user_name: access?.fullName || access?.email || access?.role || null,
      user_agent: navigator.userAgent || null,
      last_seen_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("web_push_subscriptions")
      .upsert(payload, { onConflict: "endpoint" });

    if (error) {
      console.warn("Push subscription save failed", error.message);
      window.localStorage?.removeItem("hh_push_subscription_saved");
      alert("Notification permission is on, but the push subscription table is missing or not updated. Run the web_push_subscriptions SQL migration.");
      return false;
    }

    window.localStorage?.setItem("hh_push_subscription_saved", "yes");
    return true;
  } catch (error) {
    console.warn("Push subscription registration failed", error);
    window.localStorage?.removeItem("hh_push_subscription_saved");
    alert("This device did not register for Web Push. On iPhone, use Safari → Add to Home Screen, then open the Home Screen app and enable notifications there.");
    return false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function notifyRealtimeNotification(notification) {
  const type = notification?.type || "info";
  const isRoadblockRequest = type === "roadblock_extension_request" && (notification.metadata || {}).status === "pending";
  const shouldDing = [
    "roadblock_extension_request",
    "roadblock_extension_approved",
    "roadblock_extension_denied",
    "new_job",
    "job_assigned",
    "status_changed",
    "job_paused",
    "job_resumed",
    "job_completed",
  ].includes(type);
  const title = notification?.title || (isRoadblockRequest ? "Roadblock Extension Requested" : "H&H Production");
  const body = notification?.body || "New notification";
  notifyUser(body, {
    title,
    important: shouldDing,
    tag: `${type}-${notification?.id || Date.now()}`,
    requireInteraction: isRoadblockRequest,
  });
}

function notifyUser(message, options = {}) {
  if (typeof window === "undefined") return;

  if (options.important) playHhDing();

  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    const notification = new Notification(options.title || "H&H Production", {
      body: message,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: options.tag || "hh-production",
      renotify: Boolean(options.important),
      requireInteraction: Boolean(options.requireInteraction || options.important),
    });
    notification.onclick = () => {
      window.focus?.();
      notification.close?.();
    };
  } catch (error) {
    console.warn("Desktop notification failed", error);
  }
}

function getHhNotificationAudioContext() {
  if (typeof window === "undefined") return null;
  try {
    const ref = window.__hhNotificationAudioRef;
    if (ref?.current && ref.current.state !== "closed") return ref.current;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    const ctx = new AudioContextClass();
    if (ref) ref.current = ctx;
    return ctx;
  } catch (_) {
    return null;
  }
}

function unlockHhDing() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getHhNotificationAudioContext();
    if (!ctx) return;
    ctx.resume?.();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.02);
  } catch (_) {}
}

function playHhDing() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getHhNotificationAudioContext();
    if (!ctx) return;
    ctx.resume?.();
    const first = ctx.createOscillator();
    const second = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + 0.01;

    first.type = "sine";
    second.type = "sine";
    first.frequency.setValueAtTime(880, start);
    second.frequency.setValueAtTime(1320, start + 0.08);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.75);

    first.connect(gain);
    second.connect(gain);
    gain.connect(ctx.destination);
    first.start(start);
    first.stop(start + 0.30);
    second.start(start + 0.10);
    second.stop(start + 0.75);
  } catch (error) {
    console.warn("Notification sound failed", error);
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
        <img className="brandLogo" src="/brand/hh-shield.png" alt="H&H" />
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
    const activeStatusNames = ["In Progress", "Paused", "QC"];
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

    const projected = getJobProjectedFinish({ ...job, start_time: shortTime(start.toTimeString()), production_started_at: null }, ctx);
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
            const isHelperOnly = Boolean(currentJob?.helper_assignment);
            const status = !clockedIn
              ? attendanceStatus.label
              : isHelperOnly
                ? "Available"
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
                    : isHelperOnly
                      ? "availabilityAvailable"
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
                <span className={!isHelperOnly && overdue ? "negativeTime" : ""}>{clockedIn && !isHelperOnly ? getTimeRemaining(finish, Boolean(currentJob)) : "—"}</span>
                <span>{clockedIn ? (isHelperOnly ? "Now" : formatAvailableAt(finish, Boolean(currentJob))) : "Not clocked in"}</span>
                <span>{nextProduct}</span>
              </div>
            );
          })}
      </div>
    </Panel>
  );
}
