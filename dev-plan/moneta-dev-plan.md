# Moneta — Development Plan

> Scope of this first pass: **budget vs. actuals**. Define budgets (annual and
> per-project), and track **committed** and **spent** against them. Taskman is a
> read-only data source for operational actuals. Other budget management areas
> (full commitment/forecast workflow, payment processing, multi-source
> consolidation) are noted as future phases but are **out of scope for v1**.

---

## 1. Goals & non-goals

### v1 goals (core)
- Model an EU-agency budget structure (budget lines, with annual appropriations).
- Record **commitments** (encumbrances) and **actuals/spend** against budget lines.
- Show, per budget line / title: **budget → committed → spent → remaining**, with
  consumption rates and over-/under-spend alerts. *This budget-vs-actuals picture
  is the application's core.*

### v1 features (built on the core)
- **Invoice verification.** Each month a consultant company submits an invoice
  stating a budget line and an amount. Moneta cross-checks it against
  Taskman-derived cost for the same period/budget line, shows the variance, and an
  officer marks it verified or disputed — validating consultant spend before it's
  booked as an actual. See §5.
- **Taskman actuals ingestion.** Compute consultant cost from Taskman
  (`hours/8 × rate`, attributed via `(Project, Category) → MPS code → budget line`)
  to feed the verification feature; one reliable monthly (or on-demand) sync.

### v1 non-goals
- Writing back to Redmine/Taskman.
- Multi-year forecasting, carry-over (C8) automation, assigned-revenue (C4/C5)
  handling — modelled in the schema but not automated in v1.
- Replacing the agency's official accounting system (ABAC/SAP). Moneta is a
  **monitoring and planning** layer, not the system of record for payments.
- Procurement/contract management.

---

## 2. Domain model (EU agency budget)

EU agency budgets (EEA included) follow a standard shape. Moneta should speak
this language from day one so the data maps cleanly onto official reporting.

- **Budget structure (hierarchy):** `Title → Chapter → Article → Item`. A
  bottom-level line is a **budget line** (a.k.a. budget position). Conventionally:
  - Title 1 — Staff expenditure
  - Title 2 — Buildings, equipment, administrative expenditure
  - Title 3 — Operational expenditure  ← *most Taskman-linked spend lands here*
- **Appropriation types:** every budget line carries two figures per year:
  - **CA — Commitment Appropriations** (ceiling for new legal commitments)
  - **PA — Payment Appropriations** (ceiling for payments in the year)
- **Lifecycle of a euro:**
  `Appropriation → Commitment (budgetary/legal) → Payment (actual)`
  - **Committed** = sum of commitments booked against the line.
  - **Spent / Actual** = sum of payments/expenditure.
  - **Remaining (available to commit)** = CA − committed.
  - **Remaining (available to pay)** = PA − paid.
- **Credit origins (model now, automate later):** C1 (current-year), C8
  (carry-over), C4/C5 (assigned revenue). v1 can default everything to C1.
- **Budget cycle:** annual, with amending budgets/transfers mid-year. Moneta must
  treat the budget as **versioned** (initial budget + amendments) rather than a
  single mutable number.

### How Taskman maps in
Taskman has **no budget concepts** — it only knows projects, issues, time
entries, developers and rates. What it gives Moneta:
- **Computed operational cost**: `hours / 8 × daily_rate` per developer (the cost
  logic already proven in Taskman's `tab_spent_time`), split by
  `payment_performed_class` (intra-/extra-muros). This is the *reference* used to
  verify consultant invoices — see §5; it is not itself booked spend.
- **Mapping key** to reach a budget line: **`(Project, Category)`** (see the MPS
  section below) — *not* `payment_ref_id`, which an earlier draft assumed.

### MPS codes — the central modelling problem
This is the crux of Moneta. **MPS codes do not exist in Taskman** — they are a
Moneta-owned concept. The structure is grounded in a real reference spreadsheet
(`dev-plan/2605-61006 ALTIA TMN2000.xlsx`, an Altia invoice breakdown) whose
`Codes to MPS` and `CODES` tabs reveal the actual model:

```
Taskman time entry (Project + Category)
   └─[Codes to MPS]→  rollup code (e.g. 1.1.0)        ≈ budget line
        └─[CODES]→     detailed MPS (e.g. 1.1.20) + Level-3 label
                        scoped per FISCAL YEAR and per CONSULTANT
```

**Two-level code hierarchy** (`CODES` tab):
- **Rollup code** (`1.1.0`, `2.1.0`, `4.3.9`, …) — the grouping level; behaves as
  the **budget line**. Leading digit looks like an EU budget Title (1–4).
- **Detailed MPS code** (`1.1.20`, `4.3.25`, …) with a **Level-3 label**. The
  column header is literally **"2025 MPS"** — confirming **codes are
  fiscal-year-scoped and change every year**.
- A **rollup has many detailed MPS codes** → "a budget line has many MPS codes".
- Detailed codes are **per consultant** (Tracasa, Bilbomatica, Altia…): the same
  rollup expands to a different detailed-code set per contractor.

**Attribution rule** (`Codes to MPS` tab): the join from Taskman is
**`(Project, Category) → rollup code`** — *not* `payment_ref_id` as earlier
assumed. Edge cases the rule already encodes:
- `x` / `X` → unmapped / excluded from MPS (don't count against budget).
- A free-text note column for exceptions (e.g. *"Tracasa – use 6.4.2"*,
  *"Charged to core when no ENV contract"*, consultant tags like `MLW`).

**Source of truth:** the authoritative MPS list lives in the EEA **Management
Plan** app (Entra SSO); the spreadsheet above is the working copy. Moneta should
import the code list + the `(Project, Category)→code` mapping (per fiscal year),
own it, and apply it automatically — replacing today's manual spreadsheet step.

So: a Taskman time entry's cost is attributed via `(Project, Category)` to a
rollup/MPS code, which rolls up to its **budget line**, for a given **fiscal
year** and **consultant**.

---

## 3. Architecture

**React SPA frontend + ASP.NET Core Web API backend, SQLite to start.** Moneta is
a fresh codebase; it should not inherit Taskman's debt (schema scattered across
`CREATE TABLE IF NOT EXISTS` + try/except `ALTER TABLE`, raw SQL in UI code,
business logic inside render functions, no migrations).

```
┌──────────────────────────────────────────────┐
│  React SPA (TypeScript)                        │   browser
│  - budget views, MPS drill-down, reconciliation│
│  - talks to backend over REST/JSON             │
└──────────────────────────────────────────────┘
                     │  HTTPS / JSON
                     ▼
┌──────────────────────────────────────────────┐
│  ASP.NET Core Web API (.NET 8/9, C#)           │
│  ┌──────────────────────────────────────────┐ │
│  │ API / Controllers — DTOs in/out          │ │
│  ├──────────────────────────────────────────┤ │
│  │ Application / Services — budget math,     │ │
│  │ aggregation, Taskman cost calc, reconcile │ │
│  ├──────────────────────────────────────────┤ │
│  │ Domain — entities, invariants             │ │
│  ├──────────────────────────────────────────┤ │
│  │ Infrastructure — EF Core DbContext,       │ │
│  │ RedmineClient (HttpClient), importers     │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
        │                         │
   SQLite (EF Core)          Taskman/Redmine API
   → SQL Server/Postgres     (read-only)
     later
```

### Stack
- **Frontend:** React + **TypeScript** (Vite). Data fetching via React Query;
  a component library (e.g. MUI) for the data-grid-heavy budget tables. The
  EEA palette from Taskman (`#007B6C` green, `#2E3E4C` livid, `#DAE8F4`) can be
  reused as the theme.
- **Backend:** **ASP.NET Core Web API** (.NET 8 or 9, C#). Clean layering:
  Controllers → Application/Services → Domain → Infrastructure.
- **ORM + migrations:** **EF Core** with code-first **migrations** — every schema
  change versioned and reviewable. This is the single biggest improvement over
  Taskman's ad-hoc DDL.
- **DB:** **SQLite to start** (simple, file-based, fine for early single-/low-user
  use). Keep it swappable: program against EF Core abstractions and avoid
  SQLite-specific SQL, so moving to **SQL Server or PostgreSQL** later is a
  provider/connection-string change plus re-tested migrations.
  - ⚠️ **SQLite + money gotcha:** EF Core maps `decimal` to SQLite `TEXT` by
    default, which breaks `SUM`/ordering done in SQL. Mitigations: do money
    aggregation in the application layer, or store integer cents (`long`). Decide
    early — this is exactly the kind of thing that's painful to retrofit.
- **Money:** `decimal` in C# (never `double`/`float`). Taskman uses floats for
  hours/cost — acceptable there, not for budget euros.
- **Auth:** open question. An EU agency may require **EU Login / Microsoft Entra
  (Azure AD) SSO** via OpenID Connect; ASP.NET Core supports this natively.
  Taskman's Firebase email/password is a fallback if SSO isn't available for v1.
- **Deploy:** containerise API + a static build of the React app (or serve the
  SPA from a CDN / the API's static files). Reuse Taskman's GitHub Actions →
  registry → VM pattern. The SQLite file needs a persistent volume **and a backup
  job** (financial data).

### Taskman as a data source
- A thin, read-only **`RedmineClient`** (typed `HttpClient`) in the backend
  wrapping the Redmine REST API (`/time_entries.json`, `/projects.json`,
  `/users.json`, `/versions.json`). The `SDI-MCP` Redmine tools confirm the
  available endpoints.
- Ingestion is a **scheduled background job** (an ASP.NET Core `IHostedService` /
  hosted timer, or an external scheduler hitting an admin endpoint) that pulls
  time entries for mapped projects, computes cost in the service layer, attributes
  it to an MPS code, and upserts `actual` rows tagged with their Taskman
  provenance.
- Rates live in Moneta (or are imported), not re-entered — decide whether to
  mirror Taskman's per-project/developer rates or own them in Moneta (open
  question).

### LLM dependency — optional, pluggable, isolated
Two features need an LLM (PDF invoice extraction in Phase 3; the chatbox in Phase
5). **The core — budget data, Taskman cost computation, and invoice verification
itself — does not.** Design accordingly:
- Put LLM access behind a single **`ILlmService`** interface in Infrastructure.
  Nothing in the domain/budget layer depends on it.
- **Graceful degradation:** if LLM access is unavailable or not approved, invoice
  intake falls back to **manual key-in** and the chatbox is simply off — no other
  feature is affected.
- **Provider/residency is a deliberate choice** (open question): the same Claude
  models are reachable via the **Anthropic API directly** (simplest; supports an
  EU data-residency setting), or via the agency's existing cloud — **AWS Bedrock /
  Google Vertex / Microsoft Foundry** in EU regions. The Entra SSO already in play
  hints Microsoft/Azure may be the path of least resistance.
- Default model **`claude-opus-4-8`** via the official **Anthropic C# SDK** (or the
  matching provider client). Cost is modest — a PDF per invoice, a chat turn on
  demand — not a high-volume workload.

---

## 4. Data model (proposed)

Money as C# `decimal` (or integer cents — see the SQLite gotcha in §3). All
amounts in EUR. Model derived from the reference spreadsheet: a **budget line ≈
rollup code** (`1.1.0`), with many fiscal-year/consultant-specific **detailed MPS
codes** under it, and a **`(Project, Category)` mapping rule** that attributes
Taskman work to a budget line.

```
fiscal_year            (year PK, status: open/closed)

budget_line                        -- ≈ "rollup" code; leading digit ≈ EU Title
  id, fiscal_year, code            -- rollup code e.g. "1.1.0"
  title, name, description
  UNIQUE(fiscal_year, code)

mps_code                           -- detailed code; fiscal-year & consultant specific
  id, fiscal_year
  code                             -- "1.1.20"  (the year's "MPS")
  label                            -- Level-3 label
  budget_line_id                   -- FK → rollup / budget line
  consultant                       -- 'Tracasa' | 'Bilbomatica' | 'Altia' | ...
  active
  UNIQUE(fiscal_year, consultant, code)
  -- budget_line 1 ──< N mps_code

category_mps_map                   -- the (Project, Category) → budget line rule
  id, fiscal_year
  taskman_project                  -- project name (or id)
  taskman_category                 -- issue category  (CAN BE NULL/blank — see §5)
  budget_line_id                   -- rollup the work attributes to (NULL if excluded)
  excluded                         -- TRUE when source code is 'x' / 'X'
  note                             -- free-text exceptions / consultant overrides
  UNIQUE(fiscal_year, taskman_project, taskman_category)
  -- ⚠ if the same (project, category) maps differently per consultant (open Q#9),
  --   add `consultant` to the row and the unique key

invoice                            -- what a consultant billed (verification feature)
  id, consultant, invoice_ref
  fiscal_year, period              -- the month being billed (e.g. 2026-05)
  budget_line_id                   -- budget line stated on the invoice
                                   --   ⚠ if one invoice spans several lines (open
                                   --   Q-I2), move budget_line to invoice_line
  claimed_amount                   -- total billed (EUR; add currency only if multi-ccy)
  received_date
  status                           -- 'received' | 'verified' | 'disputed'
  verified_by, verified_at, note

invoice_line                       -- optional breakdown if the invoice itemises
  id, invoice_id
  budget_line_id, mps_code_id      -- nullable (budget_line per line if Q-I2 = multi)
  description, claimed_amount

appropriation                      -- versioned budget figures, per budget_line
  id, budget_line_id, fiscal_year
  ca_amount, pa_amount             -- commitment & payment appropriations
  credit_origin                    -- C1 / C8 / C4 / C5  (default C1)
  source                           -- 'initial' | 'amendment' | 'transfer'
  effective_date, note

commitment                         -- encumbrances against a budget line
  id, budget_line_id, fiscal_year
  mps_code_id                      -- optional, for detailed reporting
  reference, amount, date, counterparty
  status                           -- open / closed / cancelled

actual                             -- BOOKED expenditure = what counts as `spent`
  id, budget_line_id, fiscal_year, period
  mps_code_id                      -- optional detailed code
  commitment_id                    -- nullable link to commitment
  invoice_id                       -- set when booked from a verified invoice
  amount, date, description, consultant
  source                           -- 'invoice' | 'manual' | 'import'

taskman_cost                       -- COMPUTED reference for verification — NOT spent
  id, fiscal_year, period          -- the billed month (e.g. 2026-05)
  taskman_project, taskman_category
  developer, hours, computed_amount -- hours/8 × rate
  budget_line_id, mps_code_id      -- attributed target (NULL if excluded)
  consultant
  attribution_status               -- 'mapped' | 'assumed_default' | 'unmapped' | 'excluded'
  external_ref                     -- idempotency key for re-ingestion

taskman_project     (project_id PK, name, company, last_synced)

-- Optional, mirrored from Taskman for cost calc if Moneta owns rates:
contractor          (id, name, company)
contractor_rate     (contractor_id, project_id, profile,
                     daily_rate, intra_muros_rate, effective_from)
```

Derived (computed in the service layer, not stored):
- `spent(line, year)      = Σ actual.amount where budget_line_id = line`
  — booked expenditure only; the Taskman computation is **not** counted here.
- `committed(line, year)  = Σ commitment.amount (status≠cancelled)`
- `available_to_commit    = Σ appropriation.ca_amount − committed(line)`
- `available_to_pay       = Σ appropriation.pa_amount − spent(line)`
- `consumption_rate       = spent(line) / pa_amount`

For the **invoice-verification feature** only (not part of `spent`):
- `computed(line, period) = Σ taskman_cost.computed_amount where budget_line_id =
  line and attribution_status ∈ ('mapped','assumed_default')`
- `variance(invoice)      = invoice.claimed_amount − computed(line, period)`
- `unmapped(period)       = Σ taskman_cost.computed_amount where
  attribution_status='unmapped'` — surfaced in the triage queue, never hidden.

Idempotent Taskman ingestion: upsert `taskman_cost` on a deterministic
`external_ref` (e.g. `taskman:{project}:{category}:{developer}:{period}`) so
re-running a month overwrites rather than duplicates.

---

## 5. Taskman integration

1. **Mapping** (maintained per fiscal year): the `category_mps_map` rule resolves
   a Taskman time entry's **`(Project, Category)` → budget line**, importing the
   `Codes to MPS` spreadsheet as the seed. `x`/`X` entries become `excluded`. Every
   actual is tagged `mapped` / `unmapped` / `excluded`; unmapped spend surfaces in
   a review bucket — never silently dropped.
2. **Cost calculation**: port Taskman's proven formula — per developer per month,
   `hours / 8 × rate`, rate chosen by `payment_performed_class`
   (intra- vs extra-muros). Implement once in the service layer, unit-tested
   against known Taskman figures.
3. **Ingestion job**: monthly (configurable). For each project, pull time entries
   for the target month (date-filtered, like Taskman's `syncDeveloperHours`),
   compute cost, attribute via `(Project, Category)`, upsert `actual` rows with
   provenance and `attribution_status`.
4. **Invoice verification (feature)**: for a received invoice, show its **claimed
   amount** beside Moneta's **Taskman-computed cost** for the same
   `(budget line, period)` — with the per-developer / per-MPS breakdown behind it
   and a **variance** figure. The officer marks the invoice `verified` (variance
   within tolerance) or `disputed`. **A verified invoice is then booked as an
   `actual`** (booked expenditure) against the budget line — that booked actual,
   not the Taskman computation, is what feeds the core `spent`. The Taskman cost is
   only the *reference* for the comparison. The unmapped/missing-category queue (§
   above) is cleared as part of this, since uncategorised hours distort the
   computed side of the comparison.

### PDF intake — automatic extraction (assistive, human-confirmed)
Upload the invoice PDF and have Moneta pre-fill the `invoice` fields rather than
keying them in:
- The **Anthropic C# SDK** sends the PDF to **Opus 4.8** with a **strict JSON
  schema** (structured outputs) → `{consultant, period, budget_line,
  claimed_amount, line_items[]}`. An LLM handles the differing per-consultant
  layouts (Altia / Tracasa / Bilbomatica) far better than per-vendor templates.
- **Extraction is a draft, not an approval.** The officer always reviews the
  extracted fields against the source PDF and is the one who presses
  *verify/dispute* — never auto-approve a financial document.
- **Data-policy dependency:** this sends the invoice to the Anthropic API, so it's
  gated by the same LLM data-handling question as the chatbox (open Q#18) — but in
  **Phase 3**, not later. If external send isn't permitted, fall back to manual
  key-in; the rest of the verification logic is identical.

### Invoice verification flow
```
consultant invoice ─┐
 (budget line,      │   ┌─────────────────────────────────────┐
  period, amount)   ├──▶│  claimed   vs   computed (Taskman)    │──▶ variance
Taskman hours ──────┘   │  €X             hours/8 × rate        │     │
 (same period,          └─────────────────────────────────────┘     ▼
  → budget line)                                            verify / dispute
```
This is essentially what today's manual Excel breakdown half-does (Taskman's
`csv_to_excel_export`/template flow) — Moneta automates the compute side and adds
the claimed-vs-computed comparison and an audit trail (`verified_by`/`_at`).

### Missing / blank category (a real data-quality problem)
Consultants **don't always fill the Category field** in Taskman, so
`(Project, Category)` can't always resolve to a budget line. Strategy:
- **Never silently drop or guess.** A time entry with no category (or an
  unmapped `(Project, Category)` pair) is ingested as an `actual` with
  `attribution_status = 'unmapped'` and lands in the triage queue.
- **Fallbacks, in order:**
  1. **Project-level default** — many projects map to a single rollup regardless
     of category (e.g. *Air Quality* and *WISE* are entirely `1.1.0` in the
     sheet). Where a project is unambiguous, a blank category can safely default
     to that project's rollup. Mark these `mapped` but flag `assumed_default`.
  2. **Manual attribution** — for genuinely ambiguous projects, the officer
     assigns the budget line in the triage queue; the choice can be remembered.
  3. **Push-back upstream** — optionally surface "uncategorised hours per
     consultant per month" so the contractor can be asked to fix Taskman at
     source. (Moneta stays read-only; this is a report, not a write-back.)
- **Track the leakage:** show total/percent of spend that is unmapped or
  default-assumed, so data quality is visible and improving over time.

Reuse, don't re-derive: Taskman's `syncDeveloperHours.fetch_monthly_hours_for_project`
and `tab_spent_time` cost logic are the reference implementations.

### Management Plan (MPS code source)
The MPS code list comes from the EEA Management Plan app, not Taskman. Preferred
order: (1) an API/export from Management Plan that Moneta imports on a schedule;
(2) a manual file import (CSV/Excel) maintained by an officer; (3) hand-entry in
Moneta as a last resort. Whether Management Plan also defines the budget-line ↔
MPS-code grouping determines how much structure Moneta imports vs. owns.

---

## 6. Future direction — conversational query (chatbox)

> **Not v1.** A later phase: a natural-language **chatbox** where users ask
> questions ("how much of budget line 1.1.0 is left this year?", "show Tracasa
> spend on Reportnet last quarter") and Moneta answers by querying Taskman/Redmine
> (and its own budget data) through the **SDI-MCP** Redmine MCP server.

Because the backend is **.NET**, build this with the official **Anthropic C# SDK**
(`dotnet add package Anthropic`), default model **`claude-opus-4-8`**, streaming
responses for the chat UI. Two ways to wire in the MCP server:

- **MCP connector (recommended if the server is URL-reachable):** the Messages API
  can connect Claude directly to a remote MCP server. Declare it with `mcp_servers`
  + an `mcp_toolset` entry (beta `mcp-client-2025-11-20`); Claude calls the Redmine
  tools server-side. Least glue code.
- **Custom tool use (more control):** the backend exposes a small set of typed,
  **read-only** query tools (over Moneta's DB and the Redmine client) and runs the
  tool loop itself with `BetaToolRunner`. Keeps the Taskman API key and any
  write-capable endpoints entirely server-side.

Guardrails this feature must respect:
- **Read-only.** The SDI-MCP Redmine surface includes write/update calls; the
  chatbox must be constrained to read-only queries (prefer the custom-tool route,
  or a restricted toolset, over exposing the full MCP server).
- **Data sensitivity.** This is EU-agency financial data behind Entra SSO — confirm
  what may be sent to the LLM, apply the same auth/RBAC as the rest of Moneta, and
  log queries.
- **Grounding.** Prefer answering from Moneta's own reconciled budget tables (the
  numbers officers trust) and use Taskman only for drill-down, so the assistant
  doesn't recompute actuals a different way than the dashboards.

This phase depends on the budget/actuals model (Phases 1–3) being in place — the
chatbox is a query layer over it, not a substitute for it.

---

## 7. Roadmap

**Phase 0 — Validate (before building)**
- *Mapping grain — largely answered:* attribution is `(Project, Category) → rollup
  code`, two-level (rollup → detailed MPS), fiscal-year- and consultant-scoped, per
  the reference sheet. Confirm rollup-level tracking is enough for budget vs actuals.
- **Quantify the blank-category problem:** pull a real month of Taskman time
  entries via the API/MCP, measure what % of hours have no/unmapped category, and
  list which projects are unambiguous enough to default safely (see §5 strategy).
- Hand-reconcile computed cost against a known invoice to lock the formula.
- Confirm auth requirement (EU Login/Entra SSO vs Firebase).

**Phase 1 — Budget skeleton**
- Solution scaffold: .NET Web API (layered) + React SPA, EF Core + SQLite, initial
  migration baseline.
- CRUD for `fiscal_year`, `budget_line`, `mps_code` (each MPS code under a budget
  line), `appropriation` — with initial budget import from the agency spreadsheet.
- Budget overview: budget-line hierarchy with CA/PA, drill-down to its MPS codes.

**Phase 2 — Commitments & actuals (manual)**
- Record commitments and actuals by hand against **MPS codes**.
- Budget-vs-actuals view: budget → committed → spent → remaining, rolled up from
  MPS codes to budget lines, with consumption rates and alerts.

**Phase 3 — Invoice verification feature (Taskman-backed)**
- `RedmineClient`, cost service logic, `category_mps_map`, ingestion job populating
  `taskman_cost` (the computed reference).
- Invoice intake (`invoice` / `invoice_line`) — PDF auto-extraction (Opus 4.8,
  officer-confirmed) or manual key-in — and the **claimed-vs-computed verification
  view** with variance, verify/dispute action, and audit trail. A verified invoice
  books an `actual` against its budget line (feeding the core `spent`).
- Unmapped/missing-category triage queue feeding the computed side.

**Phase 4 — Hardening**
- DB backups, audit trail on financial edits, role-based access, possible move to
  SQL Server/Postgres, export to the agency's reporting format.

**Phase 5 — Conversational query (chatbox)** *(future — see §6)*
- Anthropic C# SDK + Opus 4.8; read-only NL queries over Moneta + Taskman via the
  SDI-MCP Redmine server, grounded in Moneta's reconciled budget tables.

---

## 8. Risks & open issues

- **Blank/missing category (the central risk for the verification feature):** the
  mapping key is `(Project, Category)`, but consultants don't always fill Category,
  so a slice of Taskman cost won't attribute to a budget line. Mitigated by
  project-level defaults + a triage queue (§5); quantify in Phase 0. Distinct from
  the core budget-vs-actuals, which doesn't depend on Taskman at all.
- **Rates are load-bearing:** the computed verification side is `hours × rate`, so
  wrong/stale rates make every variance wrong. Rate provenance and per-year/per-
  contract accuracy must be nailed down (open Q#10) — not an afterthought.
- **Source of truth for rates:** mirroring Taskman rates risks drift; reading them
  live couples Moneta to Taskman's schema. Decide explicitly.
- **Moneta is not the accounting system:** figures will diverge from ABAC/SAP;
  Moneta is for monitoring/planning. Set this expectation with stakeholders.
- **Auth/compliance:** an internal EU-agency financial tool may have SSO and
  data-handling requirements that affect hosting and the auth choice.
- **SQLite for money:** EF Core stores `decimal` as `TEXT` in SQLite, breaking
  in-SQL `SUM`/ordering. Choose the money strategy (app-layer aggregation or
  integer cents) at the first migration; retrofitting is painful.
- **SQLite → server DB migration:** fine to start on SQLite, but keep queries
  provider-agnostic so the eventual move to SQL Server/Postgres stays cheap.

See [open-questions.md](open-questions.md) for the decisions that gate this plan.
