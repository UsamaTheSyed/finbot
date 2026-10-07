import assert from "node:assert/strict";
import test from "node:test";
import { renderToString } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { routes } from "../src/app/router/routes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "../src/store/useAppStore";
import { ToastProvider } from "../src/components/feedback/Toast";
import { partyService } from "../src/services/partyService";
import { invoiceService } from "../src/services/invoiceService";
import { paymentService } from "../src/services/paymentService";
import { transactionService } from "../src/services/transactionService";
import { reportService } from "../src/services/reportService";
import { authService } from "../src/services/authService";
import React from "react";
const b = "business-1";
// Zustand uses its initial snapshot for SSR; populate it explicitly for these render checks.
useAppStore.getInitialState().workspaceId = b;
useAppStore.getInitialState().authenticated = true;
const cases: [string, string][] = [
  ["/parties", "Ahmed Khan"],
  ["/parties/party-1", "Outstanding Balance"],
  ["/invoices", "INV-001"],
  ["/invoices/INV-001", "Balance Due"],
  ["/invoices/new", "Client &amp; Date Parameters"],
  ["/payments", "Payments Received"],
  ["/dashboard", "Recent Transactions"],
  ["/transactions", "SALE-000128"],
  ["/transactions/SALE-000128", "Payment Breakdown"],
];
test("actual lazy routes load and render all nine pages, header and sidebar", async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  const txFilters = {
    type: "",
    date: "",
    partyId: "",
    status: "",
    page: 1,
    pageSize: 10,
  };
  const entries: [unknown[], () => Promise<unknown>][] = [
    [["parties", b], () => partyService.getParties(b)],
    [["party", b, "party-1"], () => partyService.getPartyById(b, "party-1")],
    [["invoices", b, "list"], () => invoiceService.getInvoices(b)],
    [
      ["invoices", b, "INV-001"],
      () => invoiceService.getInvoiceById(b, "INV-001"),
    ],
    [["invoices", b, "overdue"], () => invoiceService.overdue(b)],
    [["payments", b], () => paymentService.getPayments(b)],
    [["reports", b], () => reportService.list(b)],
    [
      ["transactions", b, "SALE-000128"],
      () => transactionService.get(b, "SALE-000128"),
    ],
    [
      ["transactions", b, { page: 1, pageSize: 5 }],
      () => transactionService.list(b, { page: 1, pageSize: 5 }),
    ],
    [
      ["transactions", b, txFilters],
      () => transactionService.list(b, txFilters),
    ],
    [["session"], () => authService.session()],
  ];
  await Promise.all(
    entries.map(async ([key, get]) => client.setQueryData(key, await get())),
  );
  for (const [url, expected] of cases) {
    const router = createMemoryRouter(routes, { initialEntries: [url] });
    if (!router.state.initialized)
      await new Promise<void>((resolve) => {
        const unsubscribe = router.subscribe((state) => {
          if (state.initialized) {
            unsubscribe();
            resolve();
          }
        });
      });
    assert.equal(
      router.state.errors,
      null,
      `${url} failed to load its route module`,
    );
    const html = renderToString(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    assert.ok(
      html.includes(expected),
      `${url} did not render expected data: ${expected}`,
    );
    assert.ok(html.includes("Main navigation"), `${url} missing sidebar`);
    router.dispose();
  }
  client.clear();
});
