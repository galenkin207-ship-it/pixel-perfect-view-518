import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import type { WorkItem } from "@/data/mock";
import { getQuickDraftId, setQuickDraftId } from "@/lib/quick-draft";
import { useApp } from "@/state/use-app";

// Быстрое добавление позиции справочника в запись мастера: дописывает её в
// уже начатый черновик быстрого добавления либо создаёт новый черновик.
export function useQuickAddToRecord() {
  const { records, addRecord, updateRecord, currentUser } = useApp();
  const navigate = useNavigate();

  const goToRecord = (id: string) => navigate({ to: "/records/$id", params: { id } });

  return async function addToRecord(type: { id: string; name: string; unit: string; price: number }) {
    const newItem: WorkItem = {
      name: type.name,
      unit: type.unit,
      qty: 0,
      price: type.price,
      work_type_id: type.id,
    };
    const existingDraftId = getQuickDraftId();
    const existingDraft = existingDraftId
      ? (records.find((r) => r.id === existingDraftId && r.status === "draft") ?? null)
      : null;

    try {
      if (existingDraft) {
        const updated = await updateRecord({
          ...existingDraft,
          items: [...existingDraft.items, newItem],
        });
        toast.success(`«${type.name}» добавлено в незавершённую запись`, {
          action: { label: "Открыть запись", onClick: () => goToRecord(updated.id) },
        });
        return;
      }

      const now = new Date();
      const created = await addRecord({
        id: `r${Date.now()}`,
        object_id: "",
        execution_type: "employee",
        employees: [],
        date: new Intl.DateTimeFormat("ru-RU").format(now),
        time: new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(now),
        items: [newItem],
        total: 0,
        comment: "",
        photos: [],
        status: "draft",
        created_by: currentUser.full_name,
      });
      setQuickDraftId(created.id);
      toast.success(`Создана новая запись, «${type.name}» добавлено`, {
        action: { label: "Открыть запись", onClick: () => goToRecord(created.id) },
      });
    } catch {
      toast.error("Не удалось добавить вид работы в запись");
    }
  };
}
