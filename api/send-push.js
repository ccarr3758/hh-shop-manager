import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:notifications@hhshopmanager.local";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function normalizeRole(role) {
  return String(role || "technician").trim().toLowerCase().replace(/\s+/g, "_");
}

function shouldReceive(subscription, notification) {
  const role = normalizeRole(subscription.role);
  const audience = Array.isArray(notification.audience_roles)
    ? notification.audience_roles.map(normalizeRole)
    : [];

  if (audience.length && !audience.includes(role)) return false;

  if (notification.technician_id) {
    const targetTech = String(notification.technician_id);
    const subTech = subscription.technician_id == null ? null : String(subscription.technician_id);
    const isManagerLevel = ["admin", "manager", "foreman", "service_writer"].includes(role);
    if (audience.includes("technician") && subTech !== targetTech) return false;
    if (!audience.includes("technician") && !isManagerLevel && subTech !== targetTech) return false;
  }

  return true;
}

function pushPayload(notification) {
  const type = notification.type || "info";
  const isRequest = type === "roadblock_extension_request";
  return JSON.stringify({
    title: notification.title || (isRequest ? "Roadblock Request" : "H&H Shop Manager"),
    body: notification.body || "New notification",
    tag: `${type}-${notification.id || Date.now()}`,
    requireInteraction: isRequest,
    url: "/?source=push",
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: "Missing Supabase server env vars" });
  if (!vapidPublicKey || !vapidPrivateKey) return res.status(500).json({ error: "Missing VAPID env vars" });

  const notification = req.body?.notification;
  if (!notification?.company_id) return res.status(400).json({ error: "Missing notification.company_id" });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: subscriptions, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, subscription, role, technician_id")
    .eq("company_id", notification.company_id);

  if (error) return res.status(500).json({ error: error.message });

  const targets = (subscriptions || []).filter((subscription) => shouldReceive(subscription, notification));
  const body = pushPayload(notification);
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(target.subscription, body);
        return { id: target.id, ok: true };
      } catch (error) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("web_push_subscriptions").delete().eq("id", target.id);
        }
        throw error;
      }
    })
  );

  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - sent;
  return res.status(200).json({ ok: true, targets: targets.length, sent, failed });
}
