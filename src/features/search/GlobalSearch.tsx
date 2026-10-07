import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users2, FileText, Database, CreditCard } from "lucide-react";
import { useTransactions, useParties } from "../transactions/queries";
import { Modal } from "../../components/ui/Overlays";
import { SearchInput } from "../../components/ui/Fields";
import { Badge, CurrencyDisplay } from "../../components/ui/Display";
import {
  LoadingSkeleton,
  ErrorState,
  EmptyState,
} from "../../components/feedback/States";
import { useWorkspace } from "../../hooks/useWorkspace";
import { invoiceService } from "../../services/invoiceService";
import { paymentService } from "../../services/paymentService";
import { fromMinor } from "../../utils/money";

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Global Search"
      className="search-modal"
    >
      {open && <SearchResults onClose={() => onOpenChange(false)} />}
    </Modal>
  );
}

function SearchResults({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(""),
    [selected, setSelected] = useState(0);
  const navigate = useNavigate(),
    business = useWorkspace();
  const transactions = useTransactions({ page: 1, pageSize: 8, search: text });
  const parties = useParties();
  const invoices = useQuery({
    queryKey: ["invoices", business, "search"],
    queryFn: () => invoiceService.getInvoices(business),
  });
  const payments = useQuery({
    queryKey: ["payments", business, "search"],
    queryFn: () => paymentService.getPayments(business),
  });
  const term = text.trim().toLowerCase();
  const partyName = (id: string) =>
    parties.data?.find((party) => party.id === id)?.name || "Unknown party";
  const groups = [
    {
      label: "PARTIES",
      icon: Users2,
      rows: (parties.data || [])
        .filter((party) => term && party.name.toLowerCase().includes(term))
        .slice(0, 2)
        .map((party) => ({
          id: `party-${party.id}`,
          title: party.name,
          subtitle: `${party.kind} • ${party.phone}`,
          href: `/parties/${party.id}`,
          amount: null as number | null,
          status: "",
        })),
    },
    {
      label: "INVOICES",
      icon: FileText,
      rows: (invoices.data || [])
        .filter(
          (invoice) =>
            term &&
            `${invoice.id} ${partyName(invoice.partyId)}`
              .toLowerCase()
              .includes(term),
        )
        .slice(0, 2)
        .map((invoice) => ({
          id: `invoice-${invoice.id}`,
          title: `${invoice.id} — ${partyName(invoice.partyId)}`,
          subtitle: `Created ${invoice.date} • Due ${invoice.dueDate}`,
          href: `/invoices/${invoice.id}`,
          amount: fromMinor(invoice.totalMinor),
          status: invoice.status,
        })),
    },
    {
      label: "TRANSACTIONS",
      icon: Database,
      rows: (transactions.data?.items || []).slice(0, 2).map((transaction) => ({
        id: `transaction-${transaction.id}`,
        title: `${transaction.id} — ${partyName(transaction.partyId)}`,
        subtitle: `${transaction.status} • ${transaction.date}`,
        href: `/transactions/${transaction.id}`,
        amount: transaction.total,
        status: "",
      })),
    },
    {
      label: "PAYMENTS",
      icon: CreditCard,
      rows: (payments.data || [])
        .filter(
          (payment) =>
            term &&
            `${payment.id} ${partyName(payment.partyId)}`
              .toLowerCase()
              .includes(term),
        )
        .slice(0, 1)
        .map((payment) => ({
          id: `payment-${payment.id}`,
          title: `${payment.id} — ${partyName(payment.partyId)}`,
          subtitle: `${payment.method} payment • Ref: ${payment.reference || "—"}`,
          href: "/payments",
          amount: fromMinor(payment.amountMinor),
          status: "",
        })),
    },
  ];
  const rows = groups.flatMap((group) => group.rows),
    current = Math.max(0, Math.min(selected, rows.length - 1));
  const loading =
    transactions.isPending ||
    parties.isPending ||
    invoices.isPending ||
    payments.isPending;
  const error =
    transactions.error || parties.error || invoices.error || payments.error;
  const choose = (href: string) => {
    onClose();
    navigate(href);
  };
  return (
    <div className="search-results">
      <SearchInput
        autoFocus
        label="Search across FinBot"
        placeholder="Search parties, invoices, transactions, and payments..."
        value={text}
        role="combobox"
        aria-expanded
        aria-controls="search-results"
        aria-activedescendant={
          rows[current] ? `result-${rows[current].id}` : undefined
        }
        onChange={(event) => {
          setText(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelected((index) => Math.min(index + 1, rows.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelected((index) => Math.max(index - 1, 0));
          }
          if (event.key === "Enter" && rows[current]) {
            event.preventDefault();
            choose(rows[current].href);
          }
        }}
      />
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState error={error} />
      ) : !term || !rows.length ? (
        <EmptyState kind="search" />
      ) : (
        <div
          role="listbox"
          id="search-results"
          aria-label="Search results"
          className="search-groups"
        >
          {groups
            .filter((group) => group.rows.length)
            .map((group) => (
              <section
                key={group.label}
                aria-label={group.label}
                className="search-group"
              >
                <h2>{group.label}</h2>
                {group.rows.map((row) => {
                  const index = rows.findIndex((item) => item.id === row.id),
                    Icon = group.icon;
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === current}
                      id={`result-${row.id}`}
                      key={row.id}
                      onClick={() => choose(row.href)}
                      className={`search-result ${index === current ? "selected" : ""}`}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{row.title}</strong>
                        <small>{row.subtitle}</small>
                      </span>
                      <span className="search-result-value">
                        {row.amount !== null && (
                          <CurrencyDisplay amount={row.amount} />
                        )}
                        {row.status && (
                          <Badge
                            tone={
                              row.status === "Partial" ? "warning" : "neutral"
                            }
                          >
                            {row.status}
                          </Badge>
                        )}
                      </span>
                    </button>
                  );
                })}
              </section>
            ))}
        </div>
      )}
      <p className="search-hints">
        Press <strong>↑↓</strong> to navigate, <strong>Enter</strong> to select,{" "}
        <strong>Esc</strong> to close command palette
      </p>
    </div>
  );
}
