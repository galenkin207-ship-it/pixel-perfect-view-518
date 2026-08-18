import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { roleLabels } from "@/data/mock";
import { useApp } from "@/state/app-context";

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
  const { users, setRole } = useApp();
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find((u) => u.login === login.trim() && u.password === password);
    if (!user) {
      toast.error("Неверный логин или пароль");
      return;
    }
    setRole(user.role);
    toast.success(`Здравствуйте, ${user.full_name}`);
    void navigate({ to: user.role === "user" ? "/" : "/reports" });
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
              value={login}
              onChange={(e) => setLogin(e.target.value)}
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
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
              placeholder="••••••"
            />
          </label>
          <button
            type="submit"
            className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Войти
          </button>
        </form>

        <div className="mt-4 rounded-2xl border border-white/10 p-4">
          <p className="label-caps text-white/50">Демо-доступы</p>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {users.map((u) => (
              <li key={u.id} className="flex justify-between gap-3">
                <span>{roleLabels[u.role]}</span>
                <button
                  type="button"
                  onClick={() => {
                    setLogin(u.login);
                    setPassword(u.password);
                  }}
                  className="font-mono text-white"
                >
                  {u.login} / {u.password}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}