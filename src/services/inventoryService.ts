import { httpApi } from "./api";
export interface Product {
  id: string;
  sku: string;
  name: string;
  unit: string;
  stock_milli: number;
  minimum_milli: number;
  active: boolean;
}
export interface StockMovement {
  id: string;
  date: string;
  kind: string;
  delta_milli: number;
  reason: string;
  actor: string;
  invoice_id: string | null;
}
const path = (b: string) => `/businesses/${b}/inventory`;
export const inventoryService = {
  update: (b: string, id: string, data: unknown) =>
    httpApi.patch(`${path(b)}/${id}`, data),
  list: (b: string) => httpApi.get<Product[]>(path(b)),
  detail: (b: string, id: string) =>
    httpApi.get<{ product: Product; movements: StockMovement[] }>(
      `${path(b)}/${id}`,
    ),
  create: (b: string, data: unknown) =>
    httpApi.post<{ id: string }>(path(b), data),
  adjust: (b: string, id: string, data: unknown) =>
    httpApi.post(`${path(b)}/${id}/adjustments`, data),
};
