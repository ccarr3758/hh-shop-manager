import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set(["admin", "manager", "foreman", "service_writer", "technician"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    const secretKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !publishableKey || !secretKey) {
      return json({ error: "Missing Supabase function secrets. Add SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const callerClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, secretKey);

    const { data: userResult, error: userError } = await callerClient.auth.getUser();
    if (userError || !userResult?.user) return json({ error: "Not authenticated." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const companyId = String(body.company_id || "");
    if (!companyId) return json({ error: "company_id is required." }, 400);

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("user_profiles")
      .select("id, company_id, role, active, full_name")
      .eq("id", userResult.user.id)
      .single();

    if (callerProfileError || !callerProfile) return json({ error: "Caller profile not found." }, 403);
    if (callerProfile.company_id !== companyId) return json({ error: "Company mismatch." }, 403);
    if (callerProfile.active === false || callerProfile.role !== "admin") {
      return json({ error: "Only admin users can manage employees." }, 403);
    }

    if (action === "list") return await listEmployees(adminClient, companyId);
    if (action === "create") return await createEmployee(adminClient, companyId, body, callerProfile);
    if (action === "update_profile") return await updateProfile(adminClient, companyId, body, callerProfile);
    if (action === "set_password") return await setPassword(adminClient, companyId, body, callerProfile);

    return json({ error: "Unknown admin action." }, 400);
  } catch (err) {
    return json({ error: err?.message || "Admin API failed." }, 500);
  }
});

async function listEmployees(adminClient: any, companyId: string) {
  const { data: profiles, error } = await adminClient
    .from("user_profiles")
    .select("id, company_id, technician_id, full_name, role, active, created_at, updated_at")
    .eq("company_id", companyId)
    .order("full_name", { ascending: true });

  if (error) return json({ error: error.message }, 400);

  const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) return json({ error: authError.message }, 400);

  const authById = new Map((authData?.users || []).map((user: any) => [user.id, user]));
  const employees = (profiles || []).map((profile: any) => {
    const authUser = authById.get(profile.id);
    return {
      ...profile,
      email: authUser?.email || "",
      last_sign_in_at: authUser?.last_sign_in_at || null,
      confirmed_at: authUser?.confirmed_at || null,
    };
  });

  return json({ employees });
}

async function createEmployee(adminClient: any, companyId: string, body: any, actor: any) {
  const email = cleanEmail(body.email);
  const password = String(body.password || "");
  const role = cleanRole(body.role);
  const fullName = String(body.full_name || "").trim();
  const technicianId = body.technician_id || null;

  if (!email) return json({ error: "Login email is required." }, 400);
  if (!fullName) return json({ error: "Full name is required." }, 400);
  if (!password || password.length < 6) return json({ error: "Temporary password must be at least 6 characters." }, 400);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError) return json({ error: createError.message }, 400);

  const userId = created?.user?.id;
  if (!userId) return json({ error: "Auth user was not created." }, 400);

  const { error: profileError } = await adminClient.from("user_profiles").upsert({
    id: userId,
    company_id: companyId,
    technician_id: technicianId,
    full_name: fullName,
    role,
    active: body.active !== false,
    updated_at: new Date().toISOString(),
  });

  if (profileError) return json({ error: profileError.message }, 400);
  await audit(adminClient, companyId, actor, "employee_created", "user_profiles", userId, `Created employee ${fullName}`);
  return json({ ok: true, user_id: userId });
}

async function updateProfile(adminClient: any, companyId: string, body: any, actor: any) {
  const userId = String(body.user_id || "");
  if (!userId) return json({ error: "user_id is required." }, 400);
  const role = cleanRole(body.role);

  const { data: existing, error: lookupError } = await adminClient
    .from("user_profiles")
    .select("id, company_id, full_name, role, active")
    .eq("id", userId)
    .single();
  if (lookupError || !existing) return json({ error: "Employee profile not found." }, 404);
  if (existing.company_id !== companyId) return json({ error: "Company mismatch." }, 403);

  const fullName = String(body.full_name || "").trim();
  if (!fullName) return json({ error: "Full name is required." }, 400);

  const { error } = await adminClient
    .from("user_profiles")
    .update({
      technician_id: body.technician_id || null,
      full_name: fullName,
      role,
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .eq("company_id", companyId);

  if (error) return json({ error: error.message }, 400);
  await audit(adminClient, companyId, actor, "employee_updated", "user_profiles", userId, `Updated employee ${fullName}`);
  return json({ ok: true });
}

async function setPassword(adminClient: any, companyId: string, body: any, actor: any) {
  const userId = String(body.user_id || "");
  const password = String(body.password || "");
  if (!userId) return json({ error: "user_id is required." }, 400);
  if (!password || password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);

  const { data: existing, error: lookupError } = await adminClient
    .from("user_profiles")
    .select("id, company_id, full_name")
    .eq("id", userId)
    .single();
  if (lookupError || !existing) return json({ error: "Employee profile not found." }, 404);
  if (existing.company_id !== companyId) return json({ error: "Company mismatch." }, 403);

  const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
  if (error) return json({ error: error.message }, 400);
  await audit(adminClient, companyId, actor, "password_changed", "user_profiles", userId, `Changed password for ${existing.full_name || "employee"}`);
  return json({ ok: true });
}

async function audit(adminClient: any, companyId: string, actor: any, action: string, entityType: string, entityId: string, summary: string) {
  await adminClient.from("audit_logs").insert({
    company_id: companyId,
    actor_name: actor?.full_name || "Admin",
    actor_role: actor?.role || "admin",
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    metadata: {},
  });
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
