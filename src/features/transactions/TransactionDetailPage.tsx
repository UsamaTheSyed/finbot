import {
  useParams,
  useSearchParams,
  useNavigate,
  Link,
} from "react-router-dom";
import { useTransaction, useParties, useTransactionActions } from "./queries";
import { PageHeader } from "../../components/common/Page";
import { Button } from "../../components/ui/Button";
import {
  Card,
  CurrencyDisplay,
  StatusBadge,
} from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { ConfirmationDialog } from "../../components/ui/Overlays";
import {
  ErrorState,
  LoadingSkeleton,
  EmptyState,
} from "../../components/feedback/States";
import { useToast } from "../../components/feedback/Toast";
import { useAppStore } from "../../store/useAppStore";
import { formatDate, formatMetadataDate } from "../../utils/format";
import { EditDialog, PaymentDialog } from "./TransactionDialogs";
import { ApiError } from "../../services/api";
export function TransactionDetailPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useToast();
  const query = useTransaction(id);
  const parties = useParties();
  const actions = useTransactionActions(id);
  const user = useAppStore((s) => s.user);
  const action = params.get("action");
  const close = () => setParams({}, { replace: true });
  if (query.isPending || parties.isPending) return <LoadingSkeleton />;
  if (query.error instanceof ApiError && query.error.status === 404)
    return (
      <EmptyState
        title="Transaction not found"
        description="This transaction may have been removed."
        action={<Link to="/transactions">Back to Transactions</Link>}
      />
    );
  if (query.error || parties.error)
    return (
      <ErrorState
        error={(query.error || parties.error)!}
        retry={() => {
          void query.refetch();
          void parties.refetch();
        }}
      />
    );
  const transaction = query.data!;
  const party = parties.data?.find((p) => p.id === transaction.partyId);
  const creator =
    transaction.createdBy === user?.id ? user.name : "Team member";
  return (
    <div className="page-stack detail-page">
      <PageHeader
        title={
          <span className="title-with-status">
            Invoice {transaction.id}
            <StatusBadge status={transaction.status} />
          </span>
        }
        subtitle={`Created on ${formatDate(transaction.date, true)} by ${creator}`}
        actions={
          <>
            <Button
              variant="danger"
              onClick={() => setParams({ action: "delete" })}
            >
              Delete
            </Button>
            <Button
              onClick={() =>
                notify(
                  "Invoice PDF download will be added in the PDF generation phase.",
                )
              }
            >
              Download Invoice
            </Button>
            <Button onClick={() => setParams({ action: "edit" })}>
              Edit Transaction
            </Button>
            <Button
              variant="primary"
              disabled={transaction.balance === 0}
              onClick={() => setParams({ action: "payment" })}
            >
              Record Payment
            </Button>
          </>
        }
      />
      <Card className="meta-card">
        {[
          ["Transaction Date", formatMetadataDate(transaction.date)],
          ["Customer / Party", party?.name || transaction.partyId],
          ["Type", `${transaction.type} Invoice`],
          ["Created By", creator],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {label === "Customer / Party" ? (
                <Link to={`/parties/${transaction.partyId}`}>{value}</Link>
              ) : (
                value
              )}
            </strong>
          </div>
        ))}
      </Card>
      <div className="detail-columns">
        <Card className="items-card">
          <Table className="items-table" aria-label="Transaction items">
            <TableHeader>
              <TableRow>
                <th scope="col">Item / Description</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit Rate</th>
                <th scope="col">Total Amount</th>
              </TableRow>
            </TableHeader>
            <tbody>
              {transaction.items.map((item) => (
                <TableRow key={item.id}>
                  <td>{item.description}</td>
                  <td>
                    {item.quantity} {item.unit}
                  </td>
                  <td>
                    <CurrencyDisplay amount={item.rate} />
                  </td>
                  <td>
                    <CurrencyDisplay amount={item.quantity * item.rate} />
                  </td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="ledger-card">
          <h2>Payment Breakdown</h2>
          <dl>
            {[
              ["Subtotal", transaction.subtotal],
              ["Discount", -transaction.discount],
              [
                transaction.taxRate === null
                  ? "Sales Tax (mixed rates)"
                  : `Sales Tax (${transaction.taxRate}%)`,
                transaction.tax,
              ],
              ["Total Amount", transaction.total],
              ["Paid Amount", transaction.paid],
              ["Balance Outstanding", transaction.balance],
            ].map(([label, amount]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <CurrencyDisplay amount={Number(amount)} />
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      {transaction.notes && (
        <Card className="notes">
          <h2>Notes</h2>
          <p>{transaction.notes}</p>
        </Card>
      )}
      <EditDialog
        open={action === "edit"}
        onClose={close}
        transaction={transaction}
        loading={actions.edit.isPending}
        onSubmit={async (value) => {
          await actions.edit.mutateAsync(value);
          close();
          notify("Transaction updated.", "success");
        }}
      />
      <PaymentDialog
        open={action === "payment" && transaction.balance > 0}
        onClose={close}
        transaction={transaction}
        loading={actions.pay.isPending}
        onSubmit={async (value) => {
          await actions.pay.mutateAsync(value);
          close();
          notify("Payment recorded.", "success");
        }}
      />
      <ConfirmationDialog
        open={action === "delete"}
        onOpenChange={(v) => {
          if (!v && !actions.remove.isPending) close();
        }}
        title="Delete Transaction"
        description={`This action cannot be undone. Delete ${id}?`}
        loading={actions.remove.isPending}
        onConfirm={() =>
          actions.remove.mutate(undefined, {
            onSuccess: () => {
              navigate("/transactions");
              notify("Transaction deleted.", "success");
            },
            onError: (error) => notify(error.message, "error"),
          })
        }
      />
    </div>
  );
}
