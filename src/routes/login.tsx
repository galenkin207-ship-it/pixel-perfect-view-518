import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useApp } from "@/state/use-app";
import { ApiError } from "@/lib/api-client";

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
        </form>
      </div>
    </main>
  );
}
