import { recordPayment } from "./mock/recordPayment";
import type {
  PageResult,
  PaymentInput,
  Transaction,
  TransactionEdit,
  TransactionFilters,
} from "../types";
import { httpApi, mockResponse, useMock, ApiError } from "./api";
import { transactions, parties, payments, invoices } from "./mock/data";
import {
  editSchema,
  filterTransactions,
} from "../features/transactions/domain";
const base = (businessId: string) =>
  `/businesses/${encodeURIComponent(businessId)}/transactions`;
function find(id: string, businessId: string) {
  const record = transactions.find(
    (t) => t.id === id && t.businessId === businessId,
  );
  if (!record) throw new ApiError("Transaction not found", 404);
  return record;
}
export const transactionService = {
  list(
    businessId: string,
    filters: TransactionFilters,
  ): Promise<PageResult<Transaction>> {
    if (!useMock)
      return httpApi.get(
        `${base(businessId)}?${new URLSearchParams(Object.entries(filters).map(([k, v]) => [k, String(v)]))}`,
      );
    return mockResponse(() => {
      const rows = filterTransactions(
        transactions.filter((t) => t.businessId === businessId),
        filters,
        new Map(parties.map((p) => [p.id, p.name])),
      ).sort((a, b) => b.date.localeCompare(a.date));
      return {
        items: rows.slice(
          (filters.page - 1) * filters.pageSize,
          filters.page * filters.pageSize,
        ),
        total: rows.length,
        page: filters.page,
        pageSize: filters.pageSize,
      };
    });
  },
  get(businessId: string, id: string): Promise<Transaction> {
    return useMock
      ? mockResponse(() => find(id, businessId))
      : httpApi.get(`${base(businessId)}/${encodeURIComponent(id)}`);
  },
  update(
    businessId: string,
    id: string,
    input: TransactionEdit,
  ): Promise<Transaction> {
    const value = editSchema.parse(input);
    return useMock
      ? mockResponse(() => {
          const row = find(id, businessId);
          if (
            invoices.some(
              (i) =>
                i.businessId === businessId &&
                i.transactionId === id &&
                i.dueDate < value.date,
            )
          )
            throw new Error(
              "Transaction date cannot follow the invoice due date.",
            );
          if (
            payments.some(
              (p) =>
                p.businessId === businessId &&
                p.transactionId === id &&
                p.date < value.date,
            )
          )
            throw new Error(
              "Transaction date cannot follow an existing payment.",
            );
          Object.assign(row, value);
          for (const invoice of invoices.filter(
            (i) => i.businessId === businessId && i.transactionId === id,
          )) {
            invoice.date = value.date;
            invoice.notes = value.notes;
          }
          return row;
        })
      : httpApi.patch(`${base(businessId)}/${encodeURIComponent(id)}`, value);
  },
  recordPayment(
    businessId: string,
    id: string,
    input: PaymentInput,
  ): Promise<Transaction> {
    return useMock
      ? mockResponse(() => {
          const row = find(id, businessId);
          recordPayment(
            businessId,
            {
              ...input,
              direction: row.type === "Sale" ? "Received" : "Sent",
              partyId: row.partyId,
              invoiceId: "",
              reference: "",
              notes: "",
            },
            id,
          );
          return row;
        })
      : httpApi.post(
          `${base(businessId)}/${encodeURIComponent(id)}/payments`,
          input,
        );
  },
  remove(businessId: string, id: string): Promise<void> {
    return useMock
      ? mockResponse(() => {
          find(id, businessId);
          // Session-only deletion removes dependent demo records to avoid dangling IDs.
          for (const records of [payments, invoices])
            for (let n = records.length - 1; n >= 0; n--)
              if (
                records[n].businessId === businessId &&
                records[n].transactionId === id
              )
                records.splice(n, 1);
          transactions.splice(
            transactions.findIndex(
              (t) => t.id === id && t.businessId === businessId,
            ),
            1,
          );
        })
      : httpApi.delete(`${base(businessId)}/${encodeURIComponent(id)}`);
  },
};
