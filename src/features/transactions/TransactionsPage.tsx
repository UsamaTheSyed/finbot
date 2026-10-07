import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { MoreHorizontal, Plus } from "lucide-react";
import { useTransactions, useParties } from "./queries";
import {
  TransactionFilters,
  type FilterValues,
} from "./TransactionFilters";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import {
  CurrencyDisplay,
  StatusBadge,
  Card,
} from "../../components/ui/Display";
import { PageHeader } from "../../components/common/Page";
import { Button } from "../../components/ui/Button";
import { Dropdown } from "../../components/ui/Overlays";
import { Pagination } from "../../components/navigation/Controls";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { formatDate } from "../../utils/format";
export function TransactionsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useToast();
  const values: FilterValues = {
    type: params.get("type") || "",
    date: params.get("date") || "",
    partyId: params.get("partyId") || "",
    status: params.get("status") || "",
  };
  const page = Math.max(1, Number(params.get("page")) || 1);
  const date =
    values.date === "recent"
      ? { from: "2026-11-19", to: "2026-11-28" }
      : values.date === "november"
        ? { from: "2026-11-01", to: "2026-11-30" }
        : values.date === "october"
          ? { from: "2026-10-01", to: "2026-10-31" }
          : {};
  const data = useTransactions({ ...values, ...date, page, pageSize: 10 });
  const parties = useParties();
  const names = new Map(parties.data?.map((p) => [p.id, p.name]));
  function filters(next: FilterValues) {
    setParams(
      Object.fromEntries(
        Object.entries(next).filter(([, value]) => value)
      ),
      { flushSync: true },
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Transactions"
        actions={
          <Button
            variant="primary"
            onClick={() =>
              notify("New transaction creation is scheduled for a later phase.")
            }
          >
            <Plus size={16} />
            New Transaction
          </Button>
        }
      />
      <TransactionFilters
        values={values}
        onChange={filters}
        parties={parties.data || []}
      />
      {data.isPending || parties.isPending ? (
        <LoadingSkeleton />
      ) : data.error || parties.error ? (
        <ErrorState
          error={(data.error || parties.error)!}
          retry={() => {
            void data.refetch();
            void parties.refetch();
          }}
        />
      ) : data.data?.items.length ? (
        <>
          <Card className="table-card">
            <Table className="transactions-table" aria-label="Transactions">
              <colgroup>
                <col className="col-date" />
                <col className="col-type" />
                <col />
                <col className="col-amount" />
                <col className="col-status" />
                <col className="col-actions" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  {["Date", "Type", "Party", "Amount", "Status", "Actions"].map(
                    (label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <tbody>
                {data.data.items.map((row) => (
                  <TableRow
                    key={row.id}
                    className="clickable-row"
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("button,a"))
                        navigate(`/transactions/${row.id}`);
                    }}
                  >
                    <td>{formatDate(row.date)}</td>
                    <td className={row.type === "Sale" ? "sale-type" : ""}>
                      {row.type}
                    </td>
                    <td>
                      <Link
                        to={`/transactions/${row.id}`}
                        aria-label={`View ${row.id} for ${names.get(row.partyId)}`}
                      >
                        {names.get(row.partyId)}
                      </Link>
                    </td>
                    <td>
                      <strong>
                        <CurrencyDisplay amount={row.total} />
                      </strong>
                    </td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      <Dropdown
                        label={`Actions for ${row.id}`}
                        trigger={<MoreHorizontal size={16} />}
                        items={[
                          {
                            label: "View transaction",
                            onSelect: () => navigate(`/transactions/${row.id}`),
                          },
                          {
                            label: "Edit transaction",
                            onSelect: () =>
                              navigate(`/transactions/${row.id}?action=edit`),
                          },
                          {
                            label: "Record payment",
                            disabled: row.balance === 0,
                            onSelect: () =>
                              navigate(
                                `/transactions/${row.id}?action=payment`,
                              ),
                          },
                          {
                            label: "Delete transaction",
                            danger: true,
                            onSelect: () =>
                              navigate(`/transactions/${row.id}?action=delete`),
                          },
                        ]}
                      />
                    </td>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </Card>
          <Pagination
            page={page}
            total={data.data.total}
            pageSize={10}
            onPage={(next) =>
              setParams((prev) => {
                prev.set("page", String(next));
                return prev;
              })
            }
          />
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
