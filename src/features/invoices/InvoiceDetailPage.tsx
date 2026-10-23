import { CreditDialog } from "../credits/CreditDialog";
import { CreditPanel } from "../credits/CreditPanel";
import { CorrectionHistory } from "./CorrectionHistory";
import { invoiceService } from "../../services/invoiceService";
import { savePdfDownload } from "../../utils/pdfDownload";
import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Download, Printer, Bell, MoreHorizontal } from "lucide-react";
import {
  useInvoice,
  useFinanceParties,
  usePayments,
  useFinanceMutations,
} from "../finance/queries";
import { QueryState } from "../../components/common/QueryState";
import { PageHeader } from "../../components/common/Page";
import { Card, StatusBadge } from "../../components/ui/Display";
import { Button } from "../../components/ui/Button";
import { Dropdown } from "../../components/ui/Overlays";
import { useToast } from "../../components/feedback/Toast";
import { PaymentHistory, FinancialSummary } from "../finance/components";
import { RecordPaymentDialog } from "../payments/RecordPaymentDialog";
import { InvoiceDocument, invoiceSummaryRows } from "./InvoiceDocument";
import { fromMinor } from "../../utils/money";
export function InvoiceDetailPage() {
  const { id = "" } = useParams(),
    navigate = useNavigate(),
    query = useInvoice(id),
    parties = useFinanceParties(),
    payments = usePayments(),
    { updateInvoice } = useFinanceMutations(),
    notify = useToast();
  const [downloading, setDownloading] = useState(false);
  const [payment, setPayment] = useState(false);
  const [credit, setCredit] = useState(false);
  if (!query.data || !parties.data || !payments.data)
    return <QueryState queries={[query, parties, payments]} back="/invoices" />;
  const invoice = query.data,
    party = parties.data.find((p) => p.id === invoice.partyId);
  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await invoiceService.downloadPdf(
        invoice.businessId,
        invoice.id,
      );
      const label = (invoice.displayId || invoice.id)
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .slice(0, 100);
      savePdfDownload(
        blob,
        `finbot-${party?.kind === "Supplier" ? "bill" : "invoice"}-${label}.pdf`,
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "PDF download failed.",
        "error",
      );
    } finally {
      setDownloading(false);
    }
  }
  async function issueDraft() {
    try {
      await updateInvoice.mutateAsync({
        id: invoice.id,
        draft: false,
        revision: invoice.revision,
        data: {
          partyId: invoice.partyId,
          date: invoice.date,
          dueDate: invoice.dueDate,
          reference: invoice.reference,
          items: invoice.items.map((l) => ({
            ...l,
            rate: fromMinor(l.rateMinor),
          })),
          discount: fromMinor(invoice.discountMinor),
          amountPaid: 0,
          method: "Cash",
          notes: invoice.notes,
          terms: invoice.terms,
        },
      });
      notify(
        "Draft issued. Its balance is now included in the ledger.",
        "success",
      );
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <div className="page-stack finance-page invoice-detail-page">
      <PageHeader
        title={
          <>
            <Link to="/invoices">
              {party?.kind === "Supplier" ? "Bills" : "Invoices"}
            </Link>
            <span className="muted"> › </span>
            {invoice.displayId ?? invoice.id}{" "}
            <StatusBadge status={invoice.status} />
          </>
        }
        subtitle={`Created on ${invoice.date}`}
      />
      <Card className="invoice-action-bar">
        <div className="actions">
          <Button loading={downloading} onClick={() => void downloadPdf()}>
            <Download size={16} /> Download PDF
          </Button>
          <Button
            onClick={() =>
              notify("Invoice printing is planned for a later phase.")
            }
          >
            <Printer size={16} /> Print
          </Button>
          <Button
            onClick={() => notify("Messaging is planned for a later phase.")}
          >
            <Bell size={16} /> Send Reminder
          </Button>
          <Dropdown
            label="More Actions"
            trigger={
              <>
                More Actions <MoreHorizontal size={16} />
              </>
            }
            items={[
              {
                label: "Record Credit Note",
                disabled:
                  invoice.status === "Draft" ||
                  (invoice.netTotalMinor ?? invoice.totalMinor) <= 0,
                onSelect: () => setCredit(true),
              },
              {
                label: "View Party",
                onSelect: () => navigate(`/parties/${invoice.partyId}`),
              },
              {
                label: "Edit Draft",
                disabled: invoice.status !== "Draft" || updateInvoice.isPending,
                onSelect: () => navigate(`/invoices/${invoice.id}/edit`),
              },
              {
                label: "Correct Document",
                disabled: invoice.status === "Draft" || updateInvoice.isPending,
                onSelect: () => navigate(`/invoices/${invoice.id}/correct`),
              },
              {
                label: "Issue Draft",
                disabled: invoice.status !== "Draft" || updateInvoice.isPending,
                onSelect: () => void issueDraft(),
              },
            ]}
          />
        </div>
        <Button
          variant="primary"
          disabled={invoice.status === "Draft" || invoice.balanceMinor === 0}
          onClick={() => setPayment(true)}
        >
          Record Payment
        </Button>
      </Card>
      <Link id="invoice-party-link" to={`/parties/${invoice.partyId}`}>
        View {party?.name}'s account
      </Link>
      <InvoiceDocument invoice={invoice} party={party} summary={false} />
      <div className="invoice-bottom-grid">
        <PaymentHistory
          payments={payments.data
            .filter(
              (p) =>
                p.invoiceId === invoice.id ||
                p.allocations?.some((a) => a.invoiceId === invoice.id),
            )
            .map((p) =>
              p.allocations?.length
                ? {
                    ...p,
                    amountMinor: p.allocations
                      .filter((a) => a.invoiceId === invoice.id)
                      .reduce((sum, a) => sum + a.amountMinor, 0),
                  }
                : p,
            )}
        />
        <FinancialSummary rows={invoiceSummaryRows(invoice)} />
      </div>
      {invoice.status !== "Draft" && (
        <CorrectionHistory id={invoice.id} party={party} />
      )}
      {invoice.status !== "Draft" && (
        <CreditPanel partyId={invoice.partyId} invoiceId={invoice.id} />
      )}
      {credit && (
        <CreditDialog
          kind="note"
          partyId={invoice.partyId}
          invoice={invoice}
          onClose={() => setCredit(false)}
        />
      )}
      {payment && (
        <RecordPaymentDialog
          partyId={invoice.partyId}
          invoiceId={invoice.id}
          direction={party?.kind === "Supplier" ? "Sent" : "Received"}
          onClose={() => setPayment(false)}
        />
      )}
    </div>
  );
}
