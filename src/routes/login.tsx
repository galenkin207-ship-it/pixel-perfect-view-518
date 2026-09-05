import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useApp } from "@/state/use-app";
import { api, ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Вход — Учёт работ" },
      {
        name: "description",
        content: "Вход в приложение учёта выполненных работ для прорабов, кураторов и админов.",
      },
      { property: "og:title", content: "Вход — Учёт работ" },
      { property: "og:description", content: "Авторизация по логину и паролю." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useApp();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginValue.trim() || !password) return;
    setSubmitting(true);
    try {
      await login(loginValue.trim(), password);
      // Редирект после успешного входа делает AppProvider (следит за сессией).
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error("Неверный логин или пароль");
      } else {
        toast.error("Не удалось войти, попробуйте ещё раз");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-shell px-5 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight text-white">Учёт работ</h1>
        <p className="mt-1 text-sm text-white/60">Войдите, чтобы продолжить</p>

        <form onSubmit={submit} className="mt-6 rounded-2xl bg-card p-5">
          <label className="block">
            <span className="label-caps">Логин</span>
            <input
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              placeholder="prorab"
            />
          </label>
          <label className="mt-3 block">
            <span className="label-caps">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              placeholder="••••••"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Входим..." : "Войти"}
          </button>
          <button
            type="button"
            onClick={() => setForgotOpen((v) => !v)}
            className="mt-3 w-full text-center text-xs text-white/50 underline-offset-2 hover:underline"
          >
            Забыли пароль?
          </button>
        </form>

        {forgotOpen && <ForgotPasswordCard onClose={() => setForgotOpen(false)} />}
      </div>
    </main>
  );
}

function ForgotPasswordCard({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      // Бэкенд намеренно всегда отвечает одинаково, есть такой email в базе
      // или нет — поэтому и здесь просто показываем общее сообщение, а не
      // "email не найден"/"письмо отправлено" по-разному.
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch {
      // Даже сетевая ошибка/500 — не повод пугать пользователя техническими
      // деталями формы входа; просто предлагаем попробовать ещё раз.
      toast.error("Не удалось отправить запрос, попробуйте ещё раз");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl bg-card p-5">
      {sent ? (
        <>
          <p className="text-sm text-white/80">
            Если такой email зарегистрирован в системе, на него отправлено письмо со ссылкой для
            установки нового пароля. Ссылка действует 1 час.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 text-xs text-white/50 underline-offset-2 hover:underline"
          >
            Закрыть
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <label className="block">
            <span className="label-caps">Email, привязанный к аккаунту</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              placeholder="you@example.com"
            />
          </label>
          <p className="mt-2 text-xs text-white/50">
            Если email не привязан или письмо не пришло — обратитесь к администратору.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={sending}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {sending ? "Отправляем..." : "Отправить ссылку"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-white/70"
            >
              Отмена
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
