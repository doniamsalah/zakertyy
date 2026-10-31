
const CACHE_NAME = "zakerty-v8";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (
    requestUrl.origin === self.location.origin &&
    requestUrl.pathname.startsWith("/api/")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response.ok && requestUrl.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});

const handledNotifications = new Set();

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: "ذاكرتي | Zakerty",
      body: event.data.text()
    };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "ذاكرتي | Zakerty", {
      body: data.body || "فيه ذكريات جميلة مستنياك ❤️",
      tag: `zakerty-reminder-${data.reminderId || 1}`,
      renotify: false,
      data: {
        reminderId: data.reminderId || 1,
        url: data.url || "/"
      },
      actions: [
        { action: "open", title: "يلا نبدأ ❤️" },
        { action: "snooze", title: "لاحقًا" }
      ]
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const reminderId = notification.data?.reminderId || 1;
  const action = event.action === "snooze" ? "snooze" : "open";
  const notificationTag = notification.tag;
  handledNotifications.add(notificationTag);
  notification.close();

  event.waitUntil((async () => {
    if (action === "snooze") {
      await fetch(`/api/reminders/${reminderId}/snooze`, { method: "POST" });
      return;
    }

    await fetch(`/api/reminders/${reminderId}/interaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "opened" })
    });

    const target = new URL(notification.data?.url || "/", self.location.origin);
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});

self.addEventListener("notificationclose", (event) => {
  const notificationTag = event.notification.tag;
  if (handledNotifications.has(notificationTag)) {
    handledNotifications.delete(notificationTag);
    return;
  }

  const reminderId = event.notification.data?.reminderId || 1;
  event.waitUntil(
    fetch(`/api/reminders/${reminderId}/interaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismissed" })
    }).catch((error) => {
      console.warn("Could not record dismissed reminder:", error);
    })
  );
});
