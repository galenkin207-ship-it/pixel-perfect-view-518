import { X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

import { RecordCard } from "@/components/app/record-card";
import { RecordDetail } from "@/components/app/record-detail";
import { ruToIso } from "@/lib/api-client";
import type { WorkItem } from "@/data/mock";
import { useApp } from "@/state/use-app";

type WorkTypePosition = { work_type_id: string | null; name: string; unit: string };

// Список записей, из которых собрана агрегированная статистика по виду
// работ на объекте (см. "Объём / Дней работали / Сотрудников участвовало"
// в objects.$id.tsx), плюс детальный просмотр одной записи внутри того же
// окна. Бэкенд отдаёт по этой агрегации только суммарные числа, без id
// исходных записей, поэтому список строим на фронте — фильтруем уже
// загруженный в useApp() общий массив records (тот же, что видит "Все
// записи") по объекту, виду работ и применённому диапазону дат.
export function WorkTypeRecordsModal({
  objectId,
  position,
  dateFrom,
  dateTo,
  onClose,
}: {
  objectId: string;
  position: WorkTypePosition;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
}) {
  const { records } = useApp();
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  const matchesPosition = (item: WorkItem) =>
    position.work_type_id
      ? item.work_type_id === position.work_type_id
      : item.name === position.name && item.unit === position.unit;

  const filteredRecords = records.filter(
    (r) =>
      r.object_id === objectId &&
      r.items.some(matchesPosition) &&
      (dateFrom === "" || ruToIso(r.date) >= dateFrom) &&
      (dateTo === "" || ruToIso(r.date) <= dateTo),
  );

  const selectedRecord = filteredRecords.find((r) => r.id === selectedRecordId) ?? null;

  if (selectedRecord) {
    return (
      <RecordDetail record={selectedRecord} onClose={() => setSelectedRecordId(null)} backIcon />
    );
  }

  return createPortal(
    <div
      data-pull-refresh-ignore
      className="fixed inset-0 z-50 flex bg-black/50 md:items-center md:justify-center md:p-6"
    >
      <div
        className="h-full w-full overflow-y-auto bg-card p-5 md:max-h-[90vh] md:max-w-3xl md:rounded-3xl lg:max-w-4xl xl:max-w-5xl"
        style={{ overscrollBehaviorY: "contain" }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">Записи: {position.name}</h2>
          <button onClick={onClose} aria-label="Закрыть">
            <X className="size-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          {filteredRecords.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Записи не найдены</p>
          ) : (
            filteredRecords.map((r) => (
              <RecordCard key={r.id} record={r} onClick={() => setSelectedRecordId(r.id)} />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
