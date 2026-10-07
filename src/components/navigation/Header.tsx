import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ChevronDown } from "lucide-react";
import { Breadcrumb } from "./Controls";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Display";
import { Dropdown } from "../ui/Overlays";
import { useAppStore } from "../../store/useAppStore";
import { authService } from "../../services/authService";
import { NotificationPopover } from "../../features/notifications/NotificationPopover";
import { useToast } from "../feedback/Toast";
export function Header({ onSearch }: { onSearch: () => void }) {
  const { pathname } = useLocation();
  const dashboard =
    pathname === "/dashboard" || /^\/invoices\/[^/]+$/.test(pathname);
  const detail = /^\/transactions\/[^/]+$/.test(pathname);
  const navigate = useNavigate();
  const notify = useToast();
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const workspaceId = useAppStore((s) => s.workspaceId);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const logout = useAppStore((s) => s.logout);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: authService.session,
  });
  const segments = pathname.split("/").filter(Boolean);
  const titles: Record<string, string> = {
    "ar-aging": "A/R Aging",
    "profit-loss": "Profit & Loss",
    "cash-flow": "Cash Flow",
  };
  const items = [
    { label: dashboard ? "SaaS" : detail ? "FinBot" : "SaaS accounting" },
    ...segments.map((s, i) => ({
      label: titles[s] || s.charAt(0).toUpperCase() + s.slice(1),
      href:
        i < segments.length - 1
          ? "/" + segments.slice(0, i + 1).join("/")
          : undefined,
    })),
  ];
  return (
    <header className="header">
      <div className="header-left">
        {detail ? (
          <Breadcrumb
            items={items}
            separator={dashboard || detail ? "/" : "›"}
          />
        ) : (
          <>
            <Dropdown
              label={dashboard ? "FinBot workspace menu" : "Select workspace"}
              trigger={
                <>
                  <span className="logo-mark">F</span>
                  <strong className="brand-name">FinBot</strong>
                </>
              }
              items={(session.data?.businesses || []).map((b) => ({
                label: `${b.name}${b.id === workspaceId ? " ✓" : ""}`,
                onSelect: () => setWorkspace(b.id),
              }))}
            />
            <div className="header-divider" />
            {dashboard ? (
              <Dropdown
                label="Select workspace"
                trigger={
                  <span className="workspace-name">
                    {session.data?.businesses.find((b) => b.id === workspaceId)
                      ?.name || "Workspace"}
                    <ChevronDown size={14} />
                  </span>
                }
                items={(session.data?.businesses || []).map((b) => ({
                  label: b.name,
                  onSelect: () => setWorkspace(b.id),
                }))}
              />
            ) : (
              <Breadcrumb
                items={items}
                separator={dashboard || detail ? "/" : "›"}
              />
            )}
          </>
        )}
      </div>
      {dashboard && (
        <Breadcrumb items={items} separator={dashboard || detail ? "/" : "›"} />
      )}
      <div className="header-right">
        <Button variant="ghost" className="header-search" onClick={onSearch}>
          <Search size={16} />
          <span>
            {dashboard
              ? "Search..."
              : detail
                ? "Search everything..."
                : "Search ledger, parties..."}
          </span>
        </Button>
        <NotificationPopover />
        <Dropdown
          label="User menu"
          trigger={
            <>
              <Avatar name={user?.name || "User"} />
              <span className="user-meta">
                <strong>{user?.name}</strong>
                <small>{user?.role}</small>
              </span>
              <ChevronDown size={14} className="user-chevron" />
            </>
          }
          items={[
            { label: "Settings", onSelect: () => navigate("/settings") },
            { label: "Team", onSelect: () => navigate("/team") },
            { label: "Toggle sidebar", onSelect: toggleSidebar },
            {
              label: "Sign out",
              onSelect: () => {
                void authService.logout().finally(() => {
                  queryClient.removeQueries({ queryKey: ["session"] });
                  logout();
                  notify("Signed out.");
                  navigate("/login");
                });
              },
            },
          ]}
        />
      </div>
    </header>
  );
}
