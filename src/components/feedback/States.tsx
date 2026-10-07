import {
  SearchX,
  AlertCircle,
  Receipt,
  Users2,
  FileText,
  Wallet,
  BarChart3,
  WifiOff,
  LockKeyhole,
  FileQuestion,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/Button";

type EmptyStateKind =
  "transactions" | "parties" | "invoices" | "payments" | "reports" | "search";

const emptyStateDefaults: Record<
  EmptyStateKind,
  { icon: LucideIcon; title: string; description: string }
> = {
  transactions: {
    icon: Receipt,
    title: "No transactions yet",
    description:
      "Record your first sale or purchase to start tracking your business ledger.",
  },
  parties: {
    icon: Users2,
    title: "No parties added",
    description:
      "Add your customers and suppliers to manage your business contacts and dues.",
  },
  invoices: {
    icon: FileText,
    title: "No invoices created",
    description:
      "Create your first invoice to start professional billing for your customers.",
  },
  payments: {
    icon: Wallet,
    title: "No payments recorded",
    description:
      "Record payments to track actual money coming in and going out of accounts.",
  },
  reports: {
    icon: BarChart3,
    title: "No reports available",
    description:
      "Complete some transactions first to automatically generate business reports.",
  },
  search: {
    icon: SearchX,
    title: "No results found",
    description:
      "Try different keywords or check your spelling to locate the transaction.",
  },
};

export function EmptyState({
  kind = "search",
  title,
  description,
  action,
}: {
  kind?: EmptyStateKind;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  const preset = emptyStateDefaults[kind];
  const Icon = preset.icon;
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        <Icon size={24} strokeWidth={1.6} />
      </span>
      <div className="empty-state__copy">
        <h2>{title ?? preset.title}</h2>
        <p>{description ?? preset.description}</p>
      </div>
      {action}
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div role="status" className="loading">
      <span className="sr-only">Loading</span>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}
export function Alert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "info";
}) {
  return (
    <div
      className={`alert alert--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <Alert>
      {error.message}
      {retry && <Button onClick={retry}>Retry</Button>}
    </Alert>
  );
}

type SystemStateKind = "offline" | "access" | "missing" | "server";
const systemStateDefaults: Record<
  SystemStateKind,
  { icon: LucideIcon; title: string; description: string }
> = {
  offline: {
    icon: WifiOff,
    title: "Connection Lost",
    description: "Please check your internet connection and try again.",
  },
  access: {
    icon: LockKeyhole,
    title: "403 — Access Denied",
    description: "You don't have permission to view this page. Contact admin.",
  },
  missing: {
    icon: FileQuestion,
    title: "Page Not Found",
    description:
      "The page you are looking for doesn't exist or has been moved.",
  },
  server: {
    icon: TriangleAlert,
    title: "500 — Server Error",
    description: "Something went wrong on our end. Please try again later.",
  },
};
export function SystemState({
  kind,
  action,
  title,
  description,
}: {
  kind: SystemStateKind;
  action?: ReactNode;
  title?: string;
  description?: string;
}) {
  const preset = systemStateDefaults[kind];
  const Icon = preset.icon;
  return (
    <section className={`system-state system-state--${kind}`}>
      <span className="system-state__icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div>
        <h2>{title ?? preset.title}</h2>
        <p>{description ?? preset.description}</p>
      </div>
      {action}
    </section>
  );
}
