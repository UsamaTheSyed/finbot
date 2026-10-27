import test from "node:test";
import assert from "node:assert/strict";
import {
  converted,
  portion,
  weightedMove,
  operationInput,
} from "../server/domain/warehouse";
import { inventoryManager } from "../server/routes/warehouses";
test("unit conversion preserves exact base quantity and rejects fractional milli-units", () => {
  assert.equal(converted(2500, 25000), 62500);
  assert.throws(() => converted(1, 1));
  assert.throws(() => converted(1000, 0));
});
test("weighted average removal and transfers conserve every paisa", () => {
  const a = weightedMove(3000, 100, -1000, null);
  assert.deepEqual(a, { quantity: 2000, value: 67, cost: 33 });
  assert.deepEqual(weightedMove(0, 0, 1000, a.cost), {
    quantity: 1000,
    value: 33,
    cost: 33,
  });
  assert.deepEqual(weightedMove(2000, 67, -2000, null), {
    quantity: 0,
    value: 0,
    cost: 67,
  });
  assert.throws(() => weightedMove(1, 1, -2, null));
});
test("unknown legacy value is never fabricated by a later receipt", () => {
  assert.equal(weightedMove(1000, null, 1000, 500).value, null);
  assert.equal(weightedMove(1000, null, -1000, null).value, 0);
  assert.equal(weightedMove(0, 0, 1000, 500).value, 500);
});
test("partial receipts and returns conserve rounding", () => {
  assert.equal(
    portion(100, 1, 3) +
      portion(100, 2, 3) -
      portion(100, 1, 3) +
      100 -
      portion(100, 2, 3),
    100,
  );
  assert.equal(portion(67, 1, 2), 34);
  assert.throws(() => portion(100, 4, 3));
});
test("operations reject unsupported types and invalid precision", () => {
  const v = {
    requestId: crypto.randomUUID(),
    kind: "Count",
    productId: "p",
    warehouseId: "w",
    quantity: 0,
    date: "2026-11-28",
    reason: "Physical count",
  };
  assert.equal(operationInput.parse(v).quantity, 0);
  assert.equal(
    operationInput.safeParse({ ...v, quantity: 0.0001 }).success,
    false,
  );
  assert.equal(
    operationInput.safeParse({ ...v, kind: "Delete" }).success,
    false,
  );
});
test("only managers may change inventory setup and valuation", () => {
  inventoryManager("Owner");
  inventoryManager("Admin");
  assert.throws(() => inventoryManager("Staff"));
});
