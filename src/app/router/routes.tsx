import {
  type RouteObject,
  Navigate,
  Link,
  useRouteError,
} from "react-router-dom";
import { useAppStore } from "../../store/useAppStore";
import { AppShell } from "../layouts/AppShell";
import {
  EmptyState,
  LoadingSkeleton,
  SystemState,
} from "../../components/feedback/States";
import { PageHeader } from "../../components/common/Page";
function Placeholder({ title }: { title: string }) {
  return (
    <div className="page-stack">
      <PageHeader title={title} />
      <EmptyState
        title={`${title} is planned`}
        description="This section will be implemented in a later phase."
        action={<Link to="/dashboard">Go to Dashboard</Link>}
      />
    </div>
  );
}
function RouteError() {
  const error = useRouteError();
  return (
    <SystemState
      kind="server"
      description={error instanceof Error ? error.message : undefined}
      action={
        <a className="button button--primary" href="/dashboard">
          Retry
        </a>
      }
    />
  );
}
function ProtectedShell() {
  const authenticated = useAppStore((state) => state.authenticated);
  return authenticated ? <AppShell /> : <Navigate to="/login" replace />;
}
const placeholders = [["help", "Help"]];
export const routes: RouteObject[] = [
  {
    path: "/login",
    lazy: async () => ({
      Component: (await import("../../features/auth/LoginPage")).LoginPage,
    }),
  },
  {
    path: "/",
    element: <ProtectedShell />,
    hydrateFallbackElement: <LoadingSkeleton />,
    errorElement: <RouteError />,
    children: [
      {path:"inventory",lazy:async()=>({Component:(await import("../../features/inventory/InventoryPage")).InventoryPage})},
      {path:"inventory/:id",lazy:async()=>({Component:(await import("../../features/inventory/ProductDetailPage")).ProductDetailPage})},
      {path:"reminders",lazy:async()=>({Component:(await import("../../features/reminders/RemindersPage")).RemindersPage})},
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: "dashboard",
        lazy: async () => ({
          Component: (await import("../../features/dashboard/DashboardPage"))
            .DashboardPage,
        }),
      },
      {
        path: "transactions",
        lazy: async () => ({
          Component: (
            await import("../../features/transactions/TransactionsPage")
          ).TransactionsPage,
        }),
      },
      {
        path: "transactions/:id",
        lazy: async () => ({
          Component: (
            await import("../../features/transactions/TransactionDetailPage")
          ).TransactionDetailPage,
        }),
      },
      {
        path: "parties",
        lazy: async () => ({
          Component: (await import("../../features/parties/PartiesPage"))
            .PartiesPage,
        }),
      },
      {
        path: "parties/:id",
        lazy: async () => ({
          Component: (await import("../../features/parties/PartyDetailPage"))
            .PartyDetailPage,
        }),
      },
      {
        path: "invoices",
        lazy: async () => ({
          Component: (await import("../../features/invoices/InvoicesPage"))
            .InvoicesPage,
        }),
      },
      {
        path: "invoices/new",
        lazy: async () => ({
          Component: (await import("../../features/invoices/CreateInvoicePage"))
            .CreateInvoicePage,
        }),
      },
      {
        path: "invoices/:id/correct",
        lazy: async () => ({
          Component: (
            await import("../../features/invoices/CorrectInvoicePage")
          ).CorrectInvoicePage,
        }),
      },
      {
        path: "invoices/:id/edit",
        lazy: async () => ({
          Component: (await import("../../features/invoices/EditInvoicePage"))
            .EditInvoicePage,
        }),
      },
      {
        path: "invoices/:id",
        lazy: async () => ({
          Component: (await import("../../features/invoices/InvoiceDetailPage"))
            .InvoiceDetailPage,
        }),
      },
      {
        path: "payments",
        lazy: async () => ({
          Component: (await import("../../features/payments/PaymentsPage"))
            .PaymentsPage,
        }),
      },
      {
        path: "reports",
        lazy: async () => ({
          Component: (await import("../../features/reports/ReportsPage"))
            .ReportsPage,
        }),
      },
      ...(
        [
          "daily",
          "ar-aging",
          "profit-loss",
          "cash-flow",
          "sales",
          "purchases",
          "ap-aging",
        ] as const
      ).map((kind) => ({
        path: `reports/${kind}`,
        lazy: async () => {
          const { ReportDetailPage } =
            await import("../../features/reports/ReportDetailPage");
          return { Component: () => <ReportDetailPage kind={kind} /> };
        },
      })),
      {
        path: "settings",
        lazy: async () => ({
          Component: (await import("../../features/settings/SettingsPage"))
            .SettingsPage,
        }),
      },
      {
        path: "team",
        lazy: async () => ({
          Component: (await import("../../features/team/TeamPage")).TeamPage,
        }),
      },
      {
        path: "notifications",
        lazy: async () => ({
          Component: (
            await import("../../features/notifications/NotificationsPage")
          ).NotificationsPage,
        }),
      },
      ...placeholders.map(([path, title]) => ({
        path,
        element: <Placeholder title={title} />,
      })),
      {
        path: "*",
        element: (
          <SystemState
            kind="missing"
            action={
              <Link className="button button--primary" to="/dashboard">
                Go to Dashboard
              </Link>
            }
          />
        ),
      },
    ],
  },
];
