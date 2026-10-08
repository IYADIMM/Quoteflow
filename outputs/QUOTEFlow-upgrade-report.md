# QuoteFlow product and workflow upgrade report

Date: 8 October 2026

## A. Design thesis

1. Make the next commercial action obvious before showing secondary reporting.
2. Treat currency, margin, approval, revision, expiry, and customer response as first-class information.
3. Use a restrained forest, warm-white, and neutral visual system that suits high-value B2B work.
4. Keep customer documents visually separate from internal cost and profitability information.
5. Preserve seller input and keyboard focus while pricing changes update live.
6. Make fictional demo behavior explicit and keep account records server-authoritative.
7. Use progressive disclosure for detail while keeping tables readable and operational.
8. Adapt structure for mobile rather than shrinking desktop tables.

## B. Before → after

The interface moved from a generic dashboard and CRUD tables to a quotation-specific commercial workspace. The dashboard now prioritizes approvals, deadlines, expiry, follow-ups, recent activity, and per-currency values. The quote builder distinguishes catalog and manual lines, preserves typed values across line changes, displays live margin and policy context, and uses explicit review steps for approval and send. Public documents and the customer portal now retain the exact commercial document after acceptance and work at narrow mobile widths.

The final engineering pass also fixed production blockers outside the visual layer: Prisma schema syntax, its missing approval relation, catalog decimal serialization, acceptance incorrectly changing the commercial version, relative asset paths on deep links, and raw public bearer links being persisted in snapshots.

## C. Files

### Modified

- `app.js`
- `styles.css`
- `index.html`
- `netlify/functions/api.mjs`
- `lib/quote-lines.mjs`
- `prisma/schema.prisma`
- `tests/quote-lines.test.mjs`
- `tests/api.integration.test.mjs`
- `README.md`
- `PRODUCT.md`
- `ARCHITECTURE.md`
- `DEPLOYMENT.md`
- `SECURITY.md`
- `SELLER_HANDOVER.md`

### Added

- `pnpm-lock.yaml`
- Browser verification artifacts and screenshots under `outputs/`
- Local verification/refactoring scripts under ignored `work/`
- Generated Prisma client under ignored `generated/`

### Removed

- None.

## D. Major UX changes

### Dashboard

- Attention-first work queue for overdue follow-ups, approvals, RFQ deadlines, and expiring quotes.
- Per-currency totals prevent misleading cross-currency aggregation.
- Recent customer and quote activity uses plain commercial language.
- Recent quotes show value, margin, status, revision, expiry, and next action.

### RFQ

- Deadlines use human language such as “Due tomorrow” and “Overdue by 1 day.”
- Original request content, extracted items, catalog-match state, and next action are visible together.
- AI extraction remains explicitly labelled “AI-generated — review before using.”

### Quote builder

- Catalog and manual lines have visible types and appropriate editable/read-only fields.
- Catalog cost, unit, and tax are presented as server-verified values.
- Live gross subtotal, discount, net subtotal, tax, total, cost, profit, and margin.
- Minimum-price and margin warnings remain visible beside the affected pricing.
- Typed title, notes, and pricing survive line additions; changing prices retains focus.
- Dirty-state navigation protection, server-validation language, and save feedback.

### Approval

- Approval has an explicit commercial review dialog showing the current saved financial version.
- Approval controls are manager-scoped in the UI and remain enforced by the server.
- Material edits invalidate approval through the existing backend workflow.

### Quote detail and preview

- Customer total, internal cost, profit, margin, revision, source revision, and activity are separated clearly.
- Sent revisions render their saved snapshot.
- Revision, duplication, send, link rotation, and revocation actions are contextual.
- Quote print layout returns to a proper table for A4 output.

### Customer portal

- Professional document treatment with company/customer identity, terms, totals, and currency.
- Mobile actions, readable line cards, accept/decline/question flow, and clear expiry/unavailable state.
- Accepted customers continue to see the document they accepted.
- Demo questions are stored locally instead of calling a nonexistent production endpoint.

### Catalog

- Cost, selling price, minimum selling price, margin, tax, currency, unit, SKU, description, and active state are exposed.
- Currency mismatches are disabled in the catalog picker.
- Fictional CSV import remains available only in demo mode.

### Customers, follow-ups, and analytics

- Customer values are grouped by currency.
- Follow-ups are grouped into overdue, today, upcoming, and completed.
- Analytics filters by currency and labels record-based outcomes honestly.

### Settings, auth, and demo

- Account settings save through the server API; account data is not persisted as a local authoritative cache.
- Workspace loading, switching, recovery deep links, global search, and quick create have usable states.
- Demo is explicitly fictional, browser-local, and isolated from account APIs.

## E. Design system

- Typography: readable 13–16px operational text, larger restrained headings, tabular financial values.
- Colors: forest brand, warm white surfaces, neutral ink, and semantic success/warning/danger/info colors.
- Spacing: compact 4/8-based rhythm with larger separation between commercial sections.
- Components: shell, workspace switcher, command search, metrics, attention rows, data tables, status badges, forms, dialogs, timelines, quote summary, paper document, and portal actions.
- Status: plain-language “Needs approval” and “Declined,” with color used as a supplement.
- Responsive behavior: two-column commercial layouts collapse to one; builder lines and documents become readable cards; sidebar becomes a drawer; print restores A4 document structure.

## F. Accessibility

- Persistent skip link and visible keyboard focus.
- Search/filter labels and explicit labels for line-level controls.
- Keyboard activation for record rows and Ctrl/Cmd+K workspace search.
- Arrow-key navigation within command menus and Escape support.
- Dialog titles connected with `aria-labelledby` and inline `role="alert"` regions.
- Minimum mobile control heights and 16px mobile form inputs.
- Reduced-motion preference support.
- Status information uses text in addition to color.

## G. Responsive verification

- All principal seller screens were checked at 1440px, 768px, and 390px.
- Quote builder and customer portal were exercised at 390px with no horizontal document overflow.
- Mobile document tables become structured line cards; print media restores standard tables.
- Screenshot artifacts cover dashboard, RFQs, quote builder, quote detail, portal, catalog, customers, follow-ups, analytics, and settings.

## H. Performance

- No frontend framework or runtime dependency was added.
- The production static bundle remains three files: `index.html`, `app.js`, and `styles.css`.
- UI updates for quote pricing target summary/line regions instead of rerendering the whole editor on every keystroke.
- Google Fonts remain an optional external request with system sans-serif fallback.

## I. Verification

- `node --test tests/*.test.mjs`: **30 passed, 0 failed**.
- `prisma validate`: **passed** after repairing the datasource/enum schema syntax and approval relation.
- `prisma generate`: **passed**, Prisma Client 7.10.0 generated.
- `node scripts/build.mjs`: **passed**, static assets copied to `dist/`.
- `node work/workflow-check.cjs`: **51 passed, 0 browser errors**.
- Syntax: `node --check app.js` and `node --check netlify/functions/api.mjs`: **passed**.
- Negative search: no SQLite runtime, `/api/demo`, `mailto:`, obsolete demo output, `syncAll`, provider-schema `nullable`, or application TODO/FIXME occurrence remains. `localStorage` is limited to the isolated fictional demo and removal of an obsolete auth-cache key.

The environment did not expose an `npm` executable. `pnpm run build` was also stopped by pnpm’s ignored dependency-build policy. The declared build’s actual two commands, Prisma generation and `node scripts/build.mjs`, both passed independently.

## J. Genuinely unverified

- Applying migrations to a real PostgreSQL instance and exercising real persistence.
- Netlify build/deploy and serverless runtime behavior in a deployed site.
- Real Gemini requests, quotas, timeouts, and provider schema behavior with a production key.
- Real Resend delivery, bounce/complaint handling, and ambiguous delivery recovery.
- DNS, TLS, managed database backups, restores, and operational monitoring.
- Cross-browser assistive-technology testing beyond Chromium keyboard/semantic checks.

## K. Remaining weaknesses and production blockers

- No live database or migration smoke test was possible.
- The send workflow reserves the hashed token and exact snapshot before email submission and blocks ambiguous retries, but a durable transactional outbox would provide stronger recovery from provider/database split-brain failures.
- Public-question rate limiting is database-count based and should use a distributed limiter at scale.
- Browser print is the PDF path; server-generated archival PDFs are absent.
- Billing, object/file storage, telemetry, delivery webhooks, and formal retention tooling are absent.
- The single-file frontend is maintainable at this size but will become costly as the product grows.
- No independent penetration test, accessibility audit, or legal review of acceptance semantics has occurred.

## L. Scores

| Area | Before | After | Basis |
|---|---:|---:|---|
| Product UX | 7.0/10 | 8.8/10 | Commercial hierarchy, workflow clarity, responsive behavior |
| Visual system | 6.8/10 | 8.7/10 | Coherent type, color, spacing, components, documents |
| Accessibility | 5.8/10 | 8.0/10 | Keyboard, labels, focus, alerts, responsive inputs |
| Architecture | 7.2/10 | 8.0/10 | Existing server authority plus repaired Prisma/client boundaries |
| Security | 7.0/10 | 7.8/10 | Hashed links, tenancy, CSRF, permissions; independent review pending |
| Pricing and commercial logic | 7.4/10 | 8.6/10 | Decimal persistence, currency separation, approval/revision clarity |
| Gemini | 6.8/10 | 7.5/10 | Structured mocked coverage; live provider unverified |
| Production completeness | 6.3/10 | 7.4/10 | Build/schema/tests pass; deployment and external services unverified |
| Overall | 7.0/10 | 8.3/10 | Strong sellable-product direction with explicit operational gaps |

QuoteFlow should not yet be called production-ready because live PostgreSQL migrations, deployment, external providers, operational recovery, and independent security testing remain unverified.

## M. Top five screen transformations

1. Quote builder: catalog/manual distinction, live margin, persistent inputs, mobile line cards.
2. Dashboard: attention queue and per-currency commercial overview.
3. Customer portal: trustworthy document, response flow, mobile structure, accepted-document retention.
4. Quote detail: commercial summary, revision provenance, activity, contextual actions.
5. Catalog: complete commercial controls and currency-aware selection.

## N. Top five product-value improvements

1. Sellers can see margin and policy risk while they price, before sending.
2. Managers can see exactly what needs attention and what financial version they approve.
3. Currency values are never presented as a misleading mixed total.
4. Customers receive a clear, stable document and can accept, decline, or ask a stored question.
5. Demo, account, and public-portal boundaries are understandable and technically isolated.
