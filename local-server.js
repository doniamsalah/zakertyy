"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const webpush = require("web-push");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.ZAKERTY_DATA_DIR || path.join(__dirname, ".zakerty-local");
const DATABASE_PATH = path.join(DATA_DIR, "zakerty.sqlite");
const VAPID_PATH = path.join(DATA_DIR, "vapid.json");
const MAX_BODY_BYTES = 64 * 1024;
const RETRY_DELAY_MS = 5 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

let vapidKeys;
if (fs.existsSync(VAPID_PATH)) {
  vapidKeys = JSON.parse(fs.readFileSync(VAPID_PATH, "utf8"));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_PATH, JSON.stringify(vapidKeys, null, 2), {
    flag: "wx",
    mode: 0o600
  });
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:local-test@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const db = new DatabaseSync(DATABASE_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL UNIQUE,
    subscription TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    time TEXT NOT NULL,
    days TEXT NOT NULL,
    timezone TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT 'general',
    adaptive INTEGER NOT NULL DEFAULT 1,
    ignored_count INTEGER NOT NULL DEFAULT 0,
    last_sent_date TEXT,
    last_attempt_at TEXT,
    snooze_until TEXT
  );

  CREATE TABLE IF NOT EXISTS notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const messages = {
  general: "فيه ذكريات جميلة مستنياك ❤️",
  photos: "تعالى نشوف صور العيلة ❤️",
  stories: "فيه حكاية جميلة مستنياك.",
  games: "تعالى نقضي وقت لطيف مع بعض."
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

let sending = false;

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("الطلب أكبر من الحجم المسموح."), {
          status: 413
        }));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("بيانات الطلب غير صالحة."), {
          status: 400
        }));
      }
    });
    request.on("error", reject);
  });
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const weekdays = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: weekdays[values.weekday],
    time: `${values.hour}:${values.minute}`
  };
}

function readReminder() {
  const reminder = db.prepare("SELECT * FROM reminders WHERE id = 1").get();
  if (!reminder) return null;

  return {
    ...reminder,
    enabled: Boolean(reminder.enabled),
    adaptive: Boolean(reminder.adaptive),
    days: JSON.parse(reminder.days)
  };
}

function daysBetween(first, second) {
  const firstDay = Date.parse(`${first}T00:00:00Z`);
  const secondDay = Date.parse(`${second}T00:00:00Z`);
  return Math.floor((secondDay - firstDay) / 86_400_000);
}

async function deliverReminder(reminder, test = false) {
  const devices = db.prepare(
    "SELECT id, endpoint, subscription FROM devices"
  ).all();

  if (!devices.length) {
    return { sent: 0, failed: 0, devices: 0 };
  }

  const payload = JSON.stringify({
    title: "ذاكرتي | Zakerty",
    body: test ? "ده إشعار تجريبي من ذاكرتي ❤️" : messages[reminder.message],
    reminderId: 1,
    url: "/?fromReminder=1"
  });

  let sent = 0;
  let failed = 0;

  for (const device of devices) {
    try {
      await webpush.sendNotification(
        JSON.parse(device.subscription),
        payload,
        { TTL: 60 * 60 }
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Push delivery failed:", error.statusCode || error.message);
      if (error.statusCode === 404 || error.statusCode === 410) {
        db.prepare("DELETE FROM devices WHERE id = ?").run(device.id);
      }
    }
  }

  if (!test && sent > 0) {
    const date = localParts(new Date(), reminder.timezone).date;
    db.prepare(`
      UPDATE reminders
      SET last_sent_date = ?, last_attempt_at = NULL, snooze_until = NULL
      WHERE id = 1
    `).run(date);
  }

  return { sent, failed, devices: devices.length };
}

async function schedulerTick() {
  if (sending) return;
  const reminder = readReminder();
  if (!reminder?.enabled) return;

  const now = new Date();

  if (reminder.snooze_until) {
    if (now < new Date(reminder.snooze_until)) return;
    if (
      reminder.last_attempt_at &&
      now - new Date(reminder.last_attempt_at) < RETRY_DELAY_MS
    ) {
      return;
    }
  } else {
    const local = localParts(now, reminder.timezone);
    if (!reminder.days.includes(local.weekday) || local.time < reminder.time) return;
    if (reminder.last_sent_date === local.date) return;

    const interval = reminder.adaptive
      ? reminder.ignored_count >= 4 ? 3
        : reminder.ignored_count >= 2 ? 2
        : 1
      : 1;
    if (
      reminder.last_sent_date &&
      daysBetween(reminder.last_sent_date, local.date) < interval
    ) {
      return;
    }

    if (
      reminder.last_attempt_at &&
      now - new Date(reminder.last_attempt_at) < RETRY_DELAY_MS
    ) {
      return;
    }
  }

  db.prepare("UPDATE reminders SET last_attempt_at = ? WHERE id = 1")
    .run(now.toISOString());
  sending = true;
  try {
    const result = await deliverReminder(reminder);
    if (!result.sent) {
      console.warn("Reminder was due but no push service accepted delivery.");
    }
  } finally {
    sending = false;
  }
}

function validateSettings(settings) {
  if (
    !settings ||
    typeof settings.enabled !== "boolean" ||
    typeof settings.adaptive !== "boolean" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time || "") ||
    !Array.isArray(settings.days) ||
    settings.days.length === 0 ||
    settings.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    typeof settings.timezone !== "string" ||
    !Object.hasOwn(messages, settings.message)
  ) {
    return "راجعي الوقت والأيام ومحتوى التذكير.";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone }).format();
  } catch {
    return "المنطقة الزمنية غير صحيحة.";
  }

  return null;
}

async function handleApi(request, response, url) {
  if (
    request.method !== "GET" &&
    request.headers.origin &&
    (() => {
      try {
        const origin = new URL(request.headers.origin);
        const forwardedProtocol = request.headers["x-forwarded-proto"]
          ?.split(",")[0]
          .trim();
        const requestProtocol = forwardedProtocol
          ? `${forwardedProtocol}:`
          : request.socket.encrypted
            ? "https:"
            : "http:";
        return origin.protocol !== requestProtocol ||
          origin.host !== request.headers.host;
      } catch {
        return true;
      }
    })()
  ) {
    return sendJson(response, 403, { error: "مصدر الطلب غير مسموح." });
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { status: "ok" });
  }

  if (request.method === "GET" && url.pathname === "/api/config") {
    return sendJson(response, 200, { vapidPublicKey: vapidKeys.publicKey });
  }

  if (request.method === "GET" && url.pathname === "/api/reminders") {
    return sendJson(response, 200, { reminder: readReminder() });
  }

  if (request.method === "POST" && url.pathname === "/api/devices") {
    const body = await readJson(request);
    const subscription = body.subscription;
    if (
      !subscription ||
      typeof subscription.endpoint !== "string" ||
      !subscription.endpoint.startsWith("https://") ||
      typeof subscription.keys?.p256dh !== "string" ||
      typeof subscription.keys?.auth !== "string"
    ) {
      return sendJson(response, 400, { error: "بيانات اشتراك الإشعارات غير صحيحة." });
    }

    db.prepare(`
      INSERT INTO devices (endpoint, subscription)
      VALUES (?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET subscription = excluded.subscription
    `).run(subscription.endpoint, JSON.stringify(subscription));
    return sendJson(response, 200, { success: true });
  }

  if (request.method === "DELETE" && url.pathname === "/api/devices") {
    const body = await readJson(request);
    if (typeof body.endpoint !== "string") {
      return sendJson(response, 400, { error: "بيانات الجهاز غير صحيحة." });
    }
    db.prepare("DELETE FROM devices WHERE endpoint = ?").run(body.endpoint);
    if (!db.prepare("SELECT 1 FROM devices LIMIT 1").get()) {
      db.prepare(`
        UPDATE reminders SET enabled = 0, snooze_until = NULL WHERE id = 1
      `).run();
    }
    return sendJson(response, 200, { success: true });
  }

  if (request.method === "PUT" && url.pathname === "/api/reminders") {
    const settings = await readJson(request);
    const validationError = validateSettings(settings);
    if (validationError) return sendJson(response, 400, { error: validationError });

    db.prepare(`
      INSERT INTO reminders (
        id, enabled, time, days, timezone, message, adaptive,
        ignored_count, last_sent_date, last_attempt_at, snooze_until
      )
      VALUES (1, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL)
      ON CONFLICT(id) DO UPDATE SET
        enabled = excluded.enabled,
        time = excluded.time,
        days = excluded.days,
        timezone = excluded.timezone,
        message = excluded.message,
        adaptive = excluded.adaptive,
        last_attempt_at = NULL,
        snooze_until = NULL
    `).run(
      settings.enabled ? 1 : 0,
      settings.time,
      JSON.stringify([...new Set(settings.days)]),
      settings.timezone,
      settings.message,
      settings.adaptive ? 1 : 0
    );
    return sendJson(response, 200, { success: true });
  }

  if (request.method === "POST" && url.pathname === "/api/reminders/test") {
    const reminder = readReminder();
    if (!reminder) {
      return sendJson(response, 400, { error: "احفظي الإعدادات أولًا." });
    }
    const result = await deliverReminder(reminder, true);
    if (!result.devices) {
      return sendJson(response, 400, { error: "اربطي هذا الجهاز بالإشعارات أولًا." });
    }
    return sendJson(response, result.sent ? 200 : 502, {
      ...result,
      error: result.sent ? undefined : "لم يقبل مزود الإشعارات إرسال التنبيه."
    });
  }

  if (request.method === "POST" && url.pathname === "/api/reminders/stop") {
    db.prepare(`
      UPDATE reminders SET enabled = 0, snooze_until = NULL WHERE id = 1
    `).run();
    return sendJson(response, 200, { success: true });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/reminders/1/snooze"
  ) {
    const snoozeUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const result = db.prepare(`
      UPDATE reminders SET snooze_until = ? WHERE id = 1 AND enabled = 1
    `).run(snoozeUntil);
    if (!result.changes) {
      return sendJson(response, 404, { error: "التذكير غير مفعّل." });
    }
    db.prepare(`
      INSERT INTO notification_logs (reminder_id, action) VALUES (1, 'snoozed')
    `).run();
    return sendJson(response, 200, { success: true, snoozeUntil });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/reminders/1/interaction"
  ) {
    const body = await readJson(request);
    if (!["opened", "dismissed"].includes(body.action)) {
      return sendJson(response, 400, { error: "الإجراء غير صحيح." });
    }
    db.prepare(`
      INSERT INTO notification_logs (reminder_id, action) VALUES (1, ?)
    `).run(body.action);
    if (body.action === "opened") {
      db.prepare("UPDATE reminders SET ignored_count = 0 WHERE id = 1").run();
    } else {
      db.prepare("UPDATE reminders SET ignored_count = ignored_count + 1 WHERE id = 1").run();
    }
    return sendJson(response, 200, { success: true });
  }

  return sendJson(response, 404, { error: "المسار غير موجود." });
}

function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const allowedFiles = new Set([
    "/index.html",
    "/app.js",
    "/styles.css",
    "/sw.js"
  ]);
  if (!allowedFiles.has(requestedPath)) {
    response.writeHead(404);
    return response.end("Not found");
  }

  const filePath = path.join(__dirname, requestedPath.slice(1));
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(500);
      return response.end("Could not read application file.");
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)],
      "Cache-Control": requestedPath === "/sw.js"
        ? "no-cache"
        : "no-store"
    });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "microphone=(self)");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );

  try {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else if (request.method === "GET" || request.method === "HEAD") {
      serveStatic(response, url.pathname);
    } else {
      sendJson(response, 405, { error: "طريقة الطلب غير مدعومة." });
    }
  } catch (error) {
    console.error("Local server request failed:", error);
    if (!response.headersSent) {
      sendJson(response, error.status || 500, {
        error: error.status ? error.message : "حصل خطأ داخلي في الخادم المحلي."
      });
    } else {
      response.destroy();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Zakerty local app: http://${HOST}:${PORT}`);
  console.log("Keep this terminal open while testing scheduled notifications.");
  setInterval(() => {
    schedulerTick().catch((error) => {
      console.error("Reminder scheduler failed:", error);
    });
  }, 15_000);
  schedulerTick().catch((error) => {
    console.error("Initial reminder check failed:", error);
  });
});
