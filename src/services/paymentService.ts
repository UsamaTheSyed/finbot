import type { Payment } from "../types";
import type { RecordPaymentInput } from "../domain/validation";
import { recordPaymentSchema } from "../domain/validation";
import { payments } from "./mock/data";
import { recordPayment } from "./mock/recordPayment";
import { httpApi, mockResponse, useMock } from "./api";
const getPayments = (businessId: string): Promise<Payment[]> =>
  useMock
    ? mockResponse(() =>
        payments
          .filter((p) => p.businessId === businessId)
          .sort((a, b) => b.date.localeCompare(a.date)),
      )
    : httpApi.get(`/businesses/${encodeURIComponent(businessId)}/payments`);
export const paymentService = {
  list: getPayments,
  getPayments,
  createPayment(
    businessId: string,
    input: RecordPaymentInput,
  ): Promise<Payment> {
    const value = recordPaymentSchema.parse(input);
    return useMock
      ? mockResponse(() => recordPayment(businessId, value))
      : httpApi.post(
          `/businesses/${encodeURIComponent(businessId)}/payments`,
          value,
        );
  },
};
