import type { ReactNode } from "react";
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <section className="filter-bar" aria-label="Transaction filters">
      {children}
    </section>
  );
}
