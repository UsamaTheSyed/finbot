import { useAppStore } from "../store/useAppStore";
export const useWorkspace = () => useAppStore((s) => s.workspaceId);
