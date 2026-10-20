export const reportCatalog = [
  {
    title: "Daily Summary",
    path: "daily",
    icon: "calendar",
    tone: "brand",
    description:
      "View daily cash and sales summary, closing balances, and bank statements.",
  },
  {
    title: "Sales Report",
    path: "sales",
    icon: "sales",
    tone: "success",
    description:
      "Posted sales by month and customer, with discounts, tax, and totals.",
  },
  {
    title: "Purchase Report",
    icon: "purchases",
    tone: "info",
    description:
      "Track all purchase transactions, supplier invoice adjustments, and raw material costs.",
  },
  {
    title: "A/R Aging",
    path: "ar-aging",
    icon: "receivable",
    tone: "warning",
    description:
      "Outstanding customer receivables segmented by overdue limits.",
  },
  {
    title: "A/P Aging",
    path: "ap-aging",
    icon: "payable",
    tone: "danger",
    description: "Outstanding supplier payables and vendor transaction delays.",
  },
  {
    title: "Profit & Loss",
    path: "profit-loss",
    icon: "profit",
    tone: "brand",
    description:
      "Revenue vs expenses analysis, net margins, and operational costs evaluation.",
  },
  {
    title: "Trial Balance",
    icon: "trial",
    tone: "info",
    description:
      "Complete account balances, double-entry validation parameters, and auditing details.",
  },
  {
    title: "Cash Flow",
    path: "cash-flow",
    icon: "cash",
    tone: "success",
    description:
      "Track money in and out, cash liquidity projections, and bank reconciliation status.",
  },
  {
    title: "Tax Report",
    icon: "tax",
    tone: "danger",
    description:
      "FBR tax compliance report, withholding tax, and provincial sales tax evaluations.",
  },
  {
    title: "Customer Statement",
    icon: "customer",
    tone: "brand",
    description:
      "Individual customer ledger statements with complete settlement histories.",
  },
] as const;
