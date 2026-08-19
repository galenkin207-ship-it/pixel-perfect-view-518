import type { RecordStatus } from "@/data/mock";

export const statusBar: Record<RecordStatus, string> = {
  done: "bg-status-done",
  in_progress: "bg-status-progress",
  draft: "bg-muted-foreground/40",
};
