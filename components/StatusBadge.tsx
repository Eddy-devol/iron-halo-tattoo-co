type StatusTone = "light" | "dark";

const positiveStatuses = new Set(["APPROVED", "BOOKED", "COMPLETED", "ACTIVE", "PAID", "PUBLISHED"]);
const attentionStatuses = new Set(["PENDING", "REVIEWING", "NEEDS_INFORMATION", "PARTIALLY_PAID", "NOT_COMPLETED"]);
const negativeStatuses = new Set(["DECLINED", "CANCELLED", "OVERDUE"]);

export default function StatusBadge({ status, tone = "light" }: { status: string; tone?: StatusTone }) {
  const normalized = status.toUpperCase();
  const variant = positiveStatuses.has(normalized)
    ? "positive"
    : attentionStatuses.has(normalized)
      ? "attention"
      : negativeStatuses.has(normalized)
        ? "negative"
        : "neutral";
  const label = normalized.toLowerCase().replaceAll("_", " ");

  return <span className={`status-badge status-badge-${tone} status-badge-${variant}`}>{label}</span>;
}
