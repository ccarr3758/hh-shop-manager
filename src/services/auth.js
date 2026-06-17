import { supabase } from "../supabaseClient";

export async function getCurrentSession() {
  if (!supabase) return { session: null, error: new Error("Supabase is not configured") };
  const { data, error } = await supabase.auth.getSession();
  return { session: data?.session ?? null, error };
}

export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getUserProfile(userId) {
  return supabase
    .from("user_profiles")
    .select("*, companies(*), technicians(*)")
    .eq("id", userId)
    .single();
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
