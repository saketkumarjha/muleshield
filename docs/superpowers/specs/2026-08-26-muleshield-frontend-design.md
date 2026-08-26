# MuleShield Frontend — Design Spec

**Date:** 2026-08-26
**Source of truth:** `MuleShield Product Design and UX Guide for Saket` (user-supplied, 24 Aug 2026)
**Scope of this spec:** Priority 0 + Priority 1 only (app shell/foundation + Alert Queue, Case Detail, Maker-checker drawer, audit confirmation). Ring Explorer, Transactions, Governance, and Model Card are explicitly deferred.

## Decisions locked in brainstorming

- **Stack:** Static HTML/CSS/JS served by FastAPI. No React, no build step, no bundler.
- **Data:** Mock/fixture JSON only. No real backend integration in this pass.
- **Fonts:** System font fallback (Segoe UI for UI/body, Consolas/monospace stack for identifiers/numbers) instead of self-hosted Source Sans 3 / IBM Plex Mono. Swappable later.
- **Testing:** No automated test framework for this pass. Verification is manual, against the Visual QA (§21) and Backend UX QA (§22) checklists in the source doc.

## Architecture

```
app/
  main.py                # FastAPI app: serves static/ and JSON API endpoints
  fixtures/
    accounts.json         # queue rows + case detail data, keyed by account id
    holds.json            # in-memory-seeded hold records (maker-checker state)
    governance.json        # not used this pass (reserved for Priority 2)
  api/
    queue.py               # GET /api/queue
    case.py                 # GET /api/case/{account_id}
    hold.py                  # POST /api/hold, POST /api/hold/{id}/decision
static/
  index.html               # shell: topbar, sidebar, system status strip, screen mount point
  css/
    tokens.css              # colors, type scale, spacing from spec §5
    shell.css                 # topbar/sidebar/status strip
    components.css             # risk chips, provenance badges, skeletons, empty/error states
    queue.css
    case.css
    drawer.css
  js/
    router.js                # hash-based routing between screens
    api.js                     # fetch wrapper, consistent error handling
    components.js                # risk chip, provenance badge, skeleton, empty-state renderers
    screens/
      queue.js
      case.js
      makerChecker.js
```

No build tooling. All JS is plain ES modules loaded via `<script type="module">`.

## Design tokens (from source doc §5)

`tokens.css` implements the full palette (Paper/Surface/Ink/Navy/Muted/Sand/Border/Strong border), risk band colors (Critical/Urgent/Investigate/Watch/BroadWatch/NoAlert), and provenance colors (Simulated/Verified/Warning/Error/Information) exactly as hex values in the source doc, as CSS custom properties. Spacing scale (2xs–2xl) and type scale (product name through label) are implemented as custom properties and utility classes. No values are invented — every token traces to a table in the source doc.

## Backend contract (subset of source doc §14, implemented)

### `GET /api/queue`
Returns: exclusive band counts, current filtered total, workload summary, scope statement (holdout size / displayed count), model version, threshold version, and rows with `account_id, raw_score, display_score, band, top_evidence_title, evidence_count, status, age`. Query params: `band`, `search`, `page`.

### `GET /api/case/{account_id}`
Returns: account header (band, raw/calibrated score, completeness), evidence list (each row typed `real | simulated | policy`, with contribution, value, provenance, caveat), context (timeline, transactions stub), recommended action. Missing simulated evidence (graph/feed) degrades independently — never a 503 for the whole case, per §14.4.

### `POST /api/hold`
Body: `account_id, action, rationale, maker`. Creates a hold in `pending` status. Returns stable `hold_id`.

### `POST /api/hold/{id}/decision`
Body: `checker, decision (approve|reject), note (required if reject)`.
Server-enforced invariants (§14.5, all implemented, not just UI-simulated):
- `maker != checker` → else `MAKER_CHECKER_CONFLICT`
- unknown hold id → `HOLD_NOT_FOUND`
- already-decided hold → `HOLD_ALREADY_DECIDED`
- expired window → `HOLD_EXPIRED`, approval disabled, rejection still allowed
- successful decision returns new status + an audit reference (a synthetic hash string, stored alongside the hold record)

### Error shape (§14.2)
Every error response: `{ "error_code": "...", "message": "...", "retryable": bool, "resource_id": "...|null", "corrective_action": "...|null" }`, non-200 HTTP status. Never HTTP 200 with an embedded error.

## Screens in scope

### App shell (Priority 0)
Topbar (wordmark, `LOCAL DEMO` badge, model version, data-plane status, audit-chain status, role switcher — display-only, backed by a query param, not auth). Sidebar with 5 nav items (Queue, Transactions, Ring Explorer, Governance, Model Card active-state wired only for Queue/Case this pass; other four render a simple "not in this build" placeholder screen rather than a broken link). Bottom-of-sidebar system status strip (API/Model/Audit chain/Data plane).

### Alert Queue (Priority 1)
Three-line header (screen name + mode chip; operational summary line; scope/version line) exactly per §7. Band filter tabs. Dense table (42–46px rows) with sticky header, monospace account id/score, truncated evidence text, keyboard row focus + Enter to open case, sand-background+navy-rule selection. No KPI cards.

### Case Detail (Priority 1)
12-col grid: header (12 cols), evidence stack (7 cols), context/timeline (3 cols), action rail (2 cols, becomes a drawer under 1024px per §18). Evidence rows use the 6-part anatomy from §8 with provenance-specific left-rule/dashed-outline/dotted-rule treatment. Semantics caveat pinned at the bottom of the model-evidence block. Primary action button labeled "Propose hold" (never "Freeze account").

### Maker-checker drawer (Priority 1)
Right-side drawer, 3-step flow per §10: Propose (rationale required, evidence summary, maker identity) → Pending (locked evidence, time remaining, instruction to switch role) → Checker decision (maker/checker identities shown together, approve/reject, rejection requires a note). All 6 error states from the §10 table are implemented as distinct UI responses, not a single generic error.

### Audit confirmation
On successful decision: calm status change, audit reference shown, one short confirmation line. No animation.

## Explicitly out of scope this pass

Ring Explorer, Transactions table, Governance screen, Model Card, keyboard shortcuts beyond basic row nav, self-hosted webfonts, dark mode (never), automated tests, real backend integration, authentication.

## Verification plan

Manual walkthrough against:
- Source doc §21 Visual QA checklist, "Whole application" / "Queue" / "Case" / "Maker-checker" subsections (Ring/Governance sections skipped as out of scope).
- Source doc §22 Backend UX QA checklist, items applicable to queue/case/hold endpoints.
- Manual test at 1280×720 per §18 minimum supported resolution.

No automated test suite is written for this pass — noted as a known gap rather than silently skipped.
