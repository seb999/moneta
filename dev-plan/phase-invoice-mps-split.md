# Phase — Invoice verification & MPS split

> Consultant companies send a monthly **invoice for a payment ref** (contract).
> An officer **verifies** it against Taskman work effort, then **splits** the
> invoice amount across **MPS codes** for management reporting. This is the
> application's core verification feature.

---

## 1. Corrected domain understanding

Earlier the MPS code was wrongly assumed to be the `EEA.6XXXX` suffix of the
payment ref. It is **not**. Grounded in `dev-plan/2605-61006 ALTIA TMN2000.xlsx`:

| Concept | Example | Role |
|---|---|---|
| **Payment ref** | `es_bilbomatica-Natura2000-…/EEA.61006` | the contract a consultant invoices against. `EEA.61006` = EEA budget *commitment* number, **not** the MPS code |
| **MPS code** | `1.1.0`, `4.3.9`, `1.2.135` | three-part EEA Management-Plan code; the dimension spend is **split** into |
| **(Project, Category) → MPS** | `(Natura2000, *) → 1.1.0` | mapping that assigns each time entry's hours to an MPS code |

**The flow (from the spreadsheet's `split` sheet):**

```
Payment ref (one invoice, one period)
   │  verify: invoice amount  vs  Taskman computed cost (hours × rate)
   ▼
Split the period's hours by category → MPS code:
   1.1.16 → 256 h (69.2%)        ← was 2025 detailed; 2026 uses rollup level
   1.2.135 → 114 h (30.8%)
   ─────────────────────
   total   370 h (= verified hours)
   │
   ▼  split invoice amount proportionally to hours per MPS
Invoice lines: one per MPS code, with hours + € amount
```

**2026 specifics** (`Codes to MPS` tab — the authoritative 2026 source):
- Maps `(Project, Category) → MPS code` at **rollup level**: `1.1.0, 2.1.0,
  3.1.0, 4.1.6, 4.3.1, 4.3.6, 4.3.9, 4.4.5`.
- `x` / `X` → excluded from MPS (don't count).
- Notes column holds exceptions (*"Tracasa - use 6.4.2"*, *"Charged to core when
  no ENV contract"*, consultant tag *"MLW"*).
- 21 projects, 134 mapped rows, 15 excluded.

---

## 2. Data model

Revives two entities removed during the payment-ref simplification, plus the
already-present (unused) `Invoice` / `InvoiceLine`.

```
mps_code                       -- the catalogue of MPS codes (seeded from Excel)
  id, fiscal_year
  code                         -- "1.1.0" / "4.3.9" (three-part)
  label                        -- optional Level-3 label (blank for 2026 until sourced)
  rollup                       -- optional parent code
  UNIQUE(fiscal_year, code)

category_mps_map               -- (Project, Category) → MPS code, per fiscal year
  id, fiscal_year
  taskman_project
  taskman_category             -- may be blank
  mps_code                     -- target code (NULL if excluded)
  excluded                     -- TRUE for x/X
  note                         -- free-text exceptions
  UNIQUE(fiscal_year, taskman_project, taskman_category)

taskman_cost  (existing — add two fields)
  + taskman_category           -- captured from the issue (currently always "")
  + mps_code                   -- resolved via category_mps_map
  + attribution_status already exists: mapped | unmapped | excluded

invoice  (existing)
  id, consultant, invoice_ref, fiscal_year, period
  payment_ref_id               -- the contract billed
  claimed_amount_cents
  received_date, status        -- received | verified | disputed
  verified_by, verified_at, note

invoice_line  (existing — repurpose for the MPS split)
  id, invoice_id
  mps_code                     -- the MPS this slice goes to
  hours                        -- hours attributed to this MPS for the period
  amount_cents                 -- claimed_amount × (hours / total hours)
```

Derived (service layer):
```
computed_cost(ref, period)   = Σ taskman_cost.computed_amount  (the verification reference)
variance(invoice)            = invoice.claimed_amount − computed_cost
hours_by_mps(ref, period)    = Σ taskman_cost.hours  GROUP BY mps_code   (the split)
line.amount                  = invoice.claimed_amount × hours_by_mps / total_hours
```

---

## 3. Milestones

### M1 — MPS reference data (start here)
- `MpsCode` + `CategoryMpsMap` entities + EF migration.
- **Excel importer**: parse the `Codes to MPS` tab of the Altia workbook →
  - distinct MPS codes → `mps_code` rows (fiscal year 2026)
  - each row → `category_mps_map` (project, category, code; `x`/`X` → excluded; note column kept)
  - normalise legacy company names on the way in (Bilbomatica → Altia).
- Admin endpoint `POST /api/mps/import` (upload xlsx) + a **MPS Codes** /
  **Category Mapping** page to view (and later edit) the imported data.
- *Source is the Excel for now; the Management-Plan source comes later.*

### M2 — Capture category + resolve MPS during ingestion
- Ingestion fetches each time entry's **issue Category** (batch `/issues.json`
  fetch, as the old Taskman `syncDeveloperHours` did).
- **Auto-mapping**: when a time entry **has its Category filled**, the
  `Codes to MPS` correspondence resolves `(Project, Category) → MPS code`
  automatically — no manual step. This covers the majority of entries.
- Store `taskman_category` + `mps_code` on each `taskman_cost` row; set
  `attribution_status` = mapped / unmapped / excluded.
- **Blank / unmapped Category** (the known data-quality gap): fall back in order
  — (1) project-level default where a project maps to a single MPS regardless of
  category, flagged `assumed_default`; (2) manual attribution in a triage queue;
  (3) report uncategorised hours per consultant so Taskman can be fixed at source.
  Never silently drop or guess.

### M3 — Invoice intake + verification
- Invoice CRUD: consultant, payment ref, period, claimed amount, received date.
- **Verification view**: claimed amount beside Taskman computed cost for the
  same (payment ref, period), with the per-developer breakdown and a **variance**
  figure; officer marks **verified** or **disputed** (audit trail).

### M4 — MPS split + booking
- Compute `hours_by_mps` for the invoice's (payment ref, period); split the
  claimed amount proportionally → `invoice_line` rows (one per MPS code).
- Show the split table (mirrors the spreadsheet `split` sheet) for officer review.
- On **verify**, book the actual(s) against the payment ref (feeding `spent`),
  carrying the MPS breakdown.
- Export the split (CSV/Excel) in the agency's format.

---

## 4. Open questions (deferred)
- **MPS source**: real source is the EEA Management Plan; Excel import is the
  stop-gap. (Decided: import from Excel now.)
- **MPS labels** for 2026 (the `Codes to MPS` tab has no labels).
- **Split override**: auto proportional-by-hours only, or officer-editable amounts?
- **One invoice = one payment ref?** Assumed yes; revisit if invoices span refs.
- **Booking grain**: one actual per invoice, or one per MPS line?
- **Rounding**: how to reconcile rounding so MPS line amounts sum exactly to the
  invoice total.

---

## 5. Sequencing
M1 → M2 → M3 → M4. Each milestone is independently shippable. Begin with **M1**
(import the 2026 MPS list + category mapping from the Excel).
