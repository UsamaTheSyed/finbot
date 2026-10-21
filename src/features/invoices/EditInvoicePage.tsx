import { Link, useParams } from "react-router-dom";
import { useInvoice, useFinanceParties } from "../finance/queries";
import { QueryState } from "../../components/common/QueryState";
import { PageHeader } from "../../components/common/Page";
import { Alert } from "../../components/feedback/States";
import { InvoiceForm } from "./CreateInvoicePage";
export function EditInvoicePage() {
  const { id = "" } = useParams();
  const invoice = useInvoice(id);
  const parties = useFinanceParties();
  if (!invoice.data || !parties.data)
    return <QueryState queries={[invoice, parties]} back="/invoices" />;
  if (invoice.data.status !== "Draft")
    return (
      <div className="page-stack finance-page">
        <PageHeader title="Document already issued" />
        <Alert>
          Only drafts can be edited. Issued documents retain their posted
          balances and payment allocations.
        </Alert>
        <Link to={`/invoices/${id}`}>Back to document</Link>
      </div>
    );
  return (
    <InvoiceForm
      key={`${invoice.data.businessId}:${id}`}
      initialInvoice={invoice.data}
    />
  );
}
