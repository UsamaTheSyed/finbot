import { createHttpClient, useMock } from "./api";
const api = createHttpClient(import.meta.env?.VITE_API_BASE_URL || "/api", {
  "x-finbot-link": "1",
});
const path = (id: string) =>
  `/businesses/${encodeURIComponent(id)}/bot/telegram`;
export type BotStatus = {
  connected: boolean;
  configured: boolean;
  username: string | null;
};
export type BotLink = { token: string; url: string; expiresAt: string };
export const botService = {
  status: (id: string): Promise<BotStatus> =>
    useMock
      ? Promise.resolve({ connected: false, configured: false, username: null })
      : api.get(path(id)),
  link: (id: string) => api.post<BotLink>(path(id) + "/link", {}),
  unlink: (id: string) => api.delete<void>(path(id)),
};
