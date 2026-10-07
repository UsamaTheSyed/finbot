import { Link } from "react-router-dom";
import { Tabs as RadixTabs } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "../ui/Button";
export function Breadcrumb({
  items,
  separator = "›",
}: {
  items: { label: string; href?: string }[];
  separator?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {i > 0 && <span aria-hidden="true">{separator}</span>}
            {item.href ? (
              <Link to={item.href}>{item.label}</Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination" aria-label="Pagination">
      <span aria-live="polite">
        Page {page} of {pages}
      </span>
      <div className="actions">
        <Button disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
export function Tabs({
  items,
  defaultValue,
}: {
  items: { value: string; label: string; content: ReactNode }[];
  defaultValue: string;
}) {
  return (
    <RadixTabs.Root defaultValue={defaultValue}>
      <RadixTabs.List className="tabs" aria-label="Sections">
        {items.map((item) => (
          <RadixTabs.Trigger key={item.value} value={item.value}>
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content key={item.value} value={item.value}>
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
