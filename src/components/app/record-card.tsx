import { ImageIcon } from "lucide-react";

import { InitialsAvatar } from "@/components/app/bits";
import { StatusBadge } from "@/components/app/status-badge";
import { itemQty } from "@/lib/record-utils";
import type { WorkRecord } from "@/data/mock";
import { useApp } from "@/state/use-app";

// Карточка одной записи — вёрстка из "Все записи", вынесена сюда, чтобы
// переиспользовать без дублирования (используется и на /reports/all, и в
// модалке "Записи" на странице объекта).
export function RecordCard({ record, onClick }: { record: WorkRecord; onClick: () => void }) {
  const { objects } = useApp();
  const object = objects.find((o) => o.id === record.object_id);
  const performer =
    record.execution_type === "brigade" ? (record.brigade_name ?? "") : record.employees.join(", ");

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={onClick}
        className="grid h-auto w-full auto-rows-min grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-muted/40 lg:grid-cols-[2.5fr_1.2fr_1.2fr_1fr_1fr_1.2fr] lg:items-start lg:gap-3"
      >
        <span className="block">
          <span className="block break-words whitespace-normal">
            {object ? (
              <>
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {object.name}
                </span>{" "}
                {object.address && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {object.address}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm font-normal text-muted-foreground">Объект не выбран</span>
            )}
          </span>
          <span className="mt-1 flex flex-col gap-1">
            {record.items.length > 0 ? (
              record.items.map((item, i) => (
                <span
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 lg:flex-nowrap lg:items-start"
                >
                  <span className="text-base font-semibold break-words text-foreground lg:min-w-0 lg:flex-1">
                    {item.name}
                    {i < record.items.length - 1 ? ";" : ""}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-bold tabular-nums text-primary whitespace-nowrap">
                    {itemQty(item)} {item.unit}
                  </span>
                </span>
              ))
            ) : (
              <span className="text-base font-semibold text-foreground">
                Виды работ не добавлены
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm break-words">
          <InitialsAvatar name={record.created_by} />
          {record.created_by}
        </span>
        <span className="text-sm break-words">{performer}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          <span>
            {record.date.slice(0, 5)}, {record.time}
          </span>
          {record.photos.length > 0 && (
            <span
              className="flex items-center gap-0.5 font-semibold text-primary"
              title={`${record.photos.length} фото`}
            >
              <ImageIcon className="size-4" />
              {record.photos.length}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <StatusBadge status={record.status} />
        </span>
        <span className="text-xs text-muted-foreground break-words">
          {record.updated_by ? (
            <>
              <span className="font-semibold text-foreground">{record.updated_by}</span>
              {record.updated_at ? <> · {record.updated_at}</> : null}
            </>
          ) : (
            "—"
          )}
        </span>
      </button>
    </div>
  );
}
