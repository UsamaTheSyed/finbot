import { toMinor } from "../../utils/money";
import { calculateInvoiceTotal } from "../../domain/invoiceCalculations";
import type {
  Business,
  Invoice,
  Notification,
  Party,
  Payment,
  Report,
  TeamMember,
  Transaction,
  User,
} from "../../types";
import { demoDate } from "../../lib/demo";
export { demoDate };
export const users: User[] = [
  {
    id: "user-1",
    name: "Haris Munir",
    email: "haris@alienterprise.example",
    role: "Admin",
  },
];
export const businesses: Business[] = [
  {
    id: "business-1",
    name: "Ali Enterprise",
    currency: "PKR",
    city: "Karachi",
  },
];
const names = [
  "Ahmed Khan",
  "Usama",
  "Ali Hassan",
  "Supplier Corp",
  "Fatima Ahmed",
  "Tech Parts",
  "Bilal Trading",
  "Raw Materials Co",
  "Hassan & Sons",
  "Karachi Supplies",
];
export const parties: Party[] = names.map((name, i) => ({
  id: `party-${i + 1}`,
  businessId: "business-1",
  name,
  kind: [1, 3, 5, 7].includes(i) ? "Supplier" : "Customer",
  phone: `0300${String(i + 1000000)}`,
  email: `${name.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
  ntn: `NTN-${123456 + i}`,
  address: "Office 5, Block C, Karachi",
  paymentTerms: "Net 30",
}));
const totals = [
  42000, 18500, 50000, 75000, 30000, 12000, 45000, 90000, 35000, 22000,
];
export const transactions: Transaction[] = Array.from(
  { length: 50 },
  (_, i) => {
    const n = i % 10,
      total = totals[n],
      partial = [0, 3, 8].includes(n),
      paid = partial
        ? n === 0
          ? 25000
          : Math.round(total / 2)
        : n === 6
          ? 0
          : total;
    const date = new Date(Date.UTC(2026, 10, 28 - i))
      .toISOString()
      .slice(0, 10);
    return {
      id:
        i === 0
          ? "SALE-000128"
          : `${[1, 3, 5, 7].includes(n) ? "PUR" : "SALE"}-${String(127 - i).padStart(6, "0")}`,
      businessId: "business-1",
      date,
      dueDate: date,
      partyId: `party-${n + 1}`,
      type: [1, 3, 5, 7].includes(n) ? "Purchase" : "Sale",
      status: partial ? "Partial" : n === 6 ? "Overdue" : "Completed",
      createdBy: "user-1",
      items:
        i === 0
          ? [
              {
                id: "item-1",
                description: "Rice Bags",
                quantity: 5,
                unit: "Bags",
                rate: 5000,
              },
              {
                id: "item-2",
                description: "Cooking Oil",
                quantity: 2,
                unit: "Cartons",
                rate: 8500,
              },
            ]
          : [
              {
                id: `item-${i + 1}`,
                description: n % 2 ? "Wholesale supplies" : "Grocery stock",
                quantity: 1,
                unit: "Lot",
                rate: total,
              },
            ],
      subtotal: total,
      discount: i === 0 ? 2000 : 0,
      tax: i === 0 ? 2000 : 0,
      taxRate: i === 0 ? 5 : 0,
      total,
      paid,
      balance: total - paid,
      notes: "",
    };
  },
);
// Every issued invoice points to exactly one existing transaction for the same party.
const invoiceIds = [
  "INV-001",
  "INV-005",
  "INV-002",
  "INV-007",
  "INV-019",
  "INV-009",
  "INV-012",
  "INV-010",
  "INV-006",
  "INV-008",
];
export const invoices: Invoice[] = transactions.slice(0, 10).map((t, i) => {
  const items = t.items.map((l) => ({
    ...l,
    item: l.description,
    rateMinor: toMinor(l.rate),
    taxPercent: i === 0 ? 5 : 0,
  }));
  const totals = calculateInvoiceTotal(items, i === 0 ? 210000 : 0);
  const dueDate = t.balance > 0 && i !== 0 ? t.date : "2026-12-28";
  t.dueDate = dueDate;
  // Correct the original illustrative tax without changing its PKR 42,000 total.
  t.tax = totals.taxMinor / 100;
  t.discount = totals.discountMinor / 100;
  return {
    id: invoiceIds[i],
    businessId: t.businessId,
    transactionId: t.id,
    partyId: t.partyId,
    date: t.date,
    dueDate,
    reference: `REF-2026-${i + 1}`,
    items,
    ...totals,
    paidMinor: toMinor(t.paid),
    balanceMinor: toMinor(t.balance),
    status: t.balance === 0 ? "Paid" : t.paid > 0 ? "Partial" : "Overdue",
    notes: "",
    terms: "Payment due within 30 days.",
    daysOverdue:
      t.balance > 0
        ? Math.max(
            0,
            Math.floor((Date.parse(demoDate) - Date.parse(dueDate)) / 86400000),
          )
        : 0,
  };
});
for (let i = 0; i < 2; i++)
  invoices.push({
    id: `INV-DRAFT-${i + 1}`,
    businessId: "business-1",
    partyId: `party-${i === 0 ? 5 : 3}`,
    date: demoDate,
    dueDate: "2026-12-28",
    reference: "",
    items: [
      {
        id: `draft-line-${i}`,
        item: "Grocery stock",
        description: "Wholesale goods",
        quantity: 1,
        unit: "Lot",
        rateMinor: 3000000,
        taxPercent: 0,
      },
    ],
    subtotalMinor: 3000000,
    taxMinor: 0,
    discountMinor: 0,
    totalMinor: 3000000,
    paidMinor: 0,
    balanceMinor: 3000000,
    status: "Draft",
    notes: "",
    terms: "",
    daysOverdue: 0,
  });
export const payments: Payment[] = transactions
  .filter((t) => t.paid > 0)
  .map((t, i) => ({
    id: i === 0 ? "PAY-0012" : `PAY-${String(100 + i).padStart(4, "0")}`,
    businessId: t.businessId,
    partyId: t.partyId,
    transactionId: t.id,
    invoiceId: invoices.find((v) => v.transactionId === t.id)?.id,
    direction: t.type === "Sale" ? "Received" : "Sent",
    amountMinor: toMinor(t.paid),
    method: (
      ["Cash", "Bank Transfer", "Easypaisa", "JazzCash", "Cheque"] as const
    )[i % 5],
    date: t.date,
    reference: `REF-${100 + i}`,
    notes: "Opening mock payment",
    status: "Completed",
  }));
payments.push(
  {
    id: "PAY-0200",
    businessId: "business-1",
    partyId: "party-7",
    direction: "Received",
    amountMinor: 1200000,
    method: "Cheque",
    date: demoDate,
    reference: "CHQ-1001",
    notes: "Awaiting clearance",
    status: "Pending",
  },
  {
    id: "PAY-0201",
    businessId: "business-1",
    partyId: "party-5",
    direction: "Received",
    amountMinor: 1500000,
    method: "Easypaisa",
    date: demoDate,
    reference: "EP-1002",
    notes: "Demo failed payment",
    status: "Failed",
  },
);
export const reports: Report[] = [
  {
    id: "dashboard",
    businessId: "business-1",
    asOf: demoDate,
    totalCash: 500000,
    receivable: 250000,
    payable: 180000,
  },
];
export const notifications: Notification[] = [
  {
    id: "notice-1",
    businessId: "business-1",
    title: "Invoice overdue",
    description: "Bilal Trading has an overdue invoice.",
    read: false,
    href: "/invoices/INV-012",
    date: demoDate,
  },
  {
    id: "notice-2",
    businessId: "business-1",
    title: "Payment recorded",
    description: "PKR 25,000 received from Ahmed Khan.",
    read: false,
    href: "/transactions/SALE-000128",
    date: demoDate,
  },
  {
    id: "notice-3",
    businessId: "business-1",
    title: "New invoice created",
    description: "Invoice INV-019 was created for Fatima Ahmed.",
    read: false,
    href: "/invoices/INV-019",
    date: demoDate,
  },
  {
    id: "notice-4",
    businessId: "business-1",
    title: "Payment pending",
    description: "Cheque CHQ-1001 is awaiting clearance.",
    read: true,
    href: "/payments",
    date: "2026-11-27",
  },
  {
    id: "notice-5",
    businessId: "business-1",
    title: "Invoice paid",
    description: "Ali Hassan completed payment for invoice INV-002.",
    read: true,
    href: "/invoices/INV-002",
    date: "2026-11-27",
  },
  {
    id: "notice-6",
    businessId: "business-1",
    title: "Transaction completed",
    description: "A sale to Fatima Ahmed was marked completed.",
    read: true,
    href: "/transactions/SALE-000124",
    date: "2026-11-25",
  },
  {
    id: "notice-7",
    businessId: "business-1",
    title: "Invoice overdue",
    description: "Ahmed Khan has an outstanding balance of PKR 17,000.",
    read: true,
    href: "/transactions/SALE-000128",
    date: "2026-11-24",
  },
  {
    id: "notice-8",
    businessId: "business-1",
    title: "Payment received",
    description: "PKR 18,500 was received by bank transfer.",
    read: true,
    href: "/payments",
    date: "2026-11-23",
  },
];
const teamSeed: Omit<TeamMember, "businessId">[] = [
  {
    ...users[0],
    role: "Owner",
    status: "Active",
    lastActive: "Just now",
    permissions: ["all"],
  },
  {
    id: "team-2",
    name: "Sara Malik",
    email: "sara@alienterprise.example",
    role: "Accountant",
    status: "Active",
    lastActive: "2 hours ago",
    permissions: ["view-transactions", "create-transactions", "view-reports"],
  },
  {
    id: "team-3",
    name: "Usman Ali",
    email: "usman@alienterprise.example",
    role: "Manager",
    status: "Active",
    lastActive: "Yesterday",
    permissions: [
      "view-transactions",
      "create-transactions",
      "manage-parties",
      "view-reports",
    ],
  },
  {
    id: "team-4",
    name: "Faizan Khan",
    email: "faizan@alienterprise.example",
    role: "Staff",
    status: "Invited",
    lastActive: "—",
    permissions: ["view-transactions"],
  },
  {
    id: "team-5",
    name: "Ayesha Tariq",
    email: "ayesha@alienterprise.example",
    role: "Staff",
    status: "Inactive",
    lastActive: "2 weeks ago",
    permissions: ["view-transactions"],
  },
];
export const team: TeamMember[] = teamSeed.map((member) => ({
  ...member,
  businessId: "business-1",
}));
