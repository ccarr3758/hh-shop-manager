import { supabase } from "../supabaseClient";

export async function getCurrentSession() {
  if (!supabase) return { session: null, error: new Error("Supabase is not configured") };
  try {
    const { data, error } = await supabase.auth.getSession();
    return { session: data?.session ?? null, error };
  } catch (error) {
    console.warn("Supabase session refresh failed", error);
    const cachedSession = readCachedSupabaseSession();
    return { session: cachedSession, error };
  }
}

function readCachedSupabaseSession() {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const session = Array.isArray(parsed) ? parsed[0] : parsed?.currentSession || parsed;
      if (session?.access_token && session?.user) return session;
    }
  } catch (error) {
    console.warn("Cached Supabase session read failed", error);
  }
  return null;
}

export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getUserProfile(userId) {
  try {
    return await supabase
      .from("user_profiles")
      .select("*, companies(*), technicians(*)")
      .eq("id", userId)
      .single();
  } catch (error) {
    console.warn("User profile fetch failed", error);
    return { data: null, error };
  }
}

export function canAccessView(profile, viewName) {
  const role = profile?.role || "technician";
  const map = {
    admin: ["Performance", "Mobile Manager", "Dashboard", "Schedule", "Outlook Calendar", "Foreman", "Production Log", "Technicians", "Products", "Admin", "Cloud Status"],
    manager: ["Performance", "Mobile Manager", "Dashboard", "Schedule", "Outlook Calendar", "Foreman", "Production Log", "Technicians", "Products", "Cloud Status"],
    foreman: ["Mobile Manager", "Dashboard", "Schedule", "Foreman", "Production Log", "Technicians"],
    service_writer: ["Dashboard", "Schedule", "Outlook Calendar", "Production Log"],
    technician: ["Mobile Manager", "Dashboard"],
  };
  return (map[role] || map.technician).includes(viewName);
}
