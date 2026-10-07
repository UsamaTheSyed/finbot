import type { Notification } from "../types";
import { notifications } from "./mock/data";
import { httpApi, mockResponse, useMock } from "./api";
export const notificationService = {
  list: (businessId: string): Promise<Notification[]> =>
    useMock
      ? mockResponse(() =>
          notifications.filter((n) => n.businessId === businessId),
        )
      : httpApi.get(`/businesses/${businessId}/notifications`),
  markRead: (businessId: string, id: string): Promise<void> =>
    useMock
      ? mockResponse(() => {
          const n = notifications.find(
            (n) => n.id === id && n.businessId === businessId,
          );
          if (n) n.read = true;
        })
      : httpApi.patch(`/businesses/${businessId}/notifications/${id}`, {
          read: true,
        }),
  markAllRead: (businessId: string): Promise<void> =>
    useMock
      ? mockResponse(() => {
          notifications
            .filter((n) => n.businessId === businessId)
            .forEach((n) => {
              n.read = true;
            });
        })
      : httpApi.patch(`/businesses/${businessId}/notifications`, {
          read: true,
        }),
};
