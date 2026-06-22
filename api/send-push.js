import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:notifications@hhshopmanager.local";

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

function toPushSubscription(row) {
  if (row?.subscription?.endpoint) return row.subscription;
  if (row?.endpoint && row?.subscription?.keys) {
    return { endpoint: row.endpoint, keys: row.subscription.keys };
  }
  return null;
}

function buildPushPayload(notification) {
  return JSON.stringify({
    title: notification.title || "H&H Production",
    body: notification.body || "New notification",
    tag: notification.id || notification.type || "hh-production-push",
    url: "/",
    requireInteraction: notification.type === "roadblock_extension_request",
    notificationId: notification.id || null,
    type: notification.type || "info",
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: "Missing Supabase server env vars" });
  if (!vapidPublicKey || !vapidPrivateKey) return res.status(500).json({ error: "Missing VAPID env vars" });

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const notification = req.body?.notification;
  if (!notification?.company_id) return res.status(400).json({ error: "Missing notification.company_id" });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: subscriptions, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, endpoint, subscription, role, technician_id")
    .eq("company_id", notification.company_id);

  if (error) return res.status(500).json({ error: error.message });

  const payload = buildPushPayload(notification);
  const targets = (subscriptions || []).filter((subscription) => shouldReceive(subscription, notification));

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const pushSubscription = toPushSubscription(target);
      if (!pushSubscription) throw new Error("Missing stored push subscription");
      try {
        await webPush.sendNotification(pushSubscription, payload, { TTL: 300, urgency: "high" });
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
  const errors = results
    .filter((result) => result.status === "rejected")
    .slice(0, 3)
    .map((result) => result.reason?.message || String(result.reason));

  return res.status(200).json({ ok: true, targets: targets.length, sent, failed, errors });
}
