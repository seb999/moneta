# Moneta — Open questions

Decisions needed from budget owners / stakeholders. These gate the plan; answers
will refine [moneta-dev-plan.md](moneta-dev-plan.md).

## Budget structure & data
1. **Budget line granularity** — Do we track at full `Title→Chapter→Article→Item`
   depth, or is line-level (e.g. Title 3 operational lines) enough for v1?
2. **Initial budget source** — Is there an existing budget spreadsheet/export
   (CA & PA per line) we import, or is it entered by hand?
3. **CA vs PA** — Do we need both commitment and payment appropriations in v1, or
   start with a single "budget" figure and add the CA/PA split later?
4. **Amendments/transfers** — Do mid-year budget changes need to be tracked
   (versioned), or is the budget effectively fixed for v1?
5. **Credit origins (C1/C8/C4/C5)** — Relevant for v1, or default everything to
   C1 current-year credits for now?

## Invoice verification (feature — Phase 3)
I1. **Invoice format & intake** — How does the invoice arrive (PDF, Excel,
   structured/portal export)? **Auto-extraction from PDF is feasible** (Anthropic
   C# SDK + Opus 4.8 + structured outputs), with the officer confirming the
   extracted fields — but it sends the invoice to the Anthropic API, so it depends
   on Q#18 (LLM data policy). If external send isn't allowed, fall back to manual
   key-in. Which path is acceptable?
I2. **Granularity** — Is one invoice for one budget line, or does a single invoice
   span several budget lines / MPS codes / developers? Determines whether we need
   `invoice_line` itemisation and at what grain to compare.
I3. **What "matches" means** — Is verification at the total-amount level per budget
   line, or line-by-line (per developer / per MPS)? Is there an acceptable
   **variance tolerance** (e.g. ±1%) before it's flagged as disputed?
I4. **Budget line on the invoice vs the mapping** — The invoice states a budget
   line directly; Taskman work derives one via `(Project, Category) → MPS → line`.
   When they disagree, which is authoritative, and how should the discrepancy be
   surfaced?
I5. **Outcome of verification** — After verifying, does Moneta need to feed an
   approval/payment step or export anywhere, or is recording verified/disputed +
   audit trail enough for v1?

## MPS codes & Taskman mapping (the central problem — gates Phase 3)
*Much of this is now answered by the `2605-61006 ALTIA TMN2000.xlsx` reference
sheet: attribution is `(Project, Category) → rollup code`; codes are two-level
(rollup `1.1.0` → detailed MPS `1.1.20`), fiscal-year-scoped, and per consultant.
Remaining questions:*

6. **Blank/missing category (the live blocker)** — Consultants don't always fill
   the Category field. For which projects is the rollup unambiguous (so a blank
   category can safely default — e.g. Air Quality, WISE = `1.1.0`), and which
   genuinely need manual attribution? Is pushing consultants to categorise in
   Taskman an option?
7. **Rollup vs detailed grain** — For budget-vs-actuals, is tracking at the
   **rollup level (= budget line, `1.1.0`)** sufficient, with detailed MPS
   (`1.1.20`) only for invoice/consultant reporting? Or must budget be tracked at
   detailed-MPS level too?
8. **Mapping ownership & cadence** — Today the `Codes to MPS` sheet is maintained
   by hand. Should Moneta import it each fiscal year and let officers edit it
   in-app, and does the authoritative source (Management Plan, Entra SSO) offer an
   API/export, or is it manual?
9. **Consultant dimension** — Is "consultant" (Tracasa / Bilbomatica / Altia)
   derived from the Taskman project/company, or does it need its own mapping? Same
   `(Project, Category)` can map to different detailed codes per consultant.
10. **Rate ownership** — Should Moneta own contractor daily rates (entered/imported
    in Moneta) or read them from Taskman's `project_developer` table? Where is the
    authoritative rate today?
11. **Commitment data** — Are contract values (for commitments) available anywhere
    to import, or are commitments entered manually in v1?

## Platform & operations
12. **Authentication** — Is EU Login / Microsoft Entra (Azure AD) SSO required, or
    is a simpler scheme (e.g. Taskman's Firebase email/password) acceptable for v1?
    Any agency data-handling/hosting constraints?
13. **Hosting** — Same VM/Docker path as Taskman (containerised .NET API + React
    static build)? Where does the SQLite file live, and what are the backup
    expectations for financial data?
14. **DB longevity** — Is SQLite acceptable for production v1, or should we plan the
    move to SQL Server / PostgreSQL within a known timeframe (number of concurrent
    users / data volume that would trigger it)?
15. **Users & roles** — How many users, and do we need role-based access
    (e.g. viewer vs budget officer) in v1?
16. **Relationship to official accounting (ABAC/SAP)** — Confirmed that Moneta is
    a monitoring/planning layer, not the system of record? Any required reconciliation
    or export format to the official system?

## Chatbox (future phase — see plan §6)
17. **MCP reachability** — Is the SDI-MCP Redmine server reachable as a remote URL
    the Claude API can connect to (MCP connector), or should the .NET backend run
    the tool loop itself and call Redmine? Affects which integration path we pick.
18. **LLM data policy** — What agency-financial / personal data may be sent to the
    Anthropic API, and under what data-handling terms? Gates whether the chatbox is
    viable and what must be redacted or kept server-side.
19. **Read-only enforcement** — Confirm the chatbox must be strictly read-only
    (the SDI-MCP surface can write to Redmine) and who is allowed to use it.
20. **LLM provider & data residency** — ✅ **Decided: start with the Anthropic
    Claude API directly** (official C# SDK, `claude-opus-4-8`). Revisit a cloud
    provider (AWS Bedrock / Google Vertex / Microsoft Foundry) only if data
    governance later requires it — the `ILlmService` boundary makes that a
    swap. *Still to confirm:* whether to set the API's **EU data-residency
    option** (`inference_geo`) so invoice/query processing stays in-region, and
    sort out API-key custody (a secret, like the Taskman key). Data-send approval
    is the separate gate in Q#18.
