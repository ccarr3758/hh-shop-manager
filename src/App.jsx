import { useEffect, useRef, useState } from "react";
import LoginPanel from "./components/auth/LoginPanel";
import ProductionManager from "./legacy/ProductionManager";
import UpdateAvailableBanner from "./components/pwa/UpdateAvailableBanner";
import { getCurrentSession, getUserProfile, signOut } from "./services/auth";
import { supabase } from "./supabaseClient";


async function recordAccessLog(profile, session, loggedAccessKeys) {
  if (!supabase || !profile?.company_id || !session?.user?.id) return;

  const minuteKey = new Date().toISOString().slice(0, 16);
  const key = `${session.user.id}-${minuteKey}`;
  if (loggedAccessKeys.current.has(key)) return;
  loggedAccessKeys.current.add(key);

  const payload = {
    company_id: profile.company_id,
    user_id: session.user.id,
    email: session.user.email || profile.email || null,
    full_name: profile.full_name || session.user.user_metadata?.full_name || null,
    role: profile.role || "unknown",
    accessed_at: new Date().toISOString(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  };

  const { error } = await supabase.from("access_logs").insert(payload);
  if (error && error.code !== "42P01") console.warn("Access log failed", error.message);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pwaUpdate, setPwaUpdate] = useState(null);
  const loggedAccessKeys = useRef(new Set());

  async function loadProfile(currentSession) {
    if (!currentSession?.user?.id) {
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setSession(currentSession);

    const { data, error: profileError } = await getUserProfile(currentSession.user.id);

    if (profileError) {
      setProfile(null);
      const transientNetworkError = profileError?.message === "Failed to fetch" || profileError?.name === "TypeError";
      const rlsOrPolicyError = ["42501", "PGRST301"].includes(profileError?.code) || String(profileError?.message || "").toLowerCase().includes("row-level security") || String(profileError?.message || "").toLowerCase().includes("infinite recursion");
      setError(transientNetworkError
        ? "Connection to Supabase was interrupted. Check the network connection, then refresh."
        : rlsOrPolicyError
          ? "Your login works, but Supabase blocked the profile lookup. Run supabase/RUN_THIS_SQL_PROFILE_RLS_FIX.sql, then refresh."
          : `Profile lookup failed: ${profileError?.message || "unknown error"}`);
    } else if (!data) {
      setProfile(null);
      setError("This login works, but no active user profile was found. Add this Auth user ID to user_profiles in Supabase.");
    } else if (data?.active === false) {
      setProfile(null);
      setError("This user profile is inactive.");
    } else {
      setProfile(data);
      await recordAccessLog(data, currentSession, loggedAccessKeys);
    }

    setLoading(false);
  }


  useEffect(() => {
    if (typeof window === "undefined" || !window.__registerHhPwaUpdates) return undefined;
    return window.__registerHhPwaUpdates((update) => setPwaUpdate(update));
  }, []);

  useEffect(() => {
    let alive = true;

    async function init() {
      const { session: currentSession, error: sessionError } = await getCurrentSession();
      if (!alive) return;
      if (sessionError && !currentSession) {
        const transientNetworkError = sessionError?.message === "Failed to fetch" || sessionError?.name === "TypeError";
        setError(transientNetworkError
          ? "Connection to Supabase was interrupted. Check the network connection, then refresh."
          : sessionError.message);
        setLoading(false);
        return;
      }
      await loadProfile(currentSession);
    }

    init();

    const { data: listener } = supabase?.auth?.onAuthStateChange?.((_event, newSession) => {
      loadProfile(newSession).catch((error) => {
        console.warn("Auth state profile load failed", error);
        setError(error?.message || "Connection to Supabase was interrupted. Check the network connection, then refresh.");
        setLoading(false);
      });
    }) || { data: null };

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSignOut() {
    await signOut();
    setSession(null);
    setProfile(null);
  }

  if (loading) {
    return (
      <div className="loading">
        <img className="brandLogo" src="/brand/hh-shield.png" alt="H&H" />
        <h2>Loading account...</h2>
      </div>
    );
  }

  if (!session) return <><UpdateAvailableBanner update={pwaUpdate} onDismiss={() => setPwaUpdate(null)} /><LoginPanel /></>;

  if (error || !profile) {
    return (
      <div className="accessGate">
        <div className="accessPanel">
          <img className="brandLogo" src="/brand/hh-shield.png" alt="H&H" />
          <h1>Account Setup Needed</h1>
          <p className="bad">{error || "No user profile found."}</p>
          <button className="primary wide" onClick={handleSignOut}>Sign Out</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <UpdateAvailableBanner update={pwaUpdate} onDismiss={() => setPwaUpdate(null)} />
      <ProductionManager authProfile={profile} onSignOut={handleSignOut} />
    </>
  );
}
