import type { InvoicePdfData } from "../../server/pdf/invoiceData";
export function pdfFixture(): InvoicePdfData {
  return {
    business: {
      name: "Ali Enterprise",
      phone: "03001234567",
      email: "owner@alienterprise.pk",
      address: "Karachi, Pakistan",
      ntn: "1234567",
    },
    party: {
      name: "Ahmed Khan",
      kind: "Customer",
      phone: "03007654321",
      email: "ahmed@example.com",
      address: "Office 5, Block C, Lahore",
      ntn: "9876543",
    },
    invoice: {
      id: "INV-internal",
      displayId: "INV-000020",
      businessId: "business-1",
      transactionId: "SALE-1",
      partyId: "party-1",
      date: "2026-10-17",
      dueDate: "2026-10-30",
      reference: "ORDER-100",
      items: [
        {
          id: "l1",
          item: "Rice Bags Premium",
          description: "Premium quality rice",
          quantity: 2,
          unit: "Bag",
          rateMinor: 100000,
          taxPercent: 5,
        },
        {
          id: "l2",
          item: "Cooking Oil",
          description: "Sealed carton",
          quantity: 1,
          unit: "Carton",
          rateMinor: 60000,
          taxPercent: 0,
        },
      ],
      subtotalMinor: 260000,
      taxMinor: 10000,
      discountMinor: 10000,
      totalMinor: 260000,
      paidMinor: 60000,
      balanceMinor: 200000,
      status: "Partial",
      notes: "Please quote the invoice number with your payment.",
      terms: "Payment due within the agreed term.",
      daysOverdue: 0,
    },
    payments: [
      {
        date: "2026-10-17",
        amountMinor: 60000,
        method: "Bank Transfer",
        reference: "HBL-100",
      },
    ],
  };
}
