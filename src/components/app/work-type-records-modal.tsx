import { X } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { createPortal } from "react-dom";

import { RecordCard } from "@/components/app/record-card";
import { RecordDetail } from "@/components/app/record-detail";
import { useModalClose } from "@/hooks/use-modal-close";
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
  const { closing, requestClose } = useModalClose(onClose);

  // work_type_id из /work-summary приходит сырым из JSON (реально число,
  // несмотря на тип string | null в сигнатуре), а у item.work_type_id из
  // listRecords он явно приведён к строке (см. apiRecordToWorkRecord в
  // api-client.ts) — сравниваем через String(), иначе "5" !== 5 никогда не
  // совпадёт и все каталожные виды работ останутся без единой записи.
  const matchesPosition = (item: WorkItem) =>
    position.work_type_id != null
      ? item.work_type_id != null &&
        String(item.work_type_id) === String(position.work_type_id)
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
    <motion.div
      data-pull-refresh-ignore
      className="fixed inset-0 z-50 flex bg-black/50 md:items-center md:justify-center md:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <motion.div
        className="h-full w-full overflow-y-auto bg-card p-5 md:max-h-[90vh] md:max-w-3xl md:rounded-3xl lg:max-w-4xl xl:max-w-5xl"
        style={{ overscrollBehaviorY: "contain" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: closing ? 0 : 1, y: closing ? 16 : 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">Записи: {position.name}</h2>
          <button onClick={requestClose} aria-label="Закрыть">
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
      </motion.div>
    </motion.div>,
    document.body,
  );
}
