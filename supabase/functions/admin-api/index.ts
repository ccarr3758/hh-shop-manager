import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set([
  "admin",
  "manager",
  "foreman",
  "service_writer",
  "technician",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = getPublishableKey(req);
    const secretKey = getSecretKey();

    if (!supabaseUrl) return json({ error: "Missing SUPABASE_URL." }, 500);
    if (!publishableKey) return json({ error: "Missing publishable/anon key." }, 500);
    if (!secretKey) return json({ error: "Missing HH_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS." }, 500);

    const directAuthToken = req.headers.get("x-supabase-auth-token") || "";
    const authHeader = directAuthToken
      ? `Bearer ${directAuthToken}`
      : (req.headers.get("Authorization") || "");
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization bearer token." }, 401);
    }

    // User-scoped client. Database reads/writes go through RLS policies.
    // This avoids the current sb_secret/service-key RLS issue for public tables.
    const userClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });

    // Secret-key client. Only used for Supabase Auth Admin actions.
    const authAdminClient = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` } },
    });

    const { data: userResult, error: userError } = await userClient.auth.getUser();
    if (userError || !userResult?.user) return json({ error: "Not authenticated." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const companyId = String(body.company_id || "");
    if (!companyId) return json({ error: "company_id is required." }, 400);

    const callerProfile = await getCallerAdminProfile(userClient, userResult.user.id, companyId);
    if (callerProfile instanceof Response) return callerProfile;

    switch (action) {
      case "list":
        return await listEmployees(userClient, authAdminClient, companyId);
      case "create_employee":
        return await createEmployee(userClient, authAdminClient, companyId, body);
      case "set_password":
        return await setPassword(userClient, authAdminClient, companyId, body);
      case "update_employee":
        return await updateEmployee(userClient, companyId, body);
      case "deactivate_employee":
        return await setEmployeeActive(userClient, companyId, body, false);
      case "activate_employee":
        return await setEmployeeActive(userClient, companyId, body, true);
      default:
        return json({ error: "Unknown admin action." }, 400);
    }
  } catch (err) {
    return json({ error: err?.message || "Admin API failed." }, 500);
  }
});

async function getCallerAdminProfile(userClient: any, authUserId: string, companyId: string) {
  const { data, error } = await userClient
    .from("user_profiles")
    .select("id, company_id, role, active, full_name")
    .eq("id", authUserId)
    .maybeSingle();

  if (error) {
    return json({
      error: `Admin profile lookup failed: ${error.message}`,
      fix: "Run RUN_THIS_SQL.sql once in Supabase SQL Editor to allow admins to manage user_profiles through RLS.",
    }, 403);
  }

  if (!data) return json({ error: "Admin profile not found." }, 403);
  if (String(data.company_id) !== companyId) return json({ error: "Company mismatch." }, 403);
  if (data.active === false || String(data.role || "").toLowerCase() !== "admin") {
    return json({ error: "Only admins can manage employees." }, 403);
  }

  return data;
}

async function listEmployees(userClient: any, authAdminClient: any, companyId: string) {
  const { data: profiles, error } = await userClient
    .from("user_profiles")
    .select("id, company_id, technician_id, full_name, role, active, created_at, updated_at")
    .eq("company_id", companyId)
    .order("full_name", { ascending: true });

  if (error) return json({ error: error.message, fix: "Run RUN_THIS_SQL.sql once in Supabase SQL Editor." }, 400);

  const { data: authData, error: authError } = await authAdminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) return json({ error: `Auth admin failed: ${authError.message}. Check HH_SERVICE_ROLE_KEY.` }, 400);

  const authById = new Map((authData?.users || []).map((user: any) => [user.id, user]));
  const employees = (profiles || []).map((profile: any) => {
    const authUser: any = authById.get(profile.id);
    return {
      ...profile,
      email: authUser?.email || "",
      last_sign_in_at: authUser?.last_sign_in_at || null,
      confirmed_at: authUser?.confirmed_at || null,
    };
  });

  return json({ employees });
}

async function createEmployee(userClient: any, authAdminClient: any, companyId: string, body: any) {
  const email = cleanEmail(body.email);
  const password = String(body.password || "");
  const fullName = String(body.full_name || "").trim();
  const role = cleanRole(body.role);
  const technicianId = body.technician_id || null;

  if (!email) return json({ error: "Login email is required." }, 400);
  if (!fullName) return json({ error: "Full name is required." }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

  const { data: created, error: createError } = await authAdminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError) return json({ error: `Auth user create failed: ${createError.message}. Check HH_SERVICE_ROLE_KEY.` }, 400);

  const userId = created?.user?.id;
  if (!userId) return json({ error: "Auth user was not created." }, 400);

  const { error: profileError } = await userClient.from("user_profiles").upsert({
    id: userId,
    company_id: companyId,
    technician_id: technicianId,
    full_name: fullName,
    role,
    active: body.active !== false,
    updated_at: new Date().toISOString(),
  });

  if (profileError) return json({ error: profileError.message, fix: "Run RUN_THIS_SQL.sql once in Supabase SQL Editor." }, 400);
  return json({ ok: true, user_id: userId });
}

async function setPassword(userClient: any, authAdminClient: any, companyId: string, body: any) {
  const userId = String(body.user_id || "");
  const password = String(body.password || "");
  if (!userId) return json({ error: "user_id is required." }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

  const ok = await verifyEmployeeCompany(userClient, userId, companyId);
  if (!ok) return json({ error: "Employee not found for this company." }, 404);

  const { error } = await authAdminClient.auth.admin.updateUserById(userId, { password });
  if (error) return json({ error: `Password update failed: ${error.message}. Check HH_SERVICE_ROLE_KEY.` }, 400);
  return json({ ok: true });
}

async function updateEmployee(userClient: any, companyId: string, body: any) {
  const userId = String(body.user_id || "");
  if (!userId) return json({ error: "user_id is required." }, 400);

  const ok = await verifyEmployeeCompany(userClient, userId, companyId);
  if (!ok) return json({ error: "Employee not found for this company." }, 404);

  const { error } = await userClient
    .from("user_profiles")
    .update({
      technician_id: body.technician_id || null,
      full_name: String(body.full_name || "").trim(),
      role: cleanRole(body.role),
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("company_id", companyId);

  if (error) return json({ error: error.message, fix: "Run RUN_THIS_SQL.sql once in Supabase SQL Editor." }, 400);
  return json({ ok: true });
}

async function setEmployeeActive(userClient: any, companyId: string, body: any, active: boolean) {
  const userId = String(body.user_id || "");
  if (!userId) return json({ error: "user_id is required." }, 400);

  const ok = await verifyEmployeeCompany(userClient, userId, companyId);
  if (!ok) return json({ error: "Employee not found for this company." }, 404);

  const { error } = await userClient
    .from("user_profiles")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("company_id", companyId);

  if (error) return json({ error: error.message, fix: "Run RUN_THIS_SQL.sql once in Supabase SQL Editor." }, 400);
  return json({ ok: true });
}

async function verifyEmployeeCompany(userClient: any, userId: string, companyId: string) {
  const { data, error } = await userClient
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  return !error && !!data;
}

function getPublishableKey(req: Request) {
  const headerKey = req.headers.get("apikey");
  if (headerKey) return headerKey.trim();

  const explicit = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (explicit) return explicit.trim();

  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy.trim();

  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const value = parsed?.default || Object.values(parsed || {})[0];
      if (typeof value === "string") return value.trim();
    } catch (_) {}
  }
  return "";
}

function getSecretKey() {
  const explicit = Deno.env.get("HH_SERVICE_ROLE_KEY");
  if (explicit) return explicit.trim();

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const value = parsed?.default || Object.values(parsed || {})[0];
      if (typeof value === "string") return value.trim();
    } catch (_) {}
  }

  const singleSecret = Deno.env.get("SUPABASE_SECRET_KEY");
  if (singleSecret) return singleSecret.trim();

  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy.trim();
  return "";
}

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cleanRole(value: unknown) {
  const role = String(value || "technician").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return allowedRoles.has(role) ? role : "technician";
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
