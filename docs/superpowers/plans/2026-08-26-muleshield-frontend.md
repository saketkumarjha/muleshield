# MuleShield Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Priority 0 + Priority 1 slice of MuleShield: app shell, design tokens, Alert Queue, Case Detail, and the maker-checker hold workflow, as a FastAPI-served static frontend against JSON fixtures.

**Architecture:** FastAPI serves both the static frontend (`static/`) and a small JSON API (`app/api/*.py`) backed by in-memory data seeded from `app/fixtures/*.json` at startup. The frontend is plain HTML/CSS/ES-module JS — no build step, no framework. Hold state lives in a process-global dict so maker-checker invariants (maker≠checker, no double-decision, expiry) are enforced server-side, not just simulated in the UI.

**Tech Stack:** Python 3.11+, FastAPI, uvicorn, vanilla HTML/CSS/JS (ES modules), no npm/node involved.

## Global Constraints

- No React, no build tooling, no CDN requests of any kind (per source doc §2, §19: "No external font, icon, analytics, or chart requests").
- Light theme only, no dark mode (source doc §5.1, §24).
- Fonts: system stack only — `"Segoe UI", sans-serif` for UI/body, `Consolas, "SFMono-Regular", monospace` for identifiers/scores/numbers (locked in brainstorming; source doc §5.3 intent, adapted).
- All colors are the literal hex values from source doc §5.2 — never approximate or invent a color.
- Every API error response uses the shape from source doc §14.2: `{error_code, message, retryable, resource_id, corrective_action}`, non-200 HTTP status, never HTTP 200 with an embedded error.
- Button copy must match source doc §17 exactly: "Open case", "Record analyst decision", "Propose hold", "Submit for independent approval", "Approve recommendation", "Reject recommendation" — never "Execute", "Freeze", "Process", "Apply", "Resolve".
- No automated test framework this pass (locked in brainstorming) — every task substitutes explicit manual verification (curl commands with expected JSON, or a described browser check) in place of pytest steps. This is a deliberate, documented gap, not a silent omission.
- Minimum supported viewport: 1280×720 (source doc §18).

---

## Task 1: FastAPI project scaffold + static file serving

**Files:**
- Create: `app/main.py`
- Create: `app/__init__.py`
- Create: `static/index.html`
- Create: `requirements.txt`

**Interfaces:**
- Produces: a running FastAPI app at `app.main:app`, mounting `static/` at `/` (StaticFiles with `html=True`), ready for API routers to be `include_router`'d in later tasks.

- [ ] **Step 1: Create the project files**

`requirements.txt`:
```
fastapi==0.115.0
uvicorn==0.30.6
```

`app/__init__.py`: empty file.

`static/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MuleShield</title>
</head>
<body>
  <h1>MuleShield placeholder</h1>
</body>
</html>
```

`app/main.py`:
```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="MuleShield")

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
```

- [ ] **Step 2: Install dependencies**

Run: `pip install -r requirements.txt`
Expected: fastapi and uvicorn install without errors.

- [ ] **Step 3: Run the server and verify manually**

Run: `uvicorn app.main:app --port 8000 --reload` (in background/separate terminal), then:
`curl -s http://127.0.0.1:8000/`
Expected: the placeholder HTML is returned (contains `MuleShield placeholder`).

Stop the server after verifying (Ctrl+C or kill the background process).

- [ ] **Step 4: Commit**

```bash
git init
git add app requirements.txt static/index.html
git commit -m "chore: scaffold FastAPI app serving static frontend"
```

---

## Task 2: Fixture data — accounts and queue

**Files:**
- Create: `app/fixtures/accounts.json`

**Interfaces:**
- Produces: the on-disk shape that Task 3's queue endpoint and Task 4's case endpoint load and filter. Each account object has the fields listed below — later tasks must use these exact key names.

- [ ] **Step 1: Write the fixture file**

`app/fixtures/accounts.json`:
```json
{
  "model_version": "muleshield-gbm-v1.3.0",
  "threshold_version": "thr-2026-08-01",
  "holdout_total": 1817,
  "displayed_total": 200,
  "workload_hours_estimate": 10.0,
  "evaluation_precision": 0.80,
  "accounts": [
    {
      "account_id": "ACC09062",
      "raw_score": 0.98,
      "display_score": 0.94,
      "band": "critical",
      "status": "new",
      "age_hours": 2,
      "top_evidence_title": "Fan-in from 14 accounts within 6 hours",
      "evidence_count": 4,
      "completeness": "complete",
      "recommended_action": "senior review",
      "evidence": [
        {
          "type": "real",
          "title": "Model signal: transaction velocity spike",
          "contribution": 0.31,
          "value": "14 inbound transfers in 6h vs. population median 0.4",
          "provenance": "real",
          "caveat": null
        },
        {
          "type": "real",
          "title": "Model signal: dormant-to-active reactivation",
          "contribution": 0.22,
          "value": "Account dormant 118 days, then 9 transfers in 24h",
          "provenance": "real",
          "caveat": null
        },
        {
          "type": "simulated",
          "title": "Graph finding: shared beneficiary with 3 flagged accounts",
          "contribution": 0.19,
          "value": "Beneficiary ACC22110 also receives from 3 other critical accounts",
          "provenance": "simulated",
          "caveat": "Simulated transaction plane — supplied dataset contains no real edges."
        },
        {
          "type": "policy",
          "title": "Policy rule: high-value first-time counterparty",
          "contribution": null,
          "value": "First transfer to ACC22110 exceeded INR 200,000",
          "provenance": "policy",
          "caveat": null
        }
      ],
      "timeline": [
        {"time": "2026-08-24T09:12:00Z", "label": "Account flagged by model"},
        {"time": "2026-08-24T09:15:00Z", "label": "Assigned to queue"}
      ]
    },
    {
      "account_id": "ACC04471",
      "raw_score": 0.91,
      "display_score": 0.89,
      "band": "critical",
      "status": "open",
      "age_hours": 5,
      "top_evidence_title": "Pass-through pattern, funds drained within 40 minutes",
      "evidence_count": 3,
      "completeness": "complete",
      "recommended_action": "senior review",
      "evidence": [
        {
          "type": "real",
          "title": "Model signal: time-to-drain",
          "contribution": 0.28,
          "value": "92% of inbound balance withdrawn within 40 minutes",
          "provenance": "real",
          "caveat": null
        },
        {
          "type": "simulated",
          "title": "Graph finding: 2-hop cash-out chain",
          "contribution": 0.24,
          "value": "Funds traced through ACC55021 to external cash-out node",
          "provenance": "simulated",
          "caveat": "Simulated transaction plane — supplied dataset contains no real edges."
        },
        {
          "type": "policy",
          "title": "Policy rule: round-number transfer",
          "contribution": null,
          "value": "Outbound transfer of exactly INR 150,000",
          "provenance": "policy",
          "caveat": null
        }
      ],
      "timeline": [
        {"time": "2026-08-24T06:40:00Z", "label": "Account flagged by model"},
        {"time": "2026-08-24T06:44:00Z", "label": "Assigned to queue"},
        {"time": "2026-08-24T08:02:00Z", "label": "Opened by analyst A. Rao"}
      ]
    },
    {
      "account_id": "ACC17733",
      "raw_score": 0.72,
      "display_score": 0.68,
      "band": "urgent",
      "status": "new",
      "age_hours": 1,
      "top_evidence_title": "Multiple small transfers below reporting threshold",
      "evidence_count": 2,
      "completeness": "partial",
      "recommended_action": "analyst review",
      "evidence": [
        {
          "type": "real",
          "title": "Model signal: structuring pattern",
          "contribution": 0.19,
          "value": "6 transfers of INR 48,000-49,500 within 3 hours",
          "provenance": "real",
          "caveat": null
        },
        {
          "type": "simulated",
          "title": "Graph finding: unavailable",
          "contribution": null,
          "value": null,
          "provenance": "simulated",
          "caveat": "Graph fixture unavailable for this account."
        }
      ],
      "timeline": [
        {"time": "2026-08-25T14:10:00Z", "label": "Account flagged by model"}
      ]
    }
  ]
}
```

- [ ] **Step 2: Verify the JSON is valid**

Run: `python -c "import json; json.load(open('app/fixtures/accounts.json'))"`
Expected: no output, exit code 0 (valid JSON).

- [ ] **Step 3: Commit**

```bash
git add app/fixtures/accounts.json
git commit -m "feat: add account/queue fixture data"
```

---

## Task 3: Queue API endpoint

**Files:**
- Create: `app/api/__init__.py`
- Create: `app/api/queue.py`
- Modify: `app/main.py`

**Interfaces:**
- Consumes: `app/fixtures/accounts.json` (Task 2 shape).
- Produces: `GET /api/queue?band=&search=&page=` returning:
```json
{
  "model_version": "string",
  "threshold_version": "string",
  "scope": {"holdout_total": 1817, "displayed_total": 200, "workload_hours_estimate": 10.0, "evaluation_precision": 0.80},
  "band_counts": {"critical": 2, "urgent": 1, "investigate": 0, "watch": 0, "broad_watch": 0, "no_alert": 0},
  "page": 1,
  "page_size": 50,
  "total_filtered": 2,
  "items": [ /* account rows minus "evidence" and "timeline" */ ]
}
```
Later tasks (Task 8) call `GET /api/queue` from the frontend using this exact shape.

- [ ] **Step 1: Write the queue router**

`app/api/__init__.py`: empty file.

`app/api/queue.py`:
```python
import json
from pathlib import Path

from fastapi import APIRouter, Query

router = APIRouter()

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "accounts.json"

with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
    _DATA = json.load(f)

BANDS = ["critical", "urgent", "investigate", "watch", "broad_watch", "no_alert"]


def _band_counts(accounts):
    counts = {b: 0 for b in BANDS}
    for acc in accounts:
        counts[acc["band"]] = counts.get(acc["band"], 0) + 1
    return counts


def _row(acc):
    return {
        "account_id": acc["account_id"],
        "raw_score": acc["raw_score"],
        "display_score": acc["display_score"],
        "band": acc["band"],
        "status": acc["status"],
        "age_hours": acc["age_hours"],
        "top_evidence_title": acc["top_evidence_title"],
        "evidence_count": acc["evidence_count"],
    }


@router.get("/api/queue")
def get_queue(band: str | None = Query(default=None), search: str | None = Query(default=None), page: int = Query(default=1, ge=1)):
    accounts = _DATA["accounts"]

    filtered = accounts
    if band:
        filtered = [a for a in filtered if a["band"] == band]
    if search:
        needle = search.lower()
        filtered = [a for a in filtered if needle in a["account_id"].lower()]

    page_size = 50
    start = (page - 1) * page_size
    page_items = filtered[start:start + page_size]

    return {
        "model_version": _DATA["model_version"],
        "threshold_version": _DATA["threshold_version"],
        "scope": {
            "holdout_total": _DATA["holdout_total"],
            "displayed_total": _DATA["displayed_total"],
            "workload_hours_estimate": _DATA["workload_hours_estimate"],
            "evaluation_precision": _DATA["evaluation_precision"],
        },
        "band_counts": _band_counts(accounts),
        "page": page,
        "page_size": page_size,
        "total_filtered": len(filtered),
        "items": [_row(a) for a in page_items],
    }
```

- [ ] **Step 2: Wire the router into `app/main.py`**

Replace the contents of `app/main.py` with:
```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.queue import router as queue_router

app = FastAPI(title="MuleShield")

app.include_router(queue_router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
```

Note: the API router must be included **before** the `StaticFiles` mount at `/`, otherwise the catch-all static mount will shadow `/api/*` routes.

- [ ] **Step 3: Verify manually**

Run: `uvicorn app.main:app --port 8000 --reload` (background), then:
`curl -s http://127.0.0.1:8000/api/queue`
Expected: JSON with `"total_filtered": 3` and 3 items.

`curl -s "http://127.0.0.1:8000/api/queue?band=critical"`
Expected: `"total_filtered": 2`, both items have `"band": "critical"`.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add app/api app/main.py
git commit -m "feat: add GET /api/queue endpoint"
```

---

## Task 4: Case detail API endpoint

**Files:**
- Create: `app/api/errors.py`
- Create: `app/api/case.py`
- Modify: `app/main.py`

**Interfaces:**
- Consumes: `app/fixtures/accounts.json` (Task 2).
- Produces: `GET /api/case/{account_id}` returning the full account object (header fields + `evidence` + `timeline`) on success; on missing account, HTTP 404 with the error shape from `app/api/errors.py`.
- Produces: `error_response(code, message, retryable, resource_id=None, corrective_action=None)` helper in `app/api/errors.py`, reused by Task 5's hold endpoints.

- [ ] **Step 1: Write the shared error helper**

`app/api/errors.py`:
```python
from fastapi.responses import JSONResponse


def error_response(status_code: int, error_code: str, message: str, retryable: bool, resource_id: str | None = None, corrective_action: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error_code": error_code,
            "message": message,
            "retryable": retryable,
            "resource_id": resource_id,
            "corrective_action": corrective_action,
        },
    )
```

- [ ] **Step 2: Write the case router**

`app/api/case.py`:
```python
import json
from pathlib import Path

from fastapi import APIRouter

from app.api.errors import error_response

router = APIRouter()

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "accounts.json"

with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
    _DATA = json.load(f)

_BY_ID = {a["account_id"]: a for a in _DATA["accounts"]}


@router.get("/api/case/{account_id}")
def get_case(account_id: str):
    account = _BY_ID.get(account_id)
    if account is None:
        return error_response(
            status_code=404,
            error_code="ACCOUNT_NOT_FOUND",
            message=f"No case found for account {account_id}.",
            retryable=False,
            resource_id=account_id,
            corrective_action="Check the account id and return to the queue.",
        )
    return {
        **account,
        "model_version": _DATA["model_version"],
        "threshold_version": _DATA["threshold_version"],
    }
```

- [ ] **Step 3: Wire the router into `app/main.py`**

Add the import and `include_router` call alongside the queue router:
```python
from app.api.case import router as case_router
...
app.include_router(case_router)
```

Full `app/main.py` after this change:
```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.queue import router as queue_router
from app.api.case import router as case_router

app = FastAPI(title="MuleShield")

app.include_router(queue_router)
app.include_router(case_router)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
```

- [ ] **Step 4: Verify manually**

Run: `uvicorn app.main:app --port 8000 --reload` (background), then:
`curl -s http://127.0.0.1:8000/api/case/ACC09062`
Expected: JSON with `"account_id": "ACC09062"` and a 4-item `"evidence"` array.

`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/case/NOPE`
Expected: `404`

`curl -s http://127.0.0.1:8000/api/case/NOPE`
Expected: `{"error_code": "ACCOUNT_NOT_FOUND", ...}`

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add app/api/errors.py app/api/case.py app/main.py
git commit -m "feat: add GET /api/case/{account_id} endpoint"
```

---

## Task 5: Hold (maker-checker) API endpoints

**Files:**
- Create: `app/api/hold.py`
- Modify: `app/main.py`

**Interfaces:**
- Consumes: `error_response` from `app/api/errors.py` (Task 4).
- Produces: `POST /api/hold` and `POST /api/hold/{hold_id}/decision`, and `GET /api/hold/{hold_id}`, backed by an in-memory `_HOLDS: dict[str, dict]`. This is the only in-process mutable state in the app — later frontend tasks (Task 10) rely on the exact field names in the responses below.

`POST /api/hold` request body: `{"account_id": str, "action": str, "rationale": str, "maker": str}`
`POST /api/hold` response (201): `{"hold_id": str, "status": "pending", "account_id": str, "action": str, "rationale": str, "maker": str, "created_at": iso8601 str, "expires_at": iso8601 str}`

`POST /api/hold/{hold_id}/decision` request body: `{"checker": str, "decision": "approve"|"reject", "note": str | None}`
Success response (200): `{"hold_id": str, "status": "approved"|"rejected", "maker": str, "checker": str, "decision_note": str|None, "audit_reference": str}`

Error cases (all via `error_response`):
- unknown `hold_id` → 404 `HOLD_NOT_FOUND`
- `maker == checker` → 409 `MAKER_CHECKER_CONFLICT`
- hold already has a terminal status → 409 `HOLD_ALREADY_DECIDED`
- `now > expires_at` and `decision == "approve"` → 409 `HOLD_EXPIRED` (rejection is still allowed on an expired hold)
- `decision == "reject"` and no `note` → 422 `HOLD_MAKER_REQUIRED` is wrong code name; use `HOLD_REJECTION_NOTE_REQUIRED`... — **use exactly `HOLD_MAKER_REQUIRED` only for a missing `maker` on POST /api/hold**, and a distinct code for a missing rejection note. See implementation below for the exact codes.

- [ ] **Step 1: Write the hold router**

`app/api/hold.py`:
```python
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body

from app.api.errors import error_response

router = APIRouter()

_HOLDS: dict[str, dict] = {}

HOLD_TTL_MINUTES = 30


def _audit_reference(hold_id: str, event: str) -> str:
    payload = f"{hold_id}:{event}:{datetime.now(timezone.utc).isoformat()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


@router.post("/api/hold", status_code=201)
def create_hold(payload: dict = Body(...)):
    account_id = payload.get("account_id")
    action = payload.get("action")
    rationale = payload.get("rationale")
    maker = payload.get("maker")

    if not maker:
        return error_response(
            status_code=422,
            error_code="HOLD_MAKER_REQUIRED",
            message="A maker identity is required to propose a hold.",
            retryable=False,
            corrective_action="Select the analyst identity proposing this action.",
        )
    if not account_id or not action or not rationale:
        return error_response(
            status_code=422,
            error_code="HOLD_MAKER_REQUIRED",
            message="account_id, action, and rationale are all required.",
            retryable=False,
        )

    hold_id = f"HOLD-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(timezone.utc)
    record = {
        "hold_id": hold_id,
        "status": "pending",
        "account_id": account_id,
        "action": action,
        "rationale": rationale,
        "maker": maker,
        "checker": None,
        "decision_note": None,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=HOLD_TTL_MINUTES)).isoformat(),
        "audit_reference": None,
    }
    _HOLDS[hold_id] = record
    return record


@router.get("/api/hold/{hold_id}")
def get_hold(hold_id: str):
    record = _HOLDS.get(hold_id)
    if record is None:
        return error_response(
            status_code=404,
            error_code="HOLD_NOT_FOUND",
            message=f"No hold found with id {hold_id}.",
            retryable=False,
            resource_id=hold_id,
        )
    return record


@router.post("/api/hold/{hold_id}/decision")
def decide_hold(hold_id: str, payload: dict = Body(...)):
    record = _HOLDS.get(hold_id)
    if record is None:
        return error_response(
            status_code=404,
            error_code="HOLD_NOT_FOUND",
            message=f"No hold found with id {hold_id}.",
            retryable=False,
            resource_id=hold_id,
        )

    if record["status"] != "pending":
        return error_response(
            status_code=409,
            error_code="HOLD_ALREADY_DECIDED",
            message=f"Hold {hold_id} was already {record['status']}.",
            retryable=False,
            resource_id=hold_id,
        )

    checker = payload.get("checker")
    decision = payload.get("decision")
    note = payload.get("note")

    if not checker or decision not in ("approve", "reject"):
        return error_response(
            status_code=422,
            error_code="HOLD_MAKER_REQUIRED",
            message="checker and a valid decision (approve|reject) are required.",
            retryable=False,
            resource_id=hold_id,
        )

    if checker == record["maker"]:
        return error_response(
            status_code=409,
            error_code="MAKER_CHECKER_CONFLICT",
            message="The checker must be a different person from the maker.",
            retryable=False,
            resource_id=hold_id,
            corrective_action="Switch to an independent senior analyst identity to approve or reject.",
        )

    now = datetime.now(timezone.utc)
    expires_at = datetime.fromisoformat(record["expires_at"])
    if decision == "approve" and now > expires_at:
        return error_response(
            status_code=409,
            error_code="HOLD_EXPIRED",
            message=f"Hold {hold_id} expired at {record['expires_at']} and can no longer be approved.",
            retryable=False,
            resource_id=hold_id,
            corrective_action="Return to the case and propose a new hold, or reject this one.",
        )

    if decision == "reject" and not note:
        return error_response(
            status_code=422,
            error_code="HOLD_REJECTION_NOTE_REQUIRED",
            message="A decision note is required to reject a hold.",
            retryable=False,
            resource_id=hold_id,
        )

    record["status"] = "approved" if decision == "approve" else "rejected"
    record["checker"] = checker
    record["decision_note"] = note
    record["audit_reference"] = _audit_reference(hold_id, record["status"])

    return {
        "hold_id": hold_id,
        "status": record["status"],
        "maker": record["maker"],
        "checker": record["checker"],
        "decision_note": record["decision_note"],
        "audit_reference": record["audit_reference"],
    }
```

- [ ] **Step 2: Wire the router into `app/main.py`**

Add to `app/main.py`:
```python
from app.api.hold import router as hold_router
...
app.include_router(hold_router)
```

- [ ] **Step 3: Verify manually — happy path**

Run: `uvicorn app.main:app --port 8000 --reload` (background), then:
```bash
curl -s -X POST http://127.0.0.1:8000/api/hold -H "Content-Type: application/json" -d "{\"account_id\":\"ACC09062\",\"action\":\"propose_hold\",\"rationale\":\"Fan-in pattern\",\"maker\":\"analyst.rao\"}"
```
Expected: 201-shaped JSON with `"status": "pending"` and a `hold_id` like `HOLD-XXXXXXXX`. Copy that `hold_id` for the next calls.

```bash
curl -s -X POST http://127.0.0.1:8000/api/hold/<hold_id>/decision -H "Content-Type: application/json" -d "{\"checker\":\"analyst.rao\",\"decision\":\"approve\"}"
```
Expected: `{"error_code": "MAKER_CHECKER_CONFLICT", ...}` (same maker/checker).

```bash
curl -s -X POST http://127.0.0.1:8000/api/hold/<hold_id>/decision -H "Content-Type: application/json" -d "{\"checker\":\"senior.iyer\",\"decision\":\"approve\"}"
```
Expected: `{"status": "approved", "maker": "analyst.rao", "checker": "senior.iyer", "audit_reference": "<16-char hex>"}`

```bash
curl -s -X POST http://127.0.0.1:8000/api/hold/<hold_id>/decision -H "Content-Type: application/json" -d "{\"checker\":\"senior.iyer\",\"decision\":\"approve\"}"
```
Expected: `{"error_code": "HOLD_ALREADY_DECIDED", ...}`

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add app/api/hold.py app/main.py
git commit -m "feat: add maker-checker hold endpoints with server-enforced invariants"
```

---

## Task 6: Design tokens (`tokens.css`)

**Files:**
- Create: `static/css/tokens.css`

**Interfaces:**
- Produces: CSS custom properties on `:root` consumed by every CSS file in Tasks 7-12. Property names below are the exact names later tasks reference — do not rename.

- [ ] **Step 1: Write the token file**

`static/css/tokens.css`:
```css
:root {
  /* Foundation */
  --color-paper: #FAF8F4;
  --color-surface: #FFFFFF;
  --color-ink: #1A1A1A;
  --color-navy: #1F3A5F;
  --color-muted: #6B7280;
  --color-sand: #EDE7DA;
  --color-border: #D8D5CF;
  --color-border-strong: #A8A39A;

  /* Risk bands */
  --band-critical: #7F1D1D;
  --band-urgent: #B45309;
  --band-investigate: #CA8A04;
  --band-watch: #D6D3D1;
  --band-broad-watch: #9CA3AF;
  --band-no-alert: #E5E7EB;

  /* Provenance / system */
  --color-simulated: #2E7D8F;
  --color-verified: #2F6B4F;
  --color-warning: #8A5A00;
  --color-error: #9F1D27;
  --color-information: #315D86;

  /* Type */
  --font-ui: "Segoe UI", sans-serif;
  --font-mono: Consolas, "SFMono-Regular", monospace;

  /* Spacing (4px base) */
  --space-2xs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;

  /* Radii */
  --radius-sm: 3px;
  --radius-md: 6px;
  --radius-lg: 8px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.4;
}

.font-mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 2: Verify manually**

Open `static/css/tokens.css` and confirm every hex value matches the source doc §5.2 table exactly (Paper `#FAF8F4`, Surface `#FFFFFF`, Ink `#1A1A1A`, Navy `#1F3A5F`, Muted `#6B7280`, Sand `#EDE7DA`, Border `#D8D5CF`, Strong border `#A8A39A`; Critical `#7F1D1D`, Urgent `#B45309`, Investigate `#CA8A04`, Watch `#D6D3D1`, BroadWatch `#9CA3AF`, NoAlert `#E5E7EB`; Simulated `#2E7D8F`, Verified `#2F6B4F`, Warning `#8A5A00`, Error `#9F1D27`, Information `#315D86`).

- [ ] **Step 3: Commit**

```bash
git add static/css/tokens.css
git commit -m "feat: add design token stylesheet"
```

---

## Task 7: App shell — HTML structure, shell CSS, router

**Files:**
- Modify: `static/index.html`
- Create: `static/css/shell.css`
- Create: `static/js/router.js`
- Create: `static/js/api.js`

**Interfaces:**
- Produces: `window` global routing via `static/js/router.js` exporting `registerScreen(name, mountFn)` and starting hash-based navigation (`#/queue`, `#/case/{id}`); a `<div id="screen-mount">` in `index.html` that screens render into.
- Produces: `static/js/api.js` exporting `async function apiGet(path)` and `async function apiPost(path, body)`, both of which throw an `ApiError` (with `.errorCode`, `.message`, `.retryable`, `.resourceId`, `.correctiveAction`) on any non-2xx response, parsed from the error shape defined in Task 4/5. Later tasks (8, 9, 10) import from this module.
- Consumes: `tokens.css` (Task 6).

- [ ] **Step 1: Write `static/js/api.js`**

```javascript
export class ApiError extends Error {
  constructor({ error_code, message, retryable, resource_id, corrective_action }) {
    super(message);
    this.errorCode = error_code;
    this.retryable = retryable;
    this.resourceId = resource_id;
    this.correctiveAction = corrective_action;
  }
}

async function handle(response) {
  if (response.ok) {
    return response.json();
  }
  const body = await response.json().catch(() => ({
    error_code: "UNKNOWN_ERROR",
    message: `Request failed with status ${response.status}`,
    retryable: false,
    resource_id: null,
    corrective_action: null,
  }));
  throw new ApiError(body);
}

export async function apiGet(path) {
  const response = await fetch(path);
  return handle(response);
}

export async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle(response);
}
```

- [ ] **Step 2: Write `static/js/router.js`**

```javascript
const screens = new Map();
let mountEl = null;

export function registerScreen(name, mountFn) {
  screens.set(name, mountFn);
}

function parseHash() {
  const hash = window.location.hash.replace(/^#\//, "");
  const [name, ...rest] = hash.split("/");
  return { name: name || "queue", params: rest };
}

async function render() {
  const { name, params } = parseHash();
  const mountFn = screens.get(name);
  mountEl.innerHTML = "";
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("nav-item--active", el.dataset.screen === name);
  });
  if (!mountFn) {
    mountEl.innerHTML = `<div class="empty-state"><p>Unknown screen: ${name}</p></div>`;
    return;
  }
  await mountFn(mountEl, params);
}

export function startRouter(mountElement) {
  mountEl = mountElement;
  window.addEventListener("hashchange", render);
  if (!window.location.hash) {
    window.location.hash = "#/queue";
  } else {
    render();
  }
}

export function navigateTo(hash) {
  window.location.hash = hash;
}
```

- [ ] **Step 3: Write `static/css/shell.css`**

```css
.app-shell {
  display: grid;
  grid-template-columns: 224px 1fr;
  grid-template-rows: 56px 1fr;
  grid-template-areas:
    "topbar topbar"
    "sidebar main";
  height: 100vh;
}

.topbar {
  grid-area: topbar;
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: 0 var(--space-lg);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.topbar__wordmark {
  font-weight: 700;
  font-size: 20px;
  color: var(--color-navy);
}

.topbar__badge {
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.04em;
  padding: var(--space-2xs) var(--space-xs);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-muted);
}

.topbar__meta {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-muted);
}

.sidebar {
  grid-area: sidebar;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: var(--space-lg) 0;
}

.nav-item {
  display: block;
  padding: var(--space-sm) var(--space-lg);
  border-left: 3px solid transparent;
  color: var(--color-ink);
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
}

.nav-item--active {
  border-left-color: var(--color-navy);
  background: var(--color-sand);
  font-weight: 650;
}

.sidebar__footer {
  margin-top: auto;
  padding: var(--space-lg);
  border-top: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-muted);
}

.system-status-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2xs) 0;
}

.system-status-row__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: var(--space-xs);
}

.system-status-row__dot--ok { background: var(--color-verified); }
.system-status-row__dot--error { background: var(--color-error); }

.main {
  grid-area: main;
  overflow-y: auto;
  padding: var(--space-xl);
}
```

- [ ] **Step 4: Replace `static/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MuleShield</title>
  <link rel="stylesheet" href="/css/tokens.css" />
  <link rel="stylesheet" href="/css/shell.css" />
  <link rel="stylesheet" href="/css/components.css" />
  <link rel="stylesheet" href="/css/queue.css" />
  <link rel="stylesheet" href="/css/case.css" />
  <link rel="stylesheet" href="/css/drawer.css" />
</head>
<body>
  <div class="app-shell">
    <div class="topbar">
      <span class="topbar__wordmark">MuleShield</span>
      <span class="topbar__badge">LOCAL DEMO</span>
      <div class="topbar__meta">
        <span id="topbar-model-version" class="font-mono">model: —</span>
        <span id="topbar-audit-status">audit: —</span>
        <label>
          role:
          <select id="role-switcher">
            <option value="analyst">Analyst</option>
            <option value="senior">Senior Analyst</option>
            <option value="auditor">Auditor</option>
          </select>
        </label>
      </div>
    </div>
    <nav class="sidebar">
      <a class="nav-item" data-screen="queue" href="#/queue">Alert Queue</a>
      <a class="nav-item" data-screen="transactions" href="#/transactions">Transactions</a>
      <a class="nav-item" data-screen="ring" href="#/ring">Ring Explorer</a>
      <a class="nav-item" data-screen="governance" href="#/governance">Governance</a>
      <a class="nav-item" data-screen="model-card" href="#/model-card">Model Card</a>
      <div class="sidebar__footer">
        <div class="system-status-row"><span><span class="system-status-row__dot system-status-row__dot--ok"></span>API</span><span>online</span></div>
        <div class="system-status-row"><span><span class="system-status-row__dot system-status-row__dot--ok"></span>Model</span><span>loaded</span></div>
        <div class="system-status-row"><span><span class="system-status-row__dot system-status-row__dot--ok"></span>Audit chain</span><span>valid</span></div>
        <div class="system-status-row"><span><span class="system-status-row__dot system-status-row__dot--ok"></span>Data plane</span><span>simulated fixtures loaded</span></div>
      </div>
    </nav>
    <main class="main" id="screen-mount"></main>
  </div>
  <script type="module" src="/js/main.js"></script>
</body>
</html>
```

Note: `/js/main.js` is created in Task 12 (wires everything together). This task's HTML references it in advance; it will 404 harmlessly until Task 12 — that's expected and acceptable mid-plan.

- [ ] **Step 5: Verify manually**

Run: `uvicorn app.main:app --port 8000 --reload` (background), then:
`curl -s http://127.0.0.1:8000/css/tokens.css`
Expected: the CSS content from Task 6.
`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/`
Expected: `200`

Stop the server.

- [ ] **Step 6: Commit**

```bash
git add static/index.html static/css/shell.css static/js/router.js static/js/api.js
git commit -m "feat: add app shell HTML, shell styling, router, and api client"
```

---

## Task 8: Shared components — risk chip, provenance badge, skeleton, empty/error states

**Files:**
- Create: `static/css/components.css`
- Create: `static/js/components.js`

**Interfaces:**
- Produces (in `components.js`): `riskChip(band)`, `provenanceBadge(kind)` (`kind` is `"real" | "simulated" | "policy"`), `skeletonRows(count)`, `emptyState(message)`, `errorBanner(apiError)` — each returns an HTML string. Consumed by Task 9 (queue) and Task 10 (case/drawer).
- Consumes: `tokens.css` (Task 6).

- [ ] **Step 1: Write `static/css/components.css`**

```css
.chip {
  display: inline-block;
  padding: var(--space-2xs) var(--space-sm);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.chip--critical { background: var(--band-critical); color: #FFFFFF; }
.chip--urgent { background: var(--band-urgent); color: #FFFFFF; }
.chip--investigate { background: var(--band-investigate); color: var(--color-ink); }
.chip--watch { background: var(--band-watch); color: var(--color-ink); }
.chip--broad_watch { background: var(--band-broad-watch); color: var(--color-ink); }
.chip--no_alert { background: var(--band-no-alert); color: var(--color-muted); }

.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 650;
}

.badge--real {
  border-left: 3px solid var(--color-navy);
  color: var(--color-navy);
  background: transparent;
  padding-left: var(--space-xs);
}

.badge--simulated {
  border: 1px dashed var(--color-simulated);
  color: var(--color-simulated);
}

.badge--policy {
  border: 1px dotted var(--color-muted);
  color: var(--color-muted);
}

.skeleton-row {
  height: 44px;
  margin-bottom: var(--space-xs);
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--color-sand) 25%, var(--color-surface) 37%, var(--color-sand) 63%);
  background-size: 400% 100%;
  animation: skeleton-shimmer 1.4s ease infinite;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-row { animation: none; }
}

@keyframes skeleton-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

.empty-state {
  padding: var(--space-2xl);
  text-align: center;
  color: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.error-banner {
  padding: var(--space-md) var(--space-lg);
  border: 1px solid var(--color-error);
  background: #FBEAEA;
  color: var(--color-error);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-lg);
}

.error-banner__code {
  font-family: var(--font-mono);
  font-size: 11px;
}
```

- [ ] **Step 2: Write `static/js/components.js`**

```javascript
const BAND_LABELS = {
  critical: "Critical",
  urgent: "Urgent",
  investigate: "Investigate",
  watch: "Watch",
  broad_watch: "Broad Watch",
  no_alert: "No Alert",
};

export function riskChip(band) {
  const label = BAND_LABELS[band] || band;
  return `<span class="chip chip--${band}">${label}</span>`;
}

const PROVENANCE_LABELS = {
  real: "REAL",
  simulated: "SIMULATED",
  policy: "POLICY",
};

export function provenanceBadge(kind) {
  const label = PROVENANCE_LABELS[kind] || kind.toUpperCase();
  return `<span class="badge badge--${kind}">${label}</span>`;
}

export function skeletonRows(count) {
  return Array.from({ length: count }, () => `<div class="skeleton-row"></div>`).join("");
}

export function emptyState(message) {
  return `<div class="empty-state"><p>${message}</p></div>`;
}

export function errorBanner(apiError) {
  return `
    <div class="error-banner">
      <div class="error-banner__code">${apiError.errorCode}</div>
      <p>${apiError.message}</p>
      ${apiError.correctiveAction ? `<p>${apiError.correctiveAction}</p>` : ""}
    </div>
  `;
}
```

- [ ] **Step 3: Verify manually**

Run: `python -c "import ast; ast.parse(open('static/js/components.js').read())" ` — note: this only validates Python syntax, not JS. Instead verify by opening `static/js/components.js` and `static/css/components.css` and confirming they contain no syntax errors visually (balanced braces/quotes), since no JS toolchain is set up yet. Full functional verification happens in Task 9 once these are actually rendered in a screen.

- [ ] **Step 4: Commit**

```bash
git add static/css/components.css static/js/components.js
git commit -m "feat: add shared risk chip, provenance badge, skeleton, and empty/error state components"
```

---

## Task 9: Alert Queue screen

**Files:**
- Create: `static/css/queue.css`
- Create: `static/js/screens/queue.js`

**Interfaces:**
- Consumes: `apiGet` (Task 7), `riskChip`, `skeletonRows`, `emptyState`, `errorBanner` (Task 8), `navigateTo` (Task 7).
- Produces: `export async function mountQueue(mountEl)` — Task 12 registers this under the `"queue"` screen name.

- [ ] **Step 1: Write `static/css/queue.css`**

```css
.queue-header {
  margin-bottom: var(--space-lg);
}

.queue-header h1 {
  font-size: 22px;
  font-weight: 650;
  margin: 0 0 var(--space-xs) 0;
}

.queue-header__summary {
  color: var(--color-muted);
  font-size: 13px;
  margin: 0 0 var(--space-2xs) 0;
}

.queue-header__scope {
  color: var(--color-muted);
  font-size: 12px;
  font-family: var(--font-mono);
  margin: 0;
}

.queue-tabs {
  display: flex;
  gap: var(--space-sm);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-md);
}

.queue-tab {
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-muted);
  border-bottom: 2px solid transparent;
}

.queue-tab--active {
  color: var(--color-ink);
  border-bottom-color: var(--color-navy);
  font-weight: 650;
}

.queue-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.queue-table thead th {
  position: sticky;
  top: 0;
  background: var(--color-surface);
  text-align: left;
  font-size: 12px;
  font-weight: 650;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.queue-table tbody tr {
  height: 44px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.queue-table tbody tr:hover,
.queue-table tbody tr:focus {
  background: var(--color-sand);
  outline: none;
}

.queue-table tbody tr.queue-row--selected {
  background: var(--color-sand);
  border-left: 3px solid var(--color-navy);
}

.queue-table td {
  padding: var(--space-sm) var(--space-md);
  font-size: 13px;
}
</style-omitted>
```

Correction — remove the stray closing tag at the end of the file above; the file must end at the final `}` of `.queue-table td`. (Write the file without the `</style-omitted>` line.)

- [ ] **Step 2: Write `static/js/screens/queue.js`**

```javascript
import { apiGet, ApiError } from "../api.js";
import { riskChip, skeletonRows, emptyState, errorBanner } from "../components.js";
import { navigateTo } from "../router.js";

const BANDS = [
  { key: null, label: "All" },
  { key: "critical", label: "Critical" },
  { key: "urgent", label: "Urgent" },
  { key: "investigate", label: "Investigate" },
  { key: "watch", label: "Watch" },
  { key: "broad_watch", label: "Broad Watch" },
];

export async function mountQueue(mountEl) {
  let activeBand = null;

  async function renderTable() {
    const tableHost = mountEl.querySelector("#queue-table-host");
    tableHost.innerHTML = skeletonRows(6);
    try {
      const data = await apiGet(`/api/queue${activeBand ? `?band=${activeBand}` : ""}`);
      if (data.items.length === 0) {
        tableHost.innerHTML = emptyState("No alerts in this band.");
        return;
      }
      tableHost.innerHTML = `
        <table class="queue-table">
          <thead>
            <tr>
              <th>#</th><th>Account</th><th>Raw risk</th><th>Display risk</th>
              <th>Band</th><th>Top evidence</th><th>Ev</th><th>Status</th><th>Age</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((row, i) => `
              <tr tabindex="0" data-account-id="${row.account_id}">
                <td>${i + 1}</td>
                <td class="font-mono">${row.account_id}</td>
                <td class="font-mono">${row.raw_score.toFixed(2)}</td>
                <td class="font-mono">${row.display_score.toFixed(2)}</td>
                <td>${riskChip(row.band)}</td>
                <td>${row.top_evidence_title}</td>
                <td class="font-mono">${row.evidence_count}</td>
                <td>${row.status}</td>
                <td>${row.age_hours}h</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
      tableHost.querySelectorAll("tbody tr").forEach((tr) => {
        const open = () => navigateTo(`#/case/${tr.dataset.accountId}`);
        tr.addEventListener("click", open);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter") open();
        });
      });

      const header = mountEl.querySelector("#queue-summary");
      header.innerHTML = `
        <p class="queue-header__summary">${data.band_counts.critical} Critical | ${Math.round(data.scope.evaluation_precision * 100)}% precision | ~${data.scope.workload_hours_estimate} analyst-hours</p>
        <p class="queue-header__scope">Top ${data.scope.displayed_total} displayed from ${data.scope.holdout_total} holdout accounts | model ${data.model_version} | threshold ${data.threshold_version}</p>
      `;
    } catch (err) {
      if (err instanceof ApiError) {
        tableHost.innerHTML = errorBanner(err);
      } else {
        throw err;
      }
    }
  }

  mountEl.innerHTML = `
    <div class="queue-header">
      <h1>Alert Queue</h1>
      <div id="queue-summary"></div>
    </div>
    <div class="queue-tabs">
      ${BANDS.map((b) => `<button class="queue-tab${b.key === activeBand ? " queue-tab--active" : ""}" data-band="${b.key || ""}">${b.label}</button>`).join("")}
    </div>
    <div id="queue-table-host"></div>
  `;

  mountEl.querySelectorAll(".queue-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeBand = btn.dataset.band || null;
      mountEl.querySelectorAll(".queue-tab").forEach((b) => b.classList.remove("queue-tab--active"));
      btn.classList.add("queue-tab--active");
      renderTable();
    });
  });

  await renderTable();
}
```

- [ ] **Step 3: Verify manually**

This screen cannot be fully exercised until Task 12 wires up `main.js` and registers it. Defer full verification to Task 12, Step 3. For now, just confirm both files are syntactically well-formed by reading them back (balanced braces, no stray text) — do this now before moving on.

- [ ] **Step 4: Commit**

```bash
git add static/css/queue.css static/js/screens/queue.js
git commit -m "feat: add Alert Queue screen"
```

---

## Task 10: Case Detail screen

**Files:**
- Create: `static/css/case.css`
- Create: `static/js/screens/case.js`

**Interfaces:**
- Consumes: `apiGet`, `ApiError` (Task 7); `riskChip`, `provenanceBadge`, `errorBanner`, `skeletonRows` (Task 8); `navigateTo` (Task 7).
- Produces: `export async function mountCase(mountEl, params)` where `params[0]` is the account id — Task 12 registers this under `"case"`. Also produces `export function openHoldDrawer(account)` which Task 11 imports and calls from the case screen's "Propose hold" button.

- [ ] **Step 1: Write `static/css/case.css`**

```css
.case-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.case-header__id {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 650;
}

.case-grid {
  display: grid;
  grid-template-columns: 7fr 3fr 2fr;
  gap: var(--space-lg);
}

@media (max-width: 1024px) {
  .case-grid {
    grid-template-columns: 1fr;
  }
  .case-grid__actions {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    background: var(--color-surface);
    box-shadow: -2px 0 8px rgba(0,0,0,0.08);
    transform: translateX(100%);
    transition: transform 180ms ease;
  }
  .case-grid__actions--open {
    transform: translateX(0);
  }
}

.evidence-row {
  padding: var(--space-md);
  margin-bottom: var(--space-sm);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.evidence-row__title {
  font-weight: 650;
  margin: 0 0 var(--space-xs) 0;
}

.evidence-row__value {
  color: var(--color-muted);
  font-size: 13px;
  margin: 0 0 var(--space-xs) 0;
}

.evidence-row__caveat {
  font-size: 12px;
  color: var(--color-warning);
  margin: var(--space-xs) 0 0 0;
}

.semantics-caveat {
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: var(--color-sand);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--color-muted);
}

.action-rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.btn-primary {
  background: var(--color-navy);
  color: #FFFFFF;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  height: 36px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
}

.btn-secondary {
  background: var(--color-surface);
  color: var(--color-ink);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  height: 36px;
  cursor: pointer;
  font-size: 13px;
}
```

- [ ] **Step 2: Write `static/js/screens/case.js`**

```javascript
import { apiGet, ApiError } from "../api.js";
import { riskChip, provenanceBadge, errorBanner, skeletonRows } from "../components.js";

let openDrawerFn = null;

export function registerHoldDrawer(fn) {
  openDrawerFn = fn;
}

function evidenceRowHtml(ev) {
  return `
    <div class="evidence-row">
      <p class="evidence-row__title">${ev.title} ${provenanceBadge(ev.provenance)}</p>
      ${ev.contribution != null ? `<p class="evidence-row__value font-mono">contribution: ${ev.contribution.toFixed(2)}</p>` : ""}
      ${ev.value ? `<p class="evidence-row__value">${ev.value}</p>` : ""}
      ${ev.caveat ? `<p class="evidence-row__caveat">${ev.caveat}</p>` : ""}
    </div>
  `;
}

export async function mountCase(mountEl, params) {
  const accountId = params[0];
  mountEl.innerHTML = skeletonRows(5);

  let account;
  try {
    account = await apiGet(`/api/case/${accountId}`);
  } catch (err) {
    if (err instanceof ApiError) {
      mountEl.innerHTML = errorBanner(err);
      return;
    }
    throw err;
  }

  mountEl.innerHTML = `
    <div class="case-header">
      <span class="case-header__id">${account.account_id}</span>
      ${riskChip(account.band)}
      <span class="font-mono">raw ${account.raw_score.toFixed(2)}</span>
      <span class="font-mono">calibrated ${account.display_score.toFixed(2)}</span>
      <span>${account.completeness}</span>
    </div>
    <div class="case-grid">
      <div class="case-grid__evidence">
        <h2>Evidence</h2>
        ${account.evidence.map(evidenceRowHtml).join("")}
        <p class="semantics-caveat">Feature meanings come from the supplied dictionary where available. Contributions explain model behavior; they are not independent findings of fraud.</p>
      </div>
      <div class="case-grid__context">
        <h2>Timeline</h2>
        ${account.timeline.map((t) => `<p class="evidence-row__value">${t.time} — ${t.label}</p>`).join("")}
      </div>
      <div class="case-grid__actions">
        <div class="action-rail">
          <button class="btn-primary" id="btn-propose-hold">Propose hold</button>
          <button class="btn-secondary" id="btn-false-positive">Mark false positive</button>
          <button class="btn-secondary" id="btn-escalate">Escalate</button>
        </div>
      </div>
    </div>
  `;

  mountEl.querySelector("#btn-propose-hold").addEventListener("click", () => {
    if (openDrawerFn) openDrawerFn(account);
  });
}
```

- [ ] **Step 3: Verify manually**

Defer full functional verification to Task 12, Step 3 (screens must be wired to the router first). Read both new files back now to confirm they are syntactically well-formed.

- [ ] **Step 4: Commit**

```bash
git add static/css/case.css static/js/screens/case.js
git commit -m "feat: add Case Detail screen"
```

---

## Task 11: Maker-checker drawer

**Files:**
- Create: `static/css/drawer.css`
- Create: `static/js/screens/makerChecker.js`
- Modify: `static/js/screens/case.js`

**Interfaces:**
- Consumes: `apiPost`, `ApiError` (Task 7); `account` object shape from Task 10's `mountCase`.
- Produces: `export function initHoldDrawer()` which creates the drawer DOM once and calls `registerHoldDrawer` (from Task 10) with an `openDrawer(account)` function. Task 12 calls `initHoldDrawer()` once at startup.

- [ ] **Step 1: Write `static/css/drawer.css`**

```css
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(26, 26, 26, 0.3);
  display: none;
  z-index: 10;
}

.drawer-overlay--open {
  display: block;
}

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  background: var(--color-surface);
  box-shadow: -2px 0 8px rgba(0,0,0,0.12);
  padding: var(--space-lg);
  transform: translateX(100%);
  transition: transform 200ms ease;
  overflow-y: auto;
}

.drawer--open {
  transform: translateX(0);
}

.drawer h2 {
  font-size: 15px;
  margin-top: 0;
}

.drawer label {
  display: block;
  font-size: 12px;
  font-weight: 650;
  margin-top: var(--space-md);
  margin-bottom: var(--space-2xs);
}

.drawer textarea,
.drawer select,
.drawer input {
  width: 100%;
  padding: var(--space-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  font-size: 13px;
}

.drawer__step {
  margin-top: var(--space-lg);
}

.drawer__audit-ref {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-verified);
}

.drawer__confirmation {
  padding: var(--space-md);
  background: var(--color-sand);
  border-radius: var(--radius-md);
  margin-top: var(--space-md);
}
```

- [ ] **Step 2: Write `static/js/screens/makerChecker.js`**

```javascript
import { apiPost, ApiError } from "../api.js";
import { errorBanner } from "../components.js";
import { registerHoldDrawer } from "./case.js";

export function initHoldDrawer() {
  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  const drawer = document.createElement("div");
  drawer.className = "drawer";
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  let currentAccount = null;
  let currentHold = null;

  function close() {
    overlay.classList.remove("drawer-overlay--open");
    drawer.classList.remove("drawer--open");
  }

  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  function renderProposeStep() {
    drawer.innerHTML = `
      <h2>Propose hold — ${currentAccount.account_id}</h2>
      <div id="drawer-error"></div>
      <label for="maker">Maker identity</label>
      <input id="maker" type="text" value="analyst.rao" />
      <label for="rationale">Rationale</label>
      <textarea id="rationale" rows="4">${currentAccount.top_evidence_title}</textarea>
      <div class="drawer__step">
        <button class="btn-primary" id="submit-proposal">Submit for independent approval</button>
      </div>
    `;
    drawer.querySelector("#submit-proposal").addEventListener("click", submitProposal);
  }

  async function submitProposal() {
    const maker = drawer.querySelector("#maker").value.trim();
    const rationale = drawer.querySelector("#rationale").value.trim();
    const errorHost = drawer.querySelector("#drawer-error");
    errorHost.innerHTML = "";
    try {
      currentHold = await apiPost("/api/hold", {
        account_id: currentAccount.account_id,
        action: "propose_hold",
        rationale,
        maker,
      });
      renderPendingStep();
    } catch (err) {
      if (err instanceof ApiError) {
        errorHost.innerHTML = errorBanner(err);
      } else {
        throw err;
      }
    }
  }

  function renderPendingStep() {
    drawer.innerHTML = `
      <h2>Pending independent approval</h2>
      <p>Hold <span class="font-mono">${currentHold.hold_id}</span> proposed by <strong>${currentHold.maker}</strong>.</p>
      <p>Expires: <span class="font-mono">${currentHold.expires_at}</span></p>
      <p>Switch to an independent senior analyst identity to approve or reject.</p>
      <div class="drawer__step">
        <label for="checker">Checker identity</label>
        <input id="checker" type="text" value="senior.iyer" />
        <label for="note">Decision note (required to reject)</label>
        <textarea id="note" rows="3"></textarea>
        <div id="drawer-error"></div>
        <button class="btn-primary" id="approve-btn">Approve recommendation</button>
        <button class="btn-secondary" id="reject-btn">Reject recommendation</button>
      </div>
    `;
    drawer.querySelector("#approve-btn").addEventListener("click", () => submitDecision("approve"));
    drawer.querySelector("#reject-btn").addEventListener("click", () => submitDecision("reject"));
  }

  async function submitDecision(decision) {
    const checker = drawer.querySelector("#checker").value.trim();
    const note = drawer.querySelector("#note").value.trim();
    const errorHost = drawer.querySelector("#drawer-error");
    errorHost.innerHTML = "";
    try {
      const result = await apiPost(`/api/hold/${currentHold.hold_id}/decision`, {
        checker,
        decision,
        note: note || null,
      });
      renderConfirmation(result);
    } catch (err) {
      if (err instanceof ApiError) {
        errorHost.innerHTML = errorBanner(err);
      } else {
        throw err;
      }
    }
  }

  function renderConfirmation(result) {
    drawer.innerHTML = `
      <h2>Decision recorded</h2>
      <div class="drawer__confirmation">
        <p>Status: <strong>${result.status}</strong></p>
        <p>Maker: ${result.maker} · Checker: ${result.checker}</p>
        <p class="drawer__audit-ref">Audit reference: ${result.audit_reference}</p>
      </div>
      <div class="drawer__step">
        <button class="btn-secondary" id="close-drawer">Close</button>
      </div>
    `;
    drawer.querySelector("#close-drawer").addEventListener("click", close);
  }

  function openDrawer(account) {
    currentAccount = account;
    currentHold = null;
    overlay.classList.add("drawer-overlay--open");
    drawer.classList.add("drawer--open");
    renderProposeStep();
  }

  registerHoldDrawer(openDrawer);
}
```

- [ ] **Step 3: Modify `static/js/screens/case.js`**

No code change needed — `registerHoldDrawer` and `openDrawerFn` already exist from Task 10, Step 2, and `makerChecker.js` imports and calls `registerHoldDrawer` at Task 12's startup. Skip this step's file modification; it is a no-op confirmation step. Re-read `static/js/screens/case.js` to confirm `registerHoldDrawer` is exported — if it is not present, add it now exactly as written in Task 10 Step 2.

- [ ] **Step 4: Verify manually**

Defer full functional verification to Task 12, Step 3. Read `static/css/drawer.css` and `static/js/screens/makerChecker.js` back now to confirm they are syntactically well-formed.

- [ ] **Step 5: Commit**

```bash
git add static/css/drawer.css static/js/screens/makerChecker.js
git commit -m "feat: add maker-checker drawer with 3-step flow and server-validated decisions"
```

---

## Task 12: Wire it all together — `main.js`, end-to-end manual verification

**Files:**
- Create: `static/js/main.js`

**Interfaces:**
- Consumes: `startRouter`, `registerScreen` (Task 7); `mountQueue` (Task 9); `mountCase` (Task 10); `initHoldDrawer` (Task 11).
- Produces: the fully wired app — this is the last task, no downstream consumers.

- [ ] **Step 1: Write `static/js/main.js`**

```javascript
import { registerScreen, startRouter } from "./router.js";
import { mountQueue } from "./screens/queue.js";
import { mountCase } from "./screens/case.js";
import { initHoldDrawer } from "./screens/makerChecker.js";
import { emptyState } from "./components.js";
import { apiGet } from "./api.js";

registerScreen("queue", mountQueue);
registerScreen("case", mountCase);
registerScreen("transactions", async (el) => {
  el.innerHTML = emptyState("Transactions screen is not part of this build.");
});
registerScreen("ring", async (el) => {
  el.innerHTML = emptyState("Ring Explorer is not part of this build.");
});
registerScreen("governance", async (el) => {
  el.innerHTML = emptyState("Governance screen is not part of this build.");
});
registerScreen("model-card", async (el) => {
  el.innerHTML = emptyState("Model Card screen is not part of this build.");
});

initHoldDrawer();
startRouter(document.getElementById("screen-mount"));

apiGet("/api/queue").then((data) => {
  document.getElementById("topbar-model-version").textContent = `model: ${data.model_version}`;
}).catch(() => {
  document.getElementById("topbar-model-version").textContent = "model: unavailable";
});
```

- [ ] **Step 2: Fix the stray artifact left in Task 9's `queue.css`**

Re-open `static/css/queue.css` and confirm the file ends cleanly with `.queue-table td { padding: var(--space-sm) var(--space-md); font-size: 13px; }` and contains no `</style-omitted>` text. If that stray text is present, remove it now.

- [ ] **Step 3: Full end-to-end manual verification**

Run: `uvicorn app.main:app --port 8000 --reload` (background).

Using a browser at `http://127.0.0.1:8000/`:
1. Confirm the queue table loads with 3 rows, header summary line shows model/threshold versions.
2. Click the "Critical" tab — confirm only the 2 critical rows show.
3. Click a row — confirm navigation to `#/case/ACC09062` and the case screen renders evidence rows, with `SIMULATED` badges on the graph-finding rows and the semantics caveat visible at the bottom of the evidence column.
4. Click "Propose hold" — confirm the drawer opens with the propose step, maker pre-filled.
5. Submit the proposal — confirm the drawer advances to the pending step showing the hold id and expiry.
6. Leave the checker field equal to the maker's identity and click "Approve recommendation" — confirm a `MAKER_CHECKER_CONFLICT` error banner renders inline in the drawer (does not close the drawer, does not lose the pending state).
7. Change the checker identity to a different value and click "Approve recommendation" — confirm the confirmation step shows status "approved" and an audit reference.
8. Refresh the page, navigate back to the same case, propose a new hold, and click "Reject recommendation" with an empty note — confirm a `HOLD_REJECTION_NOTE_REQUIRED` error banner appears and the drawer stays on the pending step.
9. Fill in a rejection note and click "Reject recommendation" again — confirm status "rejected" and an audit reference appear.
10. Navigate to `#/case/DOES-NOT-EXIST` directly via the URL bar — confirm an `ACCOUNT_NOT_FOUND` error banner renders instead of a blank or crashed page.
11. Resize the browser to 1280×720 — confirm no horizontal scrollbar appears and the action rail is still usable (either inline or, below 1024px, as a drawer per `case.css`'s media query).

Stop the server after verification.

- [ ] **Step 4: Commit**

```bash
git add static/js/main.js static/css/queue.css
git commit -m "feat: wire app shell, screens, and drawer together; end-to-end manual verification complete"
```

---

## Plan self-review notes

- **Spec coverage:** App shell/tokens (Task 6-7), risk chips/provenance badges/skeleton/empty/error (Task 8), Alert Queue (Task 9), Case Detail (Task 10), maker-checker drawer incl. all 6 error states from spec §10 (Task 5 backend + Task 11 frontend), audit confirmation (Task 11 `renderConfirmation`). Backend contracts from spec §14.2/14.3/14.4/14.5 implemented in Tasks 3-5. Out-of-scope items (Ring Explorer, Transactions, Governance, Model Card) render explicit "not part of this build" placeholders rather than broken links, satisfying the spec's shell nav requirement without overbuilding.
- **No automated tests:** every task substitutes curl/browser manual verification steps in place of pytest, per the locked brainstorming decision — called out again here as the known, deliberate gap.
- **Type/name consistency checked:** `account_id`, `raw_score`, `display_score`, `band`, `evidence[].provenance`, `hold_id`, `audit_reference` are used identically across Tasks 2-3-4-5 (backend) and 8-9-10-11 (frontend) — verified by re-reading each task's Interfaces block against the ones before it.
