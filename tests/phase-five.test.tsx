import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "../src/components/feedback/States";

test("Figma empty-state presets render their exact copy and icon treatment", () => {
  const cases = [
    ["transactions", "No transactions yet", "business ledger"],
    ["parties", "No parties added", "customers and suppliers"],
    ["invoices", "No invoices created", "professional billing"],
    ["payments", "No payments recorded", "money coming in"],
    ["reports", "No reports available", "business reports"],
    ["search", "No results found", "different keywords"],
  ] as const;

  for (const [kind, title, description] of cases) {
    const html = renderToStaticMarkup(<EmptyState kind={kind} />);
    assert.match(html, new RegExp(title));
    assert.match(html, new RegExp(description));
    assert.match(html, /empty-state__icon/);
  }
});

test("empty-state callers can override copy and provide an action", () => {
  const html = renderToStaticMarkup(
    <EmptyState
      kind="reports"
      title="No report for this period"
      description="Choose another month."
      action={<button>Change period</button>}
    />,
  );
  assert.match(html, /No report for this period/);
  assert.match(html, /Choose another month/);
  assert.match(html, /Change period/);
});
