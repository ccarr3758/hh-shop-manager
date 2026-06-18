// deploy trigger v2.7
import { useEffect, useState } from "react";
import LoginPanel from "./components/auth/LoginPanel";
import ProductionManager from "./legacy/ProductionManager";
import { getCurrentSession, getUserProfile, signOut } from "./services/auth";
import { supabase } from "./supabaseClient";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      setError("This login works, but no active user profile was found. Add this user to user_profiles in Supabase.");
    } else if (data?.active === false) {
      setProfile(null);
      setError("This user profile is inactive.");
    } else {
      setProfile(data);
    }

    setLoading(false);
  }

  useEffect(() => {
    let alive = true;

    async function init() {
      const { session: currentSession, error: sessionError } = await getCurrentSession();
      if (!alive) return;
      if (sessionError && !currentSession) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }
      await loadProfile(currentSession);
    }

    init();

    const { data: listener } = supabase?.auth?.onAuthStateChange?.((_event, newSession) => {
      loadProfile(newSession);
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
        <div className="brandLogo">H&H</div>
        <h2>Loading account...</h2>
      </div>
    );
  }

  if (!session) return <LoginPanel />;

  if (error || !profile) {
    return (
      <div className="accessGate">
        <div className="accessPanel">
          <div className="brandLogo">H&H</div>
          <h1>Account Setup Needed</h1>
          <p className="bad">{error || "No user profile found."}</p>
          <button className="primary wide" onClick={handleSignOut}>Sign Out</button>
        </div>
      </div>
    );
  }

  return <ProductionManager authProfile={profile} onSignOut={handleSignOut} />;
}
