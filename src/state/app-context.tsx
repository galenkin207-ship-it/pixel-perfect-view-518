import { useMemo, useState, type ReactNode } from "react";
import { AppContext, type AppState } from "./use-app";
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
  const [theme, setTheme] = useState<"light" | "dark">("light");
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

  const value: AppState = {
    role,
    setRole,
    currentUser,
    theme,
    toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
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
    notifications: 3,
  };

  return (
    <AppContext.Provider value={value}>
      <div className={theme === "dark" ? "dark" : undefined}>{children}</div>
    </AppContext.Provider>
  );
}
