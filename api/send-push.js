import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

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

function base64UrlToBuffer(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function bufferToBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function derToJose(signature) {
  let offset = 3;
  let rLength = signature[offset - 1];
  let r = signature.slice(offset, offset + rLength);
  offset += rLength + 1;
  let sLength = signature[offset - 1];
  let s = signature.slice(offset, offset + sLength);

  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);
  if (r.length < 32) r = Buffer.concat([Buffer.alloc(32 - r.length), r]);
  if (s.length < 32) s = Buffer.concat([Buffer.alloc(32 - s.length), s]);
  return Buffer.concat([r, s]);
}

function getVapidPrivateKey() {
  const publicBytes = base64UrlToBuffer(vapidPublicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new Error("Invalid VAPID public key");
  const x = bufferToBase64Url(publicBytes.slice(1, 33));
  const y = bufferToBase64Url(publicBytes.slice(33, 65));
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x,
    y,
    d: vapidPrivateKey,
  };
  return crypto.createPrivateKey({ key: jwk, format: "jwk" });
}

function vapidHeaders(endpoint) {
  const audience = new URL(endpoint).origin;
  const header = bufferToBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bufferToBase64Url(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: vapidSubject })));
  const signingInput = `${header}.${payload}`;
  const derSignature = crypto.sign("sha256", Buffer.from(signingInput), getVapidPrivateKey());
  const signature = bufferToBase64Url(derToJose(derSignature));
  const jwt = `${signingInput}.${signature}`;

  return {
    TTL: "60",
    Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
  };
}

async function sendWakePush(subscription) {
  const endpoint = subscription?.endpoint || subscription?.subscription?.endpoint;
  if (!endpoint) throw new Error("Missing push endpoint");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: vapidHeaders(endpoint),
  });
  if (!response.ok) {
    const error = new Error(`Push failed: ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
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
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      try {
        await sendWakePush(target);
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
