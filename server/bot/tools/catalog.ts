// Documentation/permission inventory, not a model-controlled dispatcher.
export const toolCatalog = {
  SEARCH_PARTY: "read",
  GET_PARTY_BALANCE: "read",
  GET_PARTY_STATEMENT: "read",
  SEARCH_INVOICE: "read",
  GET_INVOICE: "read",
  GET_OUTSTANDING_INVOICES: "read",
  GET_DAILY_SUMMARY: "read",
  GET_RECEIVABLES: "read",
  GET_PAYABLES: "read",
  GET_CASH_FLOW: "read",
  RECORD_PAYMENT: "prepare-and-confirm",
  RECORD_SALE: "prepare-and-confirm",
  RECORD_PURCHASE: "unsupported-by-existing-domain",
} as const;
