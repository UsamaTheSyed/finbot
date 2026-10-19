import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Phone, Mail, FileText, Plus } from "lucide-react";
import { Card, Badge } from "../../components/ui/Display";
import { Tabs } from "../../components/navigation/Controls";
import { PageHeader } from "../../components/common/Page";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/feedback/States";
import { QueryState } from "../../components/common/QueryState";
import { useFinanceParties } from "../finance/queries";
import { Money } from "../finance/components";
import { PartyFormDialog } from "./PartyFormDialog";
import type { Party } from "../../types";
export function PartiesPage() {
  const query = useFinanceParties(),
    navigate = useNavigate();
  const [params] = useSearchParams();
  const statementMode = params.get("view") === "statement";
  const partyPath = (id: string) =>
    `/parties/${id}${statementMode ? `?${new URLSearchParams({ tab: "Statement", from: params.get("from") || "", to: params.get("to") || "" })}` : ""}`;
  const [editing, setEditing] = useState<Party | "new" | null>(null);
  if (query.isPending || query.error) return <QueryState queries={[query]} />;
  const rows = query.data || [];
  const grid = (kind?: Party["kind"]) => (
    <div className="party-grid">
      {rows
        .filter((p) => !kind || p.kind === kind)
        .map((p) => (
          <Card className="party-card" key={p.id}>
            <div className="party-card-header">
              <h2>
                <Link to={partyPath(p.id)}>{p.name}</Link>
              </h2>
              <Badge tone={p.kind === "Customer" ? "success" : "info"}>
                {p.kind}
              </Badge>
            </div>
            <div className="party-card-contact">
              <p>
                <Phone size={14} />
                {p.phone || "No phone"}
              </p>
              <p>
                <Mail size={14} />
                {p.email || "No email"}
              </p>
              <p>
                <FileText size={14} />
                {p.ntn || "No NTN"}
              </p>
            </div>
            <div className="party-card-balance">
              <span className="muted">Balance</span>
              <Badge
                tone={
                  p.balanceMinor < 0
                    ? "danger"
                    : p.balanceMinor > 0
                      ? "success"
                      : "neutral"
                }
              >
                <Money value={p.balanceMinor} />
              </Badge>
            </div>
            <div className="actions">
              <Button onClick={() => navigate(partyPath(p.id))}>View</Button>
              <Button onClick={() => setEditing(p)}>Edit</Button>
            </div>
          </Card>
        ))}
      {!rows.some((p) => !kind || p.kind === kind) && (
        <EmptyState
          kind="parties"
          action={<Button onClick={() => setEditing("new")}>Add Party</Button>}
        />
      )}
    </div>
  );
  return (
    <div className="page-stack finance-page parties-page">
      <PageHeader
        title="Parties"
        actions={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus size={16} />
            Add Party
          </Button>
        }
      />
      <Tabs
        key={statementMode ? "statement" : "all"}
        defaultValue={statementMode ? "customers" : "all"}
        items={[
          { value: "all", label: `All (${rows.length})`, content: grid() },
          {
            value: "customers",
            label: `Customers (${rows.filter((p) => p.kind === "Customer").length})`,
            content: grid("Customer"),
          },
          {
            value: "suppliers",
            label: `Suppliers (${rows.filter((p) => p.kind === "Supplier").length})`,
            content: grid("Supplier"),
          },
        ]}
      />
      {editing && (
        <PartyFormDialog
          party={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
