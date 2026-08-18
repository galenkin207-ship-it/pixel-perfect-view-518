import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  brigades as mockBrigades,
  employees as mockEmployees,
  objects as mockObjects,
  records as mockRecords,
  requests as mockRequests,
  units as mockUnits,
  users as mockUsers,
  workTypes as mockWorkTypes,
  type AppUser,
  type Role,
  type WorkObject,
  type WorkRecord,
  type WorkRequest,
  type WorkType,
} from "@/data/mock";

type AppState = {
  role: Role;
  setRole: (r: Role) => void;
  currentUser: AppUser;
  theme: "light" | "dark";
  toggleTheme: () => void;
  objects: WorkObject[];
  setObjects: React.Dispatch<React.SetStateAction<WorkObject[]>>;
  records: WorkRecord[];
  addRecord: (r: WorkRecord) => void;
  requests: WorkRequest[];
  setRequests: React.Dispatch<React.SetStateAction<WorkRequest[]>>;
  workTypes: WorkType[];
  setWorkTypes: React.Dispatch<React.SetStateAction<WorkType[]>>;
  employees: string[];
  setEmployees: React.Dispatch<React.SetStateAction<string[]>>;
  units: string[];
  setUnits: React.Dispatch<React.SetStateAction<string[]>>;
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  brigades: { name: string; members: string[] }[];
  notifications: number;
};

const AppContext = createContext<AppState | null>(null);

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

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}