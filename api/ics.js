export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  const calendarUrl = String(rawUrl || "").trim();

  if (!calendarUrl) {
    return res.status(400).json({ error: "Missing ICS feed URL." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(calendarUrl);
  } catch (_) {
    return res.status(400).json({ error: "Invalid ICS feed URL." });
  }

  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: "ICS feed URL must start with http or https." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);

  try {
    const upstream = await fetch(calendarUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "Accept": "text/calendar,text/plain,*/*",
        "User-Agent": "HH-Shop-Manager-ICS-Sync/1.0",
      },
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `ICS feed returned HTTP ${upstream.status}.`,
      });
    }

    const text = await upstream.text();

    if (!/BEGIN:VCALENDAR|BEGIN:VEVENT/i.test(text)) {
      return res.status(422).json({
        error: "The feed loaded, but it did not look like a valid ICS calendar.",
      });
    }

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).send(text);
  } catch (err) {
    clearTimeout(timeout);
    const message = err?.name === "AbortError"
      ? "ICS feed timed out while Vercel was fetching it."
      : err?.message || "Unable to load ICS feed.";

    return res.status(504).json({ error: message });
  }
}
