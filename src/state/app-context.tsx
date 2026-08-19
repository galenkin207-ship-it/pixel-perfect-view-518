import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AppContext,
  type AppState,
  type NotificationSettings,
  type ThemeMode,
} from "./use-app";
import {
  brigades as mockBrigades,
  employees as mockEmployees,
  objects as mockObjects,
  records as mockRecords,
  requests as mockRequests,
  units as mockUnits,
  users as mockUsers,
  workTypes as mockWorkTypes,
  type Role,
} from "@/data/mock";

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("user");
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
  const [objects, setObjects] = useState(mockObjects);
  const [records, setRecords] = useState(mockRecords);
  const [requests, setRequests] = useState(mockRequests);
  const [workTypes, setWorkTypes] = useState(mockWorkTypes);
  const [employees, setEmployees] = useState(mockEmployees);
  const [units, setUnits] = useState(mockUnits);
  const [users, setUsers] = useState(mockUsers);

  const currentUser = useMemo(
    () => users.find((u) => u.role === role) ?? users[0]!,
    [users, role],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const theme = themeMode === "system" ? systemTheme : themeMode;

  const value: AppState = {
    role,
    setRole,
    currentUser,
    theme,
    themeMode,
    setThemeMode,
    toggleTheme: () => setThemeMode(theme === "light" ? "dark" : "light"),
    notifications,
    setNotifications,
    objects,
    setObjects,
    records,
    addRecord: (r) => setRecords((prev) => [r, ...prev]),
    updateRecord: (r) => setRecords((prev) => prev.map((p) => (p.id === r.id ? r : p))),
    requests,
    setRequests,
    workTypes,
    setWorkTypes,
    employees,
    setEmployees,
    units,
    setUnits,
    users,
    setUsers,
    brigades: mockBrigades,
    notificationsCount: 3,
  };

  return (
    <AppContext.Provider value={value}>
      <div className={theme === "dark" ? "dark" : undefined}>{children}</div>
    </AppContext.Provider>
  );
}
