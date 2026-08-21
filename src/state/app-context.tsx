import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppContext, type AppState, type NotificationSettings, type ThemeMode } from "./use-app";
import {
  brigades as mockBrigades,
  type AppUser,
  type Role,
  type WorkObject,
  type WorkRecord,
  type WorkType,
} from "@/data/mock";
import { api, ApiError } from "@/lib/api-client";

const EMPTY_USER: AppUser = { id: "", login: "", password: "", full_name: "", role: "user" };

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [notifications, setNotifications] = useState<NotificationSettings>({
    telegramEnabled: true,
    telegramUsername: "@konstantin_g",
    telegramNewRecords: true,
    telegramRequests: true,
    telegramDailyDigest: false,
    inAppEnabled: true,
    inAppNewRecords: true,
    inAppRequests: true,
    inAppMessages: true,
    inAppSound: false,
  });

  const [authChecked, setAuthChecked] = useState(false);
  const [sessionUser, setSessionUser] = useState<AppUser | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [objects, setObjects] = useState<AppState["objects"]>([]);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [requests, setRequests] = useState<AppState["requests"]>([]);
  const [workTypes, setWorkTypes] = useState<AppState["workTypes"]>([]);
  const [employees, setEmployees] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);

  // Проверяем сессию один раз при загрузке приложения.
  useEffect(() => {
    api
      .me()
      .then((me) =>
        setSessionUser({
          id: String(me.id),
          login: me.login,
          password: "",
          full_name: me.full_name,
          role: me.role,
        }),
      )
      .catch(() => setSessionUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  // Как только знаем, что пользователь авторизован — подгружаем справочники и записи.
  useEffect(() => {
    if (!authChecked || !sessionUser) return;
    let cancelled = false;
    Promise.all([
      api.listObjects(),
      api.listEmployees(),
      api.listUnits(),
      api.listWorkTypes(),
      api.listRecords(),
      api.listRequests(),
      sessionUser.role === "admin" ? api.listUsers() : Promise.resolve([]),
    ])
      .then(([objs, emps, uns, types, recs, reqs, usrs]) => {
        if (cancelled) return;
        setObjects(objs);
        setEmployees(emps);
        setUnits(uns);
        setWorkTypes(types);
        setRecords(recs);
        setRequests(reqs);
        if (usrs.length) setUsers(usrs);
        setDataLoaded(true);
      })
      .catch(() => {
        if (!cancelled) toast.error("Не удалось загрузить данные приложения");
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked, sessionUser]);

  // Редирект неавторизованных на /login (кроме самой страницы логина).
  useEffect(() => {
    if (!authChecked) return;
    if (!sessionUser && pathname !== "/login") {
      void navigate({ to: "/login" });
    }
    if (sessionUser && pathname === "/login") {
      void navigate({ to: "/" });
    }
  }, [authChecked, sessionUser, pathname, navigate]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const theme = themeMode === "system" ? systemTheme : themeMode;
  const currentUser = sessionUser ?? EMPTY_USER;
  const role = currentUser.role;

  const objectNameById = useMemo(() => new Map(objects.map((o) => [o.id, o.name])), [objects]);

  const login = async (loginValue: string, password: string) => {
    const me = await api.login(loginValue, password);
    setSessionUser({
      id: String(me.id),
      login: me.login,
      password: "",
      full_name: me.full_name,
      role: me.role,
    });
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      // Даже если запрос к серверу не удался (сеть, таймаут и т.п.), всё равно
      // выходим локально — иначе кнопка "Выйти" выглядит как нерабочая.
      console.error("logout request failed", err);
    } finally {
      setSessionUser(null);
      setDataLoaded(false);
    }
  };

  const addRecord = async (r: WorkRecord): Promise<WorkRecord> => {
    const objectName = objectNameById.get(r.object_id) ?? r.object_id;
    try {
      const saved = await api.createRecord(r, objectName);
      setRecords((prev) => [saved, ...prev]);
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create record");
    }
  };

  const updateRecord = async (r: WorkRecord): Promise<WorkRecord> => {
    const objectName = objectNameById.get(r.object_id) ?? r.object_id;
    try {
      const saved = await api.updateRecord(r, objectName);
      setRecords((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to update record");
    }
  };

  const deleteRecord = async (id: string): Promise<void> => {
    try {
      await api.deleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete record");
    }
  };

  const addUser = async (input: {
    login: string;
    password: string;
    full_name: string;
    role: Role;
  }): Promise<AppUser> => {
    try {
      const created = await api.createUser(input);
      setUsers((prev) => [...prev, created]);
      return created;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create user");
    }
  };

  const updateUser = async (
    id: string,
    input: { full_name?: string; role?: Role; active?: boolean; password?: string },
  ): Promise<AppUser> => {
    try {
      const saved = await api.updateUser(id, input);
      setUsers((prev) => prev.map((u) => (u.id === saved.id ? { ...u, ...saved } : u)));
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to update user");
    }
  };

  const addObject = async (input: {
    name: string;
    address: string;
    progress_percent: number;
  }): Promise<WorkObject> => {
    try {
      const created = await api.createObject(input);
      setObjects((prev) => [...prev, created]);
      return created;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create object");
    }
  };

  const updateObject = async (
    id: string,
    input: { name: string; address: string; progress_percent: number },
  ): Promise<WorkObject> => {
    try {
      const saved = await api.updateObject(id, input);
      setObjects((prev) => prev.map((o) => (o.id === saved.id ? { ...o, ...saved } : o)));
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to update object");
    }
  };

  const deleteObject = async (id: string): Promise<void> => {
    try {
      await api.deleteObject(id);
      setObjects((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete object");
    }
  };

  const addWorkType = async (input: {
    name: string;
    unit: string;
    price: number;
  }): Promise<WorkType> => {
    try {
      const created = await api.createWorkType(input);
      setWorkTypes((prev) => [...prev, created]);
      return created;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create work type");
    }
  };

  const updateWorkType = async (
    id: string,
    input: { name: string; unit: string; price: number },
  ): Promise<WorkType> => {
    try {
      const saved = await api.updateWorkType(id, input);
      setWorkTypes((prev) => prev.map((w) => (w.id === saved.id ? { ...w, ...saved } : w)));
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to update work type");
    }
  };

  const deleteWorkType = async (id: string): Promise<void> => {
    try {
      await api.deleteWorkType(id);
      setWorkTypes((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete work type");
    }
  };

  // Сотрудники/единицы измерения везде в приложении используются как простые
  // списки имён (WorkRecord.employees и т.п. ссылаются на сотрудника по имени,
  // не по id), поэтому глобальный список остаётся string[] — после любой
  // мутации просто перечитываем его с backend, чтобы не рассинхронизироваться.
  const addEmployee = async (name: string): Promise<void> => {
    try {
      await api.createEmployee(name);
      setEmployees(await api.listEmployees());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create employee");
    }
  };

  const renameEmployee = async (id: string, name: string): Promise<void> => {
    try {
      await api.renameEmployee(id, name);
      setEmployees(await api.listEmployees());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to rename employee");
    }
  };

  const deleteEmployee = async (id: string): Promise<void> => {
    try {
      await api.deleteEmployee(id);
      setEmployees(await api.listEmployees());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete employee");
    }
  };

  const addUnit = async (name: string): Promise<void> => {
    try {
      await api.createUnit(name);
      setUnits(await api.listUnits());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create unit");
    }
  };

  const renameUnit = async (id: string, name: string): Promise<void> => {
    try {
      await api.renameUnit(id, name);
      setUnits(await api.listUnits());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to rename unit");
    }
  };

  const deleteUnit = async (id: string): Promise<void> => {
    try {
      await api.deleteUnit(id);
      setUnits(await api.listUnits());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete unit");
    }
  };

  const value: AppState = {
    role,
    currentUser,
    theme,
    themeMode,
    setThemeMode,
    toggleTheme: () => setThemeMode(theme === "light" ? "dark" : "light"),
    notifications,
    setNotifications,
    objects,
    setObjects,
    addObject,
    updateObject,
    deleteObject,
    records,
    addRecord,
    updateRecord,
    deleteRecord,
    requests,
    setRequests,
    workTypes,
    setWorkTypes,
    addWorkType,
    updateWorkType,
    deleteWorkType,
    employees,
    setEmployees,
    addEmployee,
    renameEmployee,
    deleteEmployee,
    units,
    setUnits,
    addUnit,
    renameUnit,
    deleteUnit,
    users,
    setUsers,
    addUser,
    updateUser,
    brigades: mockBrigades,
    notificationsCount: 0,
    login,
    logout,
    isAuthenticated: !!sessionUser,
  };

  // Пока не выяснили статус сессии — показываем пустой экран вместо мигания
  // защищённым контентом или преждевременного редиректа.
  if (!authChecked || (sessionUser && !dataLoaded)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-shell">
        <span className="text-sm text-white/50">Загрузка...</span>
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <div className={theme === "dark" ? "dark" : undefined}>{children}</div>
    </AppContext.Provider>
  );
}
