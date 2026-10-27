import { httpApi } from "./api";
export interface Warehouse {
  id: string;
  name: string;
  active: boolean;
}
export interface StockBalance {
  product_id: string;
  warehouse_id: string;
  product_name: string;
  warehouse_name: string;
  unit: string;
  quantity_milli: string;
  reserved_milli: string;
  value_minor: string | null;
  revision: string;
}
export interface StockLine {
  id: string;
  invoice_id: string;
  display_id: string;
  product_id: string;
  warehouse_id: string;
  product_name: string;
  unit: string;
  kind: "Receive" | "Dispatch";
  expected_milli: string;
  fulfilled_milli: string;
  returned_milli: string;
  reserved_milli: string;
}
export interface StockOverview {
  warehouses: Warehouse[];
  balances: StockBalance[];
  lines: StockLine[];
  canManage: boolean;
}
export interface StockOperation {
  requestId: string;
  kind: string;
  productId: string;
  warehouseId: string;
  targetWarehouseId?: string;
  lineId?: string;
  quantity: number;
  date: string;
  reason: string;
  expectedRevision?: string;
  valueMinor?: number;
}
export interface InventoryReport {
  movements: {
    id: string;
    date: string;
    kind: string;
    product_name: string;
    warehouse_name: string;
    delta_milli: string;
    cost_minor: string | null;
    actor: string;
    reason: string;
  }[];
  valuation: {
    id: string;
    name: string;
    warehouse_name: string;
    quantity_milli: string;
    value_minor: string | null;
  }[];
  operations: {
    id: string;
    actor: string;
    created_at: string;
    payload: StockOperation;
  }[];
}
const base = (b: string) => `/businesses/${b}/stock`;
export const stockService = {
  overview: (b: string) => httpApi.get<StockOverview>(base(b)),
  warehouse: (b: string, name: string) =>
    httpApi.post(base(b) + "/warehouses", { name }),
  archive: (b: string, id: string, active: boolean) =>
    httpApi.patch(base(b) + `/warehouses/${id}`, { active }),
  unit: (b: string, id: string, name: string, factor: number) =>
    httpApi.post(base(b) + `/products/${id}/units`, { name, factor }),
  operation: (b: string, v: StockOperation) =>
    httpApi.post(base(b) + "/operations", v),
  report: (b: string, from: string, to: string, warehouseId: string) =>
    httpApi.get<InventoryReport>(
      base(b) +
        "/reports?" +
        new URLSearchParams({
          from,
          to,
          ...(warehouseId ? { warehouseId } : {}),
        }),
    ),
};
