import { businesses, users } from "./mock/data";
import { httpApi, mockResponse, useMock } from "./api";
import type { Business, User } from "../types";
export const authService = {
  session: (): Promise<{ user: User; businesses: Business[] }> =>
    useMock
      ? mockResponse(() => ({ user: users[0], businesses }))
      : httpApi.get("/session"),
  login: (
    email: string,
    password: string,
  ): Promise<{ user: User; businesses: Business[] }> =>
    useMock
      ? mockResponse(() => {
          if (!email.trim() || password.length < 6)
            throw new Error("Enter a valid email and password.");
          return { user: users[0], businesses };
        })
      : httpApi.post("/auth/login", { email, password }),
  logout: (): Promise<void> =>
    useMock ? Promise.resolve() : httpApi.post("/auth/logout", {}),
};
