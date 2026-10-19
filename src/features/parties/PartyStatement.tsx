import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  statementRangeSchema,
  statementPeriod,
  type StatementRange,
} from "../../domain/accountStatement";
import { statementService } from "../../services/statementService";
import { useWorkspace } from "../../hooks/useWorkspace";
import { Table, TableHeader, TableRow } from "../../components/ui/Table";
import { Card } from "../../components/ui/Display";
import { DatePicker } from "../../components/ui/Fields";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/feedback/States";
import { QueryState } from "../../components/common/QueryState";
import { Money } from "../finance/components";
export function PartyStatement({
  partyId,
  range,
  onRangeChange,
}: {
  partyId: string;
  range: StatementRange;
  onRangeChange: (range: StatementRange) => void;
}) {
  const business = useWorkspace();
  const parsed = statementRangeSchema.safeParse(range);
  const query = useQuery({
    queryKey: ["party", business, partyId, "statement", range],
    queryFn: () => statementService.get(business, partyId, range),
    enabled: parsed.success,
  });
  const data = query.data;
  return (
    <div className="page-stack">
      <Card className="invoice-form-card">
        <div className="form-grid">
          <DatePicker
            label="Statement start date"
            value={range.from}
            onChange={(e) => onRangeChange({ ...range, from: e.target.value })}
          />
          <DatePicker
            label="Statement end date"
            value={range.to}
            onChange={(e) => onRangeChange({ ...range, to: e.target.value })}
          />
        </div>
        <Button onClick={() => onRangeChange({ from: "", to: "" })}>
          All dates
        </Button>
      </Card>
      {!parsed.success ? (
        <Alert>{parsed.error.issues[0].message}</Alert>
      ) : !data ? (
        <QueryState queries={[query]} />
      ) : (
        <>
          <Card className="table-card">
            <div className="section-heading">
              <h2>Account Statement</h2>
              <span>{statementPeriod(range)}</span>
            </div>
            <Table aria-label="Account statement" className="finance-table">
              <TableHeader>
                <TableRow>
                  {[
                    "Date",
                    "Reference",
                    "Description",
                    "Movement",
                    "Balance",
                  ].map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </TableRow>
              </TableHeader>
              <tbody>
                <TableRow>
                  <td>{range.from || "—"}</td>
                  <td colSpan={3}>Opening Balance</td>
                  <td>
                    <Money value={data.openingMinor} />
                  </td>
                </TableRow>
                {data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <td>{r.date}</td>
                    <td>
                      <Link to={r.href}>{r.reference}</Link>
                    </td>
                    <td>{r.label}</td>
                    <td>
                      <Money value={r.amountMinor} />
                    </td>
                    <td>
                      <Money value={r.balanceMinor} />
                    </td>
                  </TableRow>
                ))}
                {!data.rows.length && (
                  <TableRow>
                    <td colSpan={5}>No account activity in this period.</td>
                  </TableRow>
                )}
                <TableRow>
                  <td colSpan={4}>Closing Balance</td>
                  <td>
                    <Money value={data.closingMinor} />
                  </td>
                </TableRow>
              </tbody>
            </Table>
          </Card>
          <p className="muted">
            Positive balance: party owes you. Negative balance: you owe the
            party. Includes advances and refunds; payments appear once on their
            payment date. Drafts are excluded.
          </p>
        </>
      )}
    </div>
  );
}
