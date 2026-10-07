# FinBot Phase 2 — development summary

Parties, Invoices and Payments are implemented in the existing application. Reports, Settings, Team and backend work have not started. Implementation is ready for local review; browser acceptance and rendered Figma comparison remain open.

## 1. Screens implemented

- Parties List: customer/supplier tabs with actual fixture counts, contact data, signed balances, View and Edit.
- Party Detail: financial summary; Overview, Transactions, Invoices, Payments and Statement tabs; linked records; edit/payment/invoice actions.
- Add/Edit Party: one shared, prefilled form in the Figma-sized dialog.
- Invoices List: All/Draft/Sent/Paid tabs, financial totals, linked rows and actions.
- Invoice Detail: dates, party information, items, totals, payment history, payment recording and draft issuance.
- Create Invoice: customer selection, dates, reference, dynamic items, quantity/unit/rate/tax, discount, initial payment, notes, terms, draft save and preview.
- Payments List: received/sent/pending totals; tabs, date/party filters, pagination and payment detail.
- Record Payment: received/sent flow with optional invoice allocation and balance validation.

Dashboard and Transactions remain implemented. Dashboard Payment now opens the new payment flow. Existing transaction payment recording also updates linked invoices and party balances.

## 2. Routes added or activated

| Route | Result |
| --- | --- |
| `/parties` | Parties List |
| `/parties/:id` | Party Detail |
| `/invoices` | Invoices List |
| `/invoices/new` | Create Invoice |
| `/invoices/:id` | Invoice Detail |
| `/payments` | Payments List |

Existing `/dashboard`, `/transactions`, `/transactions/:id` and default redirect remain. Missing entity IDs show a record-not-found state. Reports, Settings, Team, Notifications and Help retain planned-feature placeholders.

## 3. Components created

`PartyFormDialog`, `PartyStatement`, `InvoiceDocument`, `InvoiceItemFields`, `RecordPaymentDialog`, shared `QueryState`, `Money`, `FinancialSummary`, `PaymentHistory`, `PartyTransactions` and `InvoiceRows`. Payment table pagination and payment details stay within their feature.

New presentation files remain below 300 lines each. Shared finance query hooks centralize query keys and mutation invalidation. New scoped styles live in `src/styles/phase-two.css`; verified visual values extend `src/styles/tokens.ts`.

## 4. Existing components reused

Button, Input, Select, Textarea, DatePicker, Badge, StatusBadge, Card, Table, TableHeader, TableRow, Modal, Dropdown, Tabs, Pagination, PageHeader, Toast, Alert, EmptyState, ErrorState, LoadingSkeleton and CurrencyDisplay. Radix continues to provide keyboard-aware dialogs, menus and tabs.

The existing shell and navigation stay shared. Invoice Detail/Create use the existing workspace-header variant found in their Figma frames. Phase 1 visual styles were not redesigned.

## 5. Services added or changed

- `partyService`: list/get/create/update, workspace checks, derived balances and related records. Party type cannot change after financial records exist.
- `invoiceService`: list/get/create/update/overdue. Drafts remain unposted; issuance creates one transaction. Initial payment creates a linked payment record. Only drafts can be updated.
- `paymentService`: list/create through one shared, validated ledger operation.
- `transactionService`: payment actions use that same operation; edits keep linked invoice dates/notes consistent; session-only deletion removes dependent invoice/payment records.
- `reportService`: existing Dashboard snapshot now derives receivables/payables from party balances and applies changes in completed payments to the opening cash fixture. No report pages or reporting engine were built.
- `services/mock/ledgerSelectors.ts`: scoped entity lookup, IDs, status, balances and the invoice-to-transaction adapter.
- `services/mock/recordPayment.ts`: validates party, invoice, direction, date and balance before mutating linked records.

Queries/mutations continue through services and the existing mock/API abstraction. UI files do not import fixture arrays. Mutations invalidate Parties, Party Detail, Invoices, Payments, Transactions and Dashboard report queries without a page reload.

## 6. Types added or changed

Party now includes email, NTN, address and payment terms. Added `PartySummary`, `PartyDetail`, `InvoiceItem` and `InvoiceStatus`; expanded Invoice and Payment with entity references and integer money fields. Transactions retain their existing rupee interface; a nullable tax rate represents mixed-rate invoices accurately.

Relationships are explicit: Invoice → party/transaction; Payment → party and optional invoice/transaction; Transaction → party. No unrelated copies are used to represent financial links.

## 7. Financial utilities created

`toMinor`, `fromMinor`, `sumMinor`, `multiplyMinor`, `percentMinor`, `safeMinor` and `formatPKR` in `src/utils/money.ts`.

`calculateLineSubtotal`, `calculateLineTax`, `calculateLineTotal`, `calculateInvoiceSubtotal`, `calculateInvoiceTax` and `calculateInvoiceTotal` in `src/domain/invoiceCalculations.ts`.

Amounts for new invoices/payments use integer paisa. BigInt intermediates avoid floating-point arithmetic drift. Quantity supports three decimal places; rupee inputs and tax percentages support two. Line subtotals and tax round half-up before summing. Unsupported precision, unsafe integer overflow and lossy legacy conversions are rejected. Discounts apply after per-line tax and cannot exceed subtotal. This is a documented mock calculation policy, not a tax engine.

`buildStatement` derives signed movements and running balances from transactions and completed payments. `buildInvoicePreview` reuses the calculation rules without persisting a record.

## 8. Forms and validation implemented

React Hook Form + Zod cover Party, Invoice and Record Payment forms. Validation includes required names/customer/items, optional valid email, real calendar dates, due date ordering, positive quantities, nonnegative rates, bounded tax/discount, decimal precision, and positive payments.

Services additionally reject overpayment, cross-workspace access, mismatched party/direction, payments before a linked transaction, payments against drafts, and a second issuance of an already-issued draft. Drafts cannot carry an initial payment. Dynamic item removal keeps at least one item. Mutation failures remain visible in the dialog; pending submission buttons are disabled.

## 9. Tests performed

- 15 tests pass: the existing five domain tests; nine financial/service tests; one server-render smoke test covering all nine implemented page routes plus Header and Sidebar.
- Coverage includes paisa rounding, invalid dates/amounts, invoice creation, partial/full settlement through both payment entry points, atomic rejection, workspace isolation, drafts, initial/on-account payments, supplier balances, mixed taxes, refunds, party editing and dependency cleanup.
- ESLint checks TypeScript, Hooks usage and the UI-to-mock import boundary with zero warnings allowed.
- Playwright discovery lists 18 cases: the existing three scenarios plus three new scenarios, each at 1440, 1280 and 1024 px.
- New browser scenarios cover party create/edit, invoice preview/create, overpayment/full settlement, statement consistency, draft issuance, filtering/pagination and missing records.

Browser execution and screenshots remain unverified here. The connected browser previously rejected `http://127.0.0.1:5173` with `ERR_BLOCKED_BY_CLIENT`. No alternate browser or network bypass was used. Server rendering verifies render paths; it does not prove keyboard behavior, DOM interactions, CSS layout or absence of browser console errors.

The user reported six passing and three failing cases in the earlier nine-case suite. The failure list alone does not reveal the assertion or cause. Those three failures remain unresolved, and this package does not claim otherwise. The original scenarios have not been weakened or removed.

## 10. Build/type-check status

- `npm run typecheck`: pass.
- `npm run lint`: pass, zero lint warnings.
- `npm test`: 15 passed, zero failed.
- `npm run build`: pass; includes strict TypeScript checking.
- `npx playwright test --list`: 18 cases discovered.

Vite still reports a JavaScript chunk above 500 kB (approximately 605 kB minified / 184 kB gzip). The warning is not suppressed. Route-level code splitting is a performance follow-up before production. npm also emits an environment-level `http-proxy` configuration warning; it is not an application compile failure.

ESLint, `@eslint/js`, `typescript-eslint` and React Hooks lint rules were added as development dependencies. The application framework and existing dependencies were preserved; exact versions are locked in `package-lock.json`.

## 11. Figma inspection and inconsistencies

Source file: [FinBot Figma](https://www.figma.com/design/3jjUDQgHWXPqD3L6yy6thh/Brand-web--Copy---Copy-?node-id=4001-902).

Full design context and screenshots were inspected for these frames before implementation:

| Screen | Node | Key verified values |
| --- | --- | --- |
| Parties | `655:1502` | 3-column grid, 24px gap, 16px card padding, 8px radius, 0/4/6 shadow at 8% |
| Party Detail | `782:1159` | 24px name, 20px metric padding, 420px right column |
| Add Party | `655:2403` | 500px dialog, 20px body padding, 44px controls, 6px input radius |
| Invoices | `655:1812` | 12px card/table radius, 16px metric padding, 24px horizontal table padding |
| Invoice Detail | `782:1473` | Warm canvas, 20px information cards, 450px summary column |
| Create Invoice | `782:1661` | 450px summary column, 40px form controls, 36px item controls |
| Payments | `782:906` | 44px table header, 52px rows, three summary cards and pagination |

Shared values include Inter, bronze `#b88c5d`, text `#2c2c2a`, border `#e8e8e8`, 240px sidebar, 64px header and 24px content padding. Laptop reflow and horizontal table scrolling are implementation decisions because separate laptop frames were not supplied.

Discrepancies handled explicitly:

1. Sidebar contents and header placement vary between frames. One canonical navigation hierarchy is retained; invoice form/detail use the existing workspace-header variant.
2. Parties counts (42/24/18) do not match the visible cards. The application displays counts of its actual ten initial fixtures, updating after creation.
3. Linked amounts conflict between Figma list/detail screens. Ahmed Khan remains PKR 42,000 total, PKR 25,000 paid and PKR 17,000 due across linked records.
4. Invoice Detail line values total PKR 54,000 while its displayed subtotal is PKR 53,500. Its displayed tax/discount/grand total also do not reconcile. Application totals come from the items instead of copying inconsistent figures.
5. The existing first transaction showed 5% tax as PKR 2,000 on PKR 42,000. Tax and discount are now PKR 2,100 each, preserving the PKR 42,000 total while reconciling the percentage.
6. Receivables appear red in parts of the design; the brief explicitly requires positive party receivables green and negative payables red. Party balances follow the brief.
7. No separate Record Payment modal was found in the mapped frames. It reuses the established Modal and Fields with the requested fields.
8. Figma says “Create & Send”; the implemented button says “Create Invoice”, because email/messaging is deferred.
9. The payment table's sample type values mix Sale/Purchase with payment direction. The implementation uses Received/Sent as requested.
10. Required actions absent from a given frame are exposed using existing controls: invoice action menu, Create Invoice/Record Sale on Party Detail and item removal.

Source values were mapped into code, but rendered pixel equivalence has not been verified. The unavailable avatar remains an initials fallback; exact exported icon fidelity is not claimed.

## 12. Assumptions made

- In-memory mock session only; refreshing restores fixtures.
- Stable fixture date: 28 November 2026; defaults and overdue status use that clock.
- New invoices are customer sales. Existing supplier bill fixtures can receive outgoing payments; new supplier bill creation is deferred.
- “Sent” is the issued state, not evidence of a sent message. Partially paid overdue invoices retain Partial status; overdue selection also uses due date and remaining balance.
- On-account payments can create customer credit/supplier advances; they do not auto-allocate to invoices. Received/Sent movements adjust balances with the corresponding sign.
- Pending and Failed payments appear in lists but are not posted.
- Statement is an on-screen account ledger; no downloadable PDF is generated.
- Total Cash is a combined mock funds snapshot across methods, not a cash-only account or reconciled banking balance.
- Export, PDF, Print, Reminder, Statement Download and Record Sale show planned-feature feedback. They do not pretend to complete an external action.

## 13. Known limitations

Live browser acceptance and precise visual comparison are pending. The three earlier reported browser failures require their error details or trace to diagnose. No backend, persistent storage, actual authentication, payment gateway, email/WhatsApp/Telegram, PDF generation, statutory tax logic or real report calculations exist.

Invoice editing is limited to draft service support and issuance; there is no separate Edit Invoice screen in this phase. Historical on-account payments cannot be reallocated later yet. Session-only transaction deletion cascades demo records and is not a production accounting audit policy. The JavaScript bundle needs splitting before production optimization.

## 14. Recommended next development phase

First complete browser acceptance at all three widths and compare screenshots against Figma, including diagnosis of the original three failures. Then agree the next product scope, such as Reports and Settings. Backend contracts, persistence and an auditable ledger should be specified before production use. No next-phase screens were started automatically.

## Local review commands

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Use a clean extracted folder and stop the previous Vite server so the browser opens this updated source. For a failing browser case, retain its full assertion output and `test-results/` trace; a count of failures alone cannot identify the defect.
