// Минимальный service worker.
// Единственная задача — сделать приложение "устанавливаемым" (PWA install prompt
// в Chrome/Android требует наличие активного service worker с обработчиком fetch).
// Никакого офлайн-кеширования не делаем: все запросы просто идут в сеть напрямую,
// чтобы не сломать работу с актуальными данными.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// --- Web Push: показ уведомления и переход по клику ---

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Учёт работ", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Учёт работ";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };

  const tasks = [self.registration.showNotification(title, options)];

  // Бейдж на иконке приложения — обновляем прямо здесь, в service worker,
  // потому что это единственное место, которое реально выполняется, даже
  // когда само приложение полностью закрыто (не открыта ни одна вкладка).
  if (typeof data.badgeCount === "number" && "setAppBadge" in self.navigator) {
    tasks.push(
      data.badgeCount > 0
        ? self.navigator.setAppBadge(data.badgeCount).catch(() => {})
        : self.navigator.clearAppBadge().catch(() => {}),
    );
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const target = new URL(url, self.location.origin).href;
      const existing = list.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        if ("navigate" in existing) return existing.navigate(target);
        return;
      }
      return self.clients.openWindow(target);
    }),
  );
});
