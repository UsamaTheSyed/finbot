> Historical initial inspection. Full Dashboard and Transaction Detail context is now available from the new file; see [verification-update.md](verification-update.md) for the current status.

# Figma inspection — before implementation
Source: MhAa3QpnuICXqjLSsOe5B2 / 2031:902.
23 frames mapped in figma-screen-map.json. 19 desktop screens (including Login and Global Search), 2 standalone modals, 2 component boards.

## Verified reference
Transactions 655:1200: full generated context and screenshot inspected. Inter; brand #b88c5d; text #2c2c2a, secondary #70706e, muted #9e9e9a; borders #e8e8e8 / input #d0d0d0; page #fafafa; search #f7f7f5; selection #f9f8f6. Header 64px, sidebar 240px, content padding/gaps 24px. Buttons/inputs radius 6px; search/logo 8px; pill badges. Filters 160/180/160/160px, height 44px, gap 16px. Table rows 52px; columns 150/120/flexible/180/150/80px. All specified widths are for 1440px canvas.

## Metadata-grounded targets
Dashboard 655:1018: 3 KPI cards (368px, 20px padding), two 564px tables with 24px gap, 48px rows; centered quick actions below. Detail 782:1341: 24px content padding; 76px metadata card; 708px items table and 420px summary separated by 24px. Title/actions row then metadata then breakdown. Unit is included with quantity in the design.
Search 783:2918: 600px command palette with grouped entities, footer keyboard hints. Notifications 783:2780: standalone desktop screen. Add transaction 655:2327: 680x884 modal. Empty states 783:3190: icon, title, explanatory text, action. System states 783:3248: skeletons, connection/403/404/500 errors, toasts, confirm/delete dialogs. No standalone drawer identified in the supplied group.
Reports: Overview, Daily Summary, AR Aging, Profit & Loss, Cash Flow; reserved for later.

## Access limitation
Figma Starter-plan MCP quota blocked full context for Dashboard and Detail. Do not claim pixel accuracy for these pages or unseen component states. Their layout uses retrieved metadata and shared Transactions tokens. No attempt to bypass quota. Visual verification against their screenshots remains pending.

## Inconsistencies and implementation decisions
- Three different shells: Dashboard workspace + center crumb; Transactions left crumb + Haris Munir; Detail sidebar brand + Mike Pence. Keep one shared Transactions shell; workspace selector available from logo menu. Use one demo user. This is a documented reconciliation, not a newly designed shell.
- Detail items header is 513px while body is 708px: align header to body columns rather than reproduce broken alignment.
- List Ahmed Khan amount 25,000 differs from detail total 42,000 (paid 25,000). Keep coherent records: SALE-000128 total 42,000 across routes. Other fixture rows retain supplied names/values.
- Dashboard uses Indian grouping 5,00,000 while other pages use 500,000. Standardize en-PK with explicit PKR prefix.
- Pagination says 5 pages but only 10 rows are drawn. Add deterministic fixtures for real pagination.
- Desktop breakpoints 1280/1024 and overlay z-index are engineering decisions requested by brief; not extracted Figma tokens.
- Focus/error/disabled/loading and drawer styling inherit verified tokens; exact variants cannot yet be verified. No invented chart on Dashboard (none is drawn).
- PDF download is explicitly deferred; button explains unavailable feature. Mock mutations are session-only and never process real payments.
