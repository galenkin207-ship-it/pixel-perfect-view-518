import { createFileRoute } from "@tanstack/react-router";
import { HardHat, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { PageHeading, FieldLabel } from "@/components/app/bits";
import { EmployeeSelect } from "@/components/app/employee-select";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/use-app";

export const Route = createFileRoute("/brigades")({
  head: () => ({
    meta: [
      { title: "Мои бригады — Учёт работ" },
      {
        name: "description",
        content: "Личные наборы сотрудников для быстрого заполнения состава записи.",
      },
    ],
  }),
  component: BrigadesPage,
});

const input =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary";
const primaryBtn =
  "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60";
const ghostBtn =
  "rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted";

function BrigadesPage() {
  const { brigades, employees, addBrigade, updateBrigade, deleteBrigade } = useApp();

  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editMembers, setEditMembers] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (id: string, currentName: string, currentMembers: string[]) => {
    setEditId(id);
    setEditName(currentName);
    setEditMembers(currentMembers);
  };

  const cancelEdit = () => {
    setEditId("");
    setEditName("");
    setEditMembers([]);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Укажите название бригады");
      return;
    }
    if (!members.length) {
      toast.error("Добавьте хотя бы одного сотрудника");
      return;
    }
    setSaving(true);
    try {
      await addBrigade({ name: name.trim(), members });
      setName("");
      setMembers([]);
      toast.success("Бригада добавлена");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось добавить бригаду");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      toast.error("Укажите название бригады");
      return;
    }
    if (!editMembers.length) {
      toast.error("Добавьте хотя бы одного сотрудника");
      return;
    }
    setSavingEdit(true);
    try {
      await updateBrigade(editId, { name: editName.trim(), members: editMembers });
      toast.success("Бригада сохранена");
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить бригаду");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBrigade(id);
      if (editId === id) cancelEdit();
      toast.success("Бригада удалена");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить бригаду");
    }
  };

  return (
    <AppShell>
      <PageHeading context="Личный справочник" title="Мои бригады" />
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Бригада — это просто сохранённый набор сотрудников для быстрого заполнения состава записи.
        Видна только вам; в самих записях сотрудники всегда указываются обычным списком по фамилиям.
      </p>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Добавить бригаду</h2>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="label-caps">Название</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Бригада 1"
              className={cn(input, "mt-1")}
            />
          </label>
          <div>
            <FieldLabel>Состав</FieldLabel>
            <div className="mt-1">
              <EmployeeSelect all={employees} value={members} onChange={setMembers} />
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate()}
            className={primaryBtn}
          >
            {saving ? "Сохранение..." : "Добавить бригаду"}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Все бригады</h2>
        {!brigades.length && (
          <p className="mt-2 text-sm text-muted-foreground">Пока не добавлено ни одной бригады.</p>
        )}
        <ul className="mt-3 divide-y divide-border rounded-xl bg-surface">
          {brigades.map((b) => (
            <li key={b.id} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <HardHat className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{b.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.members.join(", ")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className={ghostBtn}
                    onClick={() =>
                      editId === b.id ? cancelEdit() : startEdit(b.id, b.name, b.members)
                    }
                  >
                    {editId === b.id ? (
                      <span className="flex items-center gap-1">
                        <X className="size-3.5" />
                        Отмена
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Pencil className="size-3.5" />
                        Изменить
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={cn(ghostBtn, "text-status-rejected")}
                    onClick={() => void handleDelete(b.id)}
                  >
                    <span className="flex items-center gap-1">
                      <Trash2 className="size-3.5" />
                      Удалить
                    </span>
                  </button>
                </div>
              </div>

              {editId === b.id && (
                <div className="mt-3 space-y-3 rounded-xl bg-card p-3">
                  <label className="block">
                    <span className="label-caps">Название</span>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={cn(input, "mt-1")}
                    />
                  </label>
                  <div>
                    <FieldLabel>Состав</FieldLabel>
                    <div className="mt-1">
                      <EmployeeSelect
                        all={employees}
                        value={editMembers}
                        onChange={setEditMembers}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => void handleSaveEdit()}
                    className={primaryBtn}
                  >
                    {savingEdit ? "Сохранение..." : "Сохранить"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
