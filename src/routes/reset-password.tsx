import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  // Намеренно НЕконтролируемые поля (через ref, а не useState+value+onChange).
  // Когда браузер сам предлагает сгенерированный пароль ("Suggest Strong
  // Password" в Chrome/Safari) и подставляет его, это не всегда доходит до
  // React как событие onChange — из-за этого поле визуально пустело или не
  // совпадало с тем, что реально уйдёт на сервер. Читаем значения напрямую
  // из DOM в момент отправки — так подставленный браузером пароль всегда
  // подхватывается, откуда бы он ни взялся.
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // type тоже переключаем НАПРЯМУЮ через ref, а не через JSX-выражение вида
  // type={showPassword ? "text" : "password"}. Если type — вычисляемый
  // React-пропс, он переприменяется при ЛЮБОМ ре-рендере компонента (даже
  // не связанном с этой кнопкой — например, из-за фоновой проверки сессии
  // где-то в дереве выше). Судя по всему, Chrome в качестве защиты сбрасывает
  // именно свой сгенерированный пароль, если страница программно трогает
  // атрибут type у поля в момент/после подтверждения — сторонние менеджеры
  // паролей под эту защиту не попадают, потому и работают нормально.
  const toggleVisibility = (ref: React.RefObject<HTMLInputElement | null>, setShow: (fn: (v: boolean) => boolean) => void) => {
    if (ref.current) {
      ref.current.type = ref.current.type === "password" ? "text" : "password";
    }
    setShow((v) => !v);
  };

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-shell px-5 py-10">
        <div className="w-full max-w-sm rounded-2xl bg-card p-5 text-center">
          <p className="text-sm text-foreground">
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
    const password = passwordRef.current?.value ?? "";
    const confirm = confirmRef.current?.value ?? "";
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
            <p className="text-sm text-foreground">
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
              <div className="relative mt-1">
                <button
                  type="button"
                  onClick={() => toggleVisibility(passwordRef, setShowPassword)}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <input
                  ref={passwordRef}
                  id="new-password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-border bg-surface py-2.5 pr-3 pl-9 text-sm"
                  placeholder="Минимум 6 символов"
                />
              </div>
            </label>
            <label className="mt-3 block">
              <span className="label-caps">Повторите пароль</span>
              <div className="relative mt-1">
                <button
                  type="button"
                  onClick={() => toggleVisibility(confirmRef, setShowConfirm)}
                  aria-label={showConfirm ? "Скрыть пароль" : "Показать пароль"}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <input
                  ref={confirmRef}
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-border bg-surface py-2.5 pr-3 pl-9 text-sm"
                  placeholder="Ещё раз"
                />
              </div>
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
