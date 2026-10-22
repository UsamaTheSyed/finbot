import { useState } from "react";
import { useCorrections } from "./correctionQueries";
import { QueryState } from "../../components/common/QueryState";
import { Card } from "../../components/ui/Display";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Modal } from "../../components/ui/Overlays";
import { Button } from "../../components/ui/Button";
import { Money } from "../finance/components";
import { InvoiceDocument } from "./InvoiceDocument";
import type { InvoiceCorrection } from "../../types/corrections";
import type { Party } from "../../types";
export function CorrectionHistory({
  id,
  party,
}: {
  id: string;
  party?: Party;
}) {
  const query = useCorrections(id),
    [selected, setSelected] = useState<InvoiceCorrection>();
  if (!query.data) return <QueryState queries={[query]} />;
  if (!query.data.entries?.length) return null;
  return (
    <>
      <Card className="table-card">
        <div className="section-heading">
          <h2>Correction History</h2>
        </div>
        <Table aria-label="Correction history" className="finance-table">
          <TableHeader>
            <TableRow>
              {[
                "Date",
                "Changed by",
                "Reason",
                "Before",
                "After",
                "Adjustment",
                "Details",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </TableRow>
          </TableHeader>
          <tbody>
            {query.data.entries.map((c) => (
              <TableRow key={c.id}>
                <td>{c.date}</td>
                <td>{c.actor}</td>
                <td>{c.reason}</td>
                <td>
                  <Money value={c.before.totalMinor} />
                </td>
                <td>
                  <Money value={c.after.totalMinor} />
                </td>
                <td>
                  <Money value={c.deltaMinor} />
                </td>
                <td>
                  <Button onClick={() => setSelected(c)}>View Revision</Button>
                </td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
      {selected && (
        <Modal
          open
          title="Correction Revision"
          className="invoice-preview-modal"
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
        >
          <p>
            {selected.date} · {selected.actor} · {selected.reason}
          </p>
          <h3>Before correction</h3>
          <InvoiceDocument invoice={selected.before} party={party} />
          <h3>After correction</h3>
          <InvoiceDocument invoice={selected.after} party={party} />
        </Modal>
      )}
    </>
  );
}
