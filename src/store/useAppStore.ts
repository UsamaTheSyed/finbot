import { create } from "zustand";
import type { User } from "../types";
interface AppState {
  user: User | null;
  workspaceId: string;
  authenticated: boolean;
  sidebarOpen: boolean;
  setSession: (user: User, workspaceId: string) => void;
  setAuthenticated: (value: boolean) => void;
  logout: () => void;
  setWorkspace: (id: string) => void;
  toggleSidebar: () => void;
}
export const useAppStore = create<AppState>((set) => ({
  user: null,
  workspaceId: "",
  authenticated: false,
  sidebarOpen: true,
  setSession: (user, workspaceId) => set({ user, workspaceId }),
  setAuthenticated: (authenticated) => set({ authenticated }),
  logout: () => {
    set({ authenticated: false, user: null, workspaceId: "" });
  },
  setWorkspace: (workspaceId) => set({ workspaceId }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
