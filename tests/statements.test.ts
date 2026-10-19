import test from "node:test";
import assert from "node:assert/strict";
import {
  accountStatement,
  statementRangeSchema,
  type StatementEntry,
} from "../src/domain/accountStatement";
import { statementHtml } from "../server/pdf/statementHtml";
const row = (
  id: string,
  date: string,
  amountMinor: number,
): StatementEntry => ({
  id,
  date,
  amountMinor,
  reference: id,
  label: "Movement",
  href: "/payments",
});
test("statement opening, inclusive bounds, refund and advance reconcile without allocation movements", () => {
  const entries = [
    row("sale", "2026-10-10", 4000000),
    row("receipt", "2026-10-11", -5000000),
    row("next-sale", "2026-10-20", 2000000),
    row("refund", "2026-10-21", 100000),
    row("future", "2026-11-01", 900000),
  ];
  const result = accountStatement(entries, {
    from: "2026-10-20",
    to: "2026-10-21",
  });
  assert.equal(result.openingMinor, -1000000);
  assert.equal(result.closingMinor, 1100000);
  assert.deepEqual(
    result.rows.map((r) => r.balanceMinor),
    [1000000, 1100000],
  );
  assert.equal(
    result.openingMinor + result.increasesMinor - result.decreasesMinor,
    result.closingMinor,
  );
  assert.equal(
    accountStatement(entries, { from: "2026-10-12", to: "2026-10-19" })
      .closingMinor,
    -1000000,
  );
  assert.equal(
    accountStatement(entries, { from: "", to: "2026-10-09" }).closingMinor,
    0,
  );
});
test("supplier statement signs, same-day order and empty periods are deterministic", () => {
  const entries = [
    row("b", "2026-10-10", 10000000),
    row("a", "2026-10-10", -8000000),
    row("c", "2026-10-20", -2000000),
  ];
  const statement = accountStatement(entries, { from: "", to: "" });
  assert.deepEqual(
    statement.rows.map((r) => r.id),
    ["a", "b", "c"],
  );
  assert.equal(statement.closingMinor, 0);
  assert.equal(statement.rows[1].balanceMinor, 2000000);
  assert.equal(
    accountStatement(entries, { from: "2026-10-11", to: "2026-10-19" })
      .openingMinor,
    2000000,
  );
  assert.deepEqual(accountStatement([], { from: "", to: "" }).rows, []);
});
test("statement rejects reversed/impossible dates and unsafe paisa", () => {
  for (const range of [
    { from: "2026-02-30", to: "" },
    { from: "2026-11-02", to: "2026-11-01" },
  ])
    assert.equal(statementRangeSchema.safeParse(range).success, false);
  assert.throws(() =>
    accountStatement([row("x", "2026-10-10", Number.MAX_SAFE_INTEGER + 1)], {
      from: "",
      to: "",
    }),
  );
});
test("statement PDF escapes contacts and uses the same closing balance including carried opening", () => {
  const data = {
    ...accountStatement([row("x", "2026-10-10", 100000)], {
      from: "2026-10-20",
      to: "2026-10-21",
    }),
    party: {
      id: "party-1",
      name: "<script>bad</script>",
      kind: "Customer",
      address: "",
      email: "",
      phone: "",
    },
    business: { name: "Ali Enterprise", address: "", email: "", phone: "" },
  };
  const html = statementHtml(data, "");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("PKR 1,000.00"));
  assert.ok(html.includes("No account activity in this period"));
});
