# CLAUDE.md — Moneta

Budget management application for the EEA (European Environment Agency).
Core: budget vs. actuals (budget → committed → spent → remaining) per budget line.
Key feature: invoice verification against Taskman-derived cost.

See [dev-plan/moneta-dev-plan.md](dev-plan/moneta-dev-plan.md) for the full plan.

## Repository layout

```
backend/      ASP.NET Core Web API (.NET 10, C#)
frontend/     React + TypeScript (Vite)
dev-plan/     Planning documents and open questions
Taskman/      Reference app (Python/Streamlit) — read-only, do not modify
```

## Dev commands

### Backend (ASP.NET Core)
```bash
cd backend
dotnet run                          # starts on http://localhost:5257
dotnet build
dotnet test                         # no tests yet

# EF Core migrations (install tool once: dotnet tool install -g dotnet-ef)
dotnet ef migrations add <Name>     # create a migration
dotnet ef database update           # apply migrations manually
# Migrations also auto-apply on startup in Development mode
```

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev     # starts on http://localhost:5173, proxies /api → backend
npm run build
npm run lint
```

## Architecture

- **Backend**: `backend/` — ASP.NET Core Web API
  - `Domain/` — entity classes (no logic, no EF references)
  - `Infrastructure/MonetaDbContext.cs` — EF Core DbContext with SQLite
  - `Api/Controllers/` — REST controllers
  - DB file written to `backend/data/moneta.db` (git-ignored)
  - Migrations in `backend/Migrations/`

- **Frontend**: `frontend/src/` — React SPA
  - Calls backend via `/api/*` (proxied by Vite in dev, same-origin in prod)

- **Money**: all monetary amounts stored as **integer euro-cents** (`long`) to
  avoid SQLite decimal precision loss. Convert to `decimal` in the API response
  layer (`amount / 100m`).

## Key domain concepts

| Concept | Description |
|---------|-------------|
| `BudgetLine` | Rollup code, e.g. `1.1.0`. The unit of budget tracking. |
| `MpsCode` | Detailed code, e.g. `1.1.20`. Many per budget line; fiscal-year and consultant-scoped. |
| `CategoryMpsMap` | `(fiscal_year, taskman_project, taskman_category) → BudgetLine`. Attribution key. |
| `Appropriation` | CA/PA budget amounts per line/year. |
| `Commitment` | Legal commitment (contract/PO) against a line. |
| `Actual` | **Booked spend** — verified invoices, manual entries, imports. What counts as "spent". |
| `TaskmanCost` | **Computed reference** from Taskman hours — for invoice verification only, never "spent". |
| `Invoice` | Consultant invoice; verified against `TaskmanCost`; on success creates an `Actual`. |

## Budget formula

```
spent(line)             = Σ actual.amount_cents  (source: any)
committed(line)         = Σ commitment.amount_cents (status ≠ cancelled)
available_to_commit     = Σ appropriation.ca_amount_cents − committed(line)
available_to_pay        = Σ appropriation.pa_amount_cents − spent(line)

-- invoice verification only:
computed(line, period)  = Σ taskman_cost.computed_amount_cents (attributed)
variance(invoice)       = invoice.claimed_amount_cents − computed(line, period)
```

## Open questions

See [dev-plan/open-questions.md](dev-plan/open-questions.md). Key gates:
- **Q-I2**: one invoice = one or many budget lines? (determines `invoice_line` usage)
- **Q#9**: does same (project, category) map differently per consultant? (adds `consultant` to `category_mps_map`)
- **Q#10**: where do daily rates live — Moneta or Taskman?
- **Q#18**: LLM data policy — gates PDF invoice auto-extraction in Phase 3

## Environment variables

```
# backend/.env or appsettings.Development.json
ConnectionStrings__Default=Data Source=data/moneta.db
ANTHROPIC_API_KEY=sk-ant-...        # Phase 3+ only
TASKMAN_API_KEY=...                 # Phase 2+ Taskman sync
```
