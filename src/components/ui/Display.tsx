import type { HTMLAttributes, ReactNode } from "react";
import type { PaymentStatus, InvoiceStatus, Payment } from "../../types";
import { formatCurrency } from "../../utils/format";
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />;
}
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
const tones = {
  Completed: "success",
  Partial: "warning",
  Overdue: "danger",
  Unpaid: "neutral",
  Draft: "neutral",
  Sent: "info",
  Paid: "success",
  Pending: "warning",
  Failed: "danger",
} as const;
export function StatusBadge({
  status,
}: {
  status: PaymentStatus | InvoiceStatus | Payment["status"];
}) {
  return <Badge tone={tones[status]}>{status}</Badge>;
}
export function CurrencyDisplay({ amount }: { amount: number }) {
  return <span className="currency">{formatCurrency(amount)}</span>;
}
export function MetricCard({
  title,
  value,
  icon,
  tone = "neutral",
}: {
  title: string;
  value: number;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <Card className={`metric-card metric-card--${tone}`}>
      <div className="row-between">
        <span>{title}</span>
        {icon}
      </div>
      <strong>
        <CurrencyDisplay amount={value} />
      </strong>
    </Card>
  );
}
export function Avatar({ name, src }: { name: string; src?: string }) {
  return src ? (
    <img src={src} alt={name} width={36} height={36} className="avatar" />
  ) : (
    <span className="avatar" aria-label={name}>
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
