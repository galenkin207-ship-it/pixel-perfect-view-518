import { cn } from "@/lib/utils";

export function InitialsAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const palette = [
    "bg-primary/12 text-primary",
    "bg-status-done-soft text-status-done",
    "bg-status-review-soft text-status-review",
    "bg-status-progress-soft text-status-progress",
    "bg-status-rejected-soft text-status-rejected",
  ];
  const idx = Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % palette.length;
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        palette[idx],
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function SegmentedProgress({ percent }: { percent: number }) {
  const total = 8;
  const filled = Math.round((percent / 100) * total);
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            i < filled - 1
              ? "bg-status-done"
              : i === filled - 1
                ? "bg-status-progress"
                : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="label-caps block">{children}</span>;
}

export function PageHeading({ context, title }: { context: string; title: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{context}</p>
      <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
    </div>
  );
}