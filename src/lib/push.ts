import { api } from "@/lib/api-client";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output.buffer;
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushStatus(): Promise<{
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
}> {
  if (!isPushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return { supported: true, permission: Notification.permission, subscribed: !!sub };
}

/** Запрашивает разрешение и подписывает браузер на push, сохраняя подписку на сервере. */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Браузер не поддерживает push-уведомления" };

  // ВАЖНО: запрос разрешения должен идти первым же действием, без await перед
  // ним — иначе Safari/iOS теряет связь с жестом пользователя (тапом по
  // переключателю) и просто ничего не показывает, без ошибки.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Разрешение на уведомления не выдано" };
  }

  const { enabled, publicKey } = await api.getPushVapidPublicKey();
  if (!enabled || !publicKey) {
    return { ok: false, error: "Push пока не настроен на сервере" };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (!json.endpoint || !p256dh || !auth) {
    return { ok: false, error: "Не удалось получить данные подписки" };
  }

  await api.subscribePush({
    endpoint: json.endpoint,
    keys: { p256dh, auth },
  });
  return { ok: true };
}

/**
 * Если браузер уже подписан на push (например, ранее push включали под другим
 * аккаунтом на этом же устройстве) — переассоциирует существующую подписку с
 * текущим авторизованным пользователем. Без этого подписка могла бы навсегда
 * остаться привязанной к чужому аккаунту, и уведомления уходили бы не туда.
 */
export async function resyncPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;

  const json = sub.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (!json.endpoint || !p256dh || !auth) return false;

  await api.subscribePush({ endpoint: json.endpoint, keys: { p256dh, auth } });
  return true;
}

/** Отписывает браузер от push и удаляет подписку на сервере. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api.unsubscribePush(endpoint).catch(() => {
    // локально уже отписались — если сервер недоступен, не критично
  });
}
