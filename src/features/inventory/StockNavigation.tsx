import "../../styles/phase-three.css";
import { NavLink } from "react-router-dom";
export function StockNavigation() {
  return (
    <nav className="report-tabs no-print" aria-label="Inventory navigation">
      {[
        ["/inventory", "Products"],
        ["/inventory/warehouses", "Warehouses"],
        ["/inventory/operations", "Stock Operations"],
        ["/inventory/reports", "Stock Reports"],
      ].map(([to, name]) => (
        <NavLink key={to} to={to} end>
          {name}
        </NavLink>
      ))}
    </nav>
  );
}
