import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "../../components/navigation/Header";
import { Sidebar } from "../../components/navigation/Sidebar";
import { GlobalSearch } from "../../features/search/GlobalSearch";
import { useAppStore } from "../../store/useAppStore";
export function AppShell() {
  const [search, setSearch] = useState(false);
  const sidebar = useAppStore((s) => s.sidebarOpen);
  const location = useLocation();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    document.title = `FinBot — ${location.pathname.split("/")[1] || "Dashboard"}`;
  }, [location.pathname]);
  const variant =
    location.pathname === "/dashboard" ||
    /^\/invoices\/[^/]+$/.test(location.pathname)
      ? "dashboard"
      : /^\/transactions\/[^/]+$/.test(location.pathname)
        ? "detail"
        : "default";
  return (
    <div className={`app-shell app-shell--${variant}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header onSearch={() => setSearch(true)} />
      <div className={`app-body ${sidebar ? "" : "sidebar-hidden"}`}>
        {sidebar && <Sidebar />}
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={search} onOpenChange={setSearch} />
    </div>
  );
}
