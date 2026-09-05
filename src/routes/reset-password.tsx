import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const token = typeof search["token"] === "string" ? search["token"] : undefined;
    return token ? { token } : {};
  },
  head: () => ({
    meta: [{ title: "Новый пароль — Учёт работ" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-shell px-5 py-10">
        <div className="w-full max-w-sm rounded-2xl bg-card p-5 text-center">
          <p className="text-sm text-white/80">
            Ссылка неполная или повреждена — в ней нет кода восстановления.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm text-primary underline">
            Вернуться ко входу
          </Link>
        </div>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Пароль должен быть не короче 6 символов");
      return;
    }
    if (password !== confirm) {
      toast.error("Пароли не совпадают");
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      toast.success("Пароль обновлён, теперь можно войти");
    } catch (err) {
      // Ошибка от бэкенда здесь достаточно конкретная сама по себе (ссылка
      // истекла/уже использована/пароль короткий) — просто показываем её.
      const message =
        err instanceof ApiError ? err.message : "Не удалось обновить пароль, попробуйте ещё раз";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-shell px-5 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight text-white">Новый пароль</h1>
        <p className="mt-1 text-sm text-white/60">
          {done ? "Готово" : "Придумайте новый пароль для входа"}
        </p>

        {done ? (
          <div className="mt-6 rounded-2xl bg-card p-5">
            <p className="text-sm text-white/80">
              Пароль успешно обновлён. Теперь можно войти с новым паролем.
            </p>
            <Link
              to="/login"
              className="mt-4 block w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
            >
              Ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 rounded-2xl bg-card p-5">
            <label className="block">
              <span className="label-caps">Новый пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                placeholder="Минимум 6 символов"
              />
            </label>
            <label className="mt-3 block">
              <span className="label-caps">Повторите пароль</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                placeholder="Ещё раз"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {submitting ? "Сохраняем..." : "Сохранить новый пароль"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
