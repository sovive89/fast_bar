import { STATUS_LABEL, type SessionStatus } from "@/types/fastbar";

const TONE: Record<SessionStatus, string> = {
  pending: "bg-secondary text-secondary-foreground",
  open: "bg-primary/15 text-primary",
  closed: "bg-accent/20 text-accent-foreground",
  paid: "bg-success/15 text-success",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
