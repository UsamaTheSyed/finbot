import { NavLink, useLocation } from "react-router-dom";
import {
  House,
  Users,
  FileText,
  Receipt,
  Wallet,
  ChartNoAxesColumn,
  Settings,
  CircleHelp,
} from "lucide-react";
const links = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/transactions", label: "Transactions", icon: FileText },
  { href: "/invoices", label: "Invoices/Bills", icon: Receipt },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/reports", label: "Reports", icon: ChartNoAxesColumn },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: CircleHelp },
];
export function Sidebar() {
  const detail = /^\/transactions\/[^/]+$/.test(useLocation().pathname);
  return (
    <aside className="sidebar">
      {detail && (
        <NavLink to="/dashboard" className="sidebar-brand">
          <span className="logo-mark">F</span>
          <strong className="brand-name">FinBot</strong>
        </NavLink>
      )}
      <nav aria-label="Main navigation">
        {links.map(({ href, label, icon: Icon }) => (
          <NavLink
            to={href}
            key={href}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
