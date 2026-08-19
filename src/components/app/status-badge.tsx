import { cn } from "@/lib/utils";
import { statusLabels, type RecordStatus } from "@/data/mock";

const map: Record<RecordStatus, string> = {
  done: "bg-status-done-soft text-status-done",
  draft: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: RecordStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase",
        map[status],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  );
}