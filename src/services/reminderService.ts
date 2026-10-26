import { httpApi } from "./api";
export interface ReminderRecipient {
  id: string;
  name: string;
  state: string | null;
  chat_id: string | null;
  version: string | null;
}
export interface ReminderLog {
  id: string;
  invoice_id: string;
  display_id: string;
  customer: string;
  status: string;
  attempts: number;
  error_code: string | null;
  text: string;
  created_at: string;
}
export interface ReminderPreview {
  text: string;
  previewHash: string;
}
const path = (b: string) => `/businesses/${b}/reminders`;
export const reminderService = {
  list: (b: string) =>
    httpApi.get<{
      configured: boolean;
      recipients: ReminderRecipient[];
      logs: ReminderLog[];
    }>(path(b)),
  link: (b: string, id: string) =>
    httpApi.post<{ url: string }>(`${path(b)}/recipients/${id}/link`, {}),
  approve: (b: string, id: string, version: string) =>
    httpApi.post(`${path(b)}/recipients/${id}/approve`, { version }),
  disconnect: (b: string, id: string) =>
    httpApi.delete(`${path(b)}/recipients/${id}`),
  preview: (b: string, invoiceId: string, template: string) =>
    httpApi.post<ReminderPreview>(`${path(b)}/preview`, {
      invoiceId,
      template,
    }),
  queue: (b: string, data: unknown) => httpApi.post(path(b), data),
  cancel: (b: string, id: string) =>
    httpApi.post(`${path(b)}/${id}/cancel`, {}),
};
