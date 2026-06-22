# Moneta — Development Plan

Moneta is a budget-management application for an EU agency (EEA). At its core it
tracks **budget vs. actuals** — budget lines and appropriations, and the running
**budget → committed → spent → remaining** picture per line.

**Invoice verification** is a key *feature* on top of that core: consultant
companies invoice against a budget line, and Moneta cross-checks each invoice
against Taskman-derived cost (hours → €) to validate the consultant spend before
it's booked. It's one of the ways actuals get captured — not the application's
reason for being.

Moneta is a **new, standalone application** — **React frontend + .NET (ASP.NET
Core) backend, SQLite to start**. It treats **Taskman** (the EEA Redmine instance
at `taskman.eionet.europa.eu`) as a **data source** for actuals — contractor
effort logged as time entries, converted to cost — alongside other budget inputs
entered or imported directly into Moneta.

The central modelling problem: **a budget line has many MPS codes under it**, and
**MPS codes do not exist in Taskman** — they are a Moneta-owned concept. Spend is
attributed to an MPS code, which rolls up to its budget line:
`budget line → (many) MPS codes → spend`.

The authoritative **list of MPS codes** lives in the EEA **Management Plan**
application (`applications.eea.europa.eu/ManagementPlan`, behind Microsoft Entra
SSO) — a second data source Moneta must import from.

## Documents

| File | Purpose |
|------|---------|
| [moneta-dev-plan.md](moneta-dev-plan.md) | The full plan: goals, domain model, architecture, data model, integration, roadmap, risks. |
| [open-questions.md](open-questions.md) | Decisions needed from the budget owners before/while building. |

A later phase adds a **conversational chatbox** (Anthropic C# SDK + Opus 4.8) that
answers natural-language questions by querying Taskman/Redmine through the SDI-MCP
server, grounded in Moneta's own budget data — see §6 of the plan.

## Status

Planning. No code yet. This is a plan for review — nothing here is final until
the open questions are resolved.

## Relationship to Taskman

```
                 ┌─────────────────────────┐
  Taskman /      │   time entries, hours,  │   actuals (operational spend)
  Redmine API ──▶│   payment_ref_id, MPS   │──────────────┐
  (read-only)    └─────────────────────────┘              ▼
                                                  ┌─────────────────┐
  Manual entry /                budget lines,     │     Moneta      │
  finance imports ────────────▶ commitments,  ───▶│ budget vs actuals│
  (CA/PA, contracts)           appropriations     └─────────────────┘
```

Taskman stays as-is. Moneta does not write to Redmine.
