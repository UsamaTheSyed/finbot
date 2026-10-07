/** Visual values verified in Figma 655:1200 and new-file 655:1018 / 782:1341.
 * Breakpoints, focus ring and stacking levels are engineering decisions, not Figma variables. */
export const tokens = {
  colors: {
    brand: "#b88c5d",
    text: "#2c2c2a",
    secondary: "#70706e",
    muted: "#9e9e9a",
    border: "#e8e8e8",
    inputBorder: "#d0d0d0",
    surface: "#ffffff",
    canvas: "#fafafa",
    subtle: "#f7f7f5",
    selected: "#f9f8f6",
    tableHeader: "#f1efe8",
    dashboardCanvas: "#f1efe8",
    dashboardWarning: "#d97706",
    dashboardSuccessBg: "rgba(59,109,17,0.08)",
    success: "#3b6d11",
    successBg: "#ebf5e6",
    warning: "#f59e0b",
    warningBg: "#fef3c7",
    danger: "#a32d2d",
    dangerBg: "#fee2e2",
    info: "#185fa5",
    infoBg: "#e6f0fa",
    reportChartMuted: "#c8c7c1",
    reportBrandBg: "rgba(184,140,93,0.07)",
    reportDangerBg: "rgba(163,45,45,0.08)",
    reportNetBg: "rgba(184,140,93,0.13)",
    partiesCanvas: "#f8f7f3",
    partySuccessBg: "#ebf5dc",
    partyDangerBg: "#fdeaeb",
  },
  typography: {
    family: "Inter, sans-serif",
    size: {
      reportCard: 15,
      reportHeading: 18,
      micro: 10,
      caption: 11,
      small: 12,
      body: 13,
      normal: 14,
      section: 16,
      logo: 20,
      kpi: 24,
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
  },
  spacing: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    10: 40,
    12: 48,
  },
  radius: { small: 4, control: 6, card: 8, large: 12, pill: 100 },
  shadows: {
    report: "0 4px 6px rgba(0,0,0,0.05)",
    none: "none",
    overlay: "0 12px 40px rgb(44 44 42 / 15%)",
    metric: "0 4px 6px rgba(0,0,0,0.03)",
    party: "0 4px 6px rgba(0,0,0,0.08)",
    table: "0 4px 12px rgba(0,0,0,0.03)",
  },
  breakpoints: { laptop: 1024, wideLaptop: 1280, desktop: 1440 },
  zIndex: { base: 0, header: 10, dropdown: 20, overlay: 40, toast: 50 },
  layout: {
    reportChart: 480,
    reportChartHeight: 220,
    cashChartHeight: 120,
    businessLogo: 64,
    header: 64,
    sidebar: 240,
    contentPadding: 24,
    row: 52,
    compactRow: 48,
    control: 44,
    modal: 680,
    search: 600,
    ledger: 420,
    invoiceSummary: 450,
    partyModal: 500,
  },
} as const;
export function applyTokens() {
  const style = document.documentElement.style;
  Object.entries(tokens.colors).forEach(([key, value]) =>
    style.setProperty(`--color-${key}`, value),
  );
  Object.entries(tokens.spacing).forEach(([key, value]) =>
    style.setProperty(`--space-${key}`, `${value}px`),
  );
  Object.entries(tokens.radius).forEach(([key, value]) =>
    style.setProperty(`--radius-${key}`, `${value}px`),
  );
  Object.entries(tokens.layout).forEach(([key, value]) =>
    style.setProperty(`--layout-${key}`, `${value}px`),
  );
  Object.entries(tokens.typography.size).forEach(([key, value]) =>
    style.setProperty(`--font-${key}`, `${value}px`),
  );
  Object.entries(tokens.zIndex).forEach(([key, value]) =>
    style.setProperty(`--z-${key}`, String(value)),
  );
  style.setProperty("--font-family", tokens.typography.family);
  Object.entries(tokens.shadows).forEach(([key, value]) =>
    style.setProperty(`--shadow-${key}`, value),
  );
}
