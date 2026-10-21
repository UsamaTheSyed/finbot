import type { Invoice, Party, Payment, Transaction } from "../types";
import { payableAging, reportMonthBounds, salesReport } from "./ledgerReports";
import { sumMinor, toMinor } from "../utils/money";
export function mockLedgerReport(
  businessId: string,
  kind: "sales" | "ap-aging" | "purchases",
  period: string,
  transactions: Transaction[],
  invoices: Invoice[],
  parties: Party[],
  payments: Payment[],
) {
  const names = new Map(
    parties.filter((p) => p.businessId === businessId).map((p) => [p.id, p]),
  );
  if (kind === "sales" || kind === "purchases")
    return salesReport(
      period,
      transactions
        .filter(
          (t) =>
            t.businessId === businessId &&
            t.type === (kind === "sales" ? "Sale" : "Purchase"),
        )
        .map((t) => {
          const invoice = invoices.find(
            (i) => i.businessId === businessId && i.transactionId === t.id,
          );
          return {
            id: t.id,
            displayId: invoice?.displayId || invoice?.id || t.id,
            invoiceId: invoice?.id,
            date: t.date,
            party: names.get(t.partyId)?.name || "Unknown party",
            subtotalMinor: toMinor(t.subtotal),
            discountMinor: toMinor(t.discount),
            taxMinor: toMinor(t.tax),
            totalMinor: toMinor(t.total),
          };
        }),
      kind,
    );
  const { end } = reportMonthBounds(period);
  return payableAging(
    period,
    invoices
      .filter(
        (i) =>
          i.businessId === businessId &&
          i.status !== "Draft" &&
          names.get(i.partyId)?.kind === "Supplier",
      )
      .map((i) => {
        const settled = payments
          .filter(
            (p) =>
              p.businessId === businessId &&
              p.partyId === i.partyId &&
              p.status === "Completed" &&
              p.direction === "Sent",
          )
          .map((p) => {
            if (p.allocations?.length)
              return sumMinor(
                p.allocations
                  .filter(
                    (a) =>
                      (a.invoiceId === i.id ||
                        (!!i.transactionId &&
                          a.transactionId === i.transactionId)) &&
                      a.effectiveDate <= end,
                  )
                  .map((a) => a.amountMinor),
              );
            return p.date <= end &&
              (p.invoiceId === i.id ||
                (!!i.transactionId && p.transactionId === i.transactionId))
              ? p.amountMinor
              : 0;
          });
        return {
          partyId: i.partyId,
          party: names.get(i.partyId)!.name,
          date: i.date,
          dueDate: i.dueDate,
          balanceMinor: sumMinor([i.totalMinor, -sumMinor(settled)]),
        };
      }),
  );
}
