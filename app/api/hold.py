"""Hold recommendations and the server-enforced maker-checker state machine.

State machine:

    RECOMMENDED -> PENDING_CHECKER -> APPROVED
                                   -> REJECTED
                -> EXPIRED

Every invariant below is enforced here, on the server. The console cannot
bypass any of them, and a failed decision never writes a successful audit entry
because the state change and the audit append share one SQLite transaction.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Body

from app.api.errors import error_response
from app.services import store

router = APIRouter()

# Simulated interception window. Short enough to demonstrate expiry on stage.
HOLD_TTL_MINUTES = 30

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"

with open(FIXTURE_DIR / "transactions.json", "r", encoding="utf-8") as _fh:
    _TRANSACTIONS = json.load(_fh)["transactions"]

with open(FIXTURE_DIR / "ring.json", "r", encoding="utf-8") as _fh:
    _RINGS = json.load(_fh)["rings"]

EXECUTION_STATEMENT = (
    "MuleShield records a recommendation only. The bank core system executes "
    "any actual restriction. No core-banking action is performed by this build."
)
IDENTITY_STATEMENT = (
    "DEMO IDENTITY - NOT AUTHENTICATION. Maker and checker names are "
    "demo-supplied and unverified. SSO, authentication and RBAC are not "
    "integrated."
)

STATUS_RECOMMENDED = "recommended"
STATUS_PENDING = "pending_checker"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
TERMINAL = (STATUS_APPROVED, STATUS_REJECTED)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _simulated_context(account_id: str) -> dict:
    """Highest-scoring simulated transaction for this account, if any."""
    candidates = [t for t in _TRANSACTIONS if t["source"] == account_id]
    if not candidates:
        return {
            "transaction_id": None,
            "counterparty": None,
            "amount": None,
            "channel": None,
            "ring_id": None,
            "affected_accounts": [],
        }
    txn = max(candidates, key=lambda t: t["txn_score"])
    ring = _RINGS.get(txn.get("ring") or "", {})
    affected = [
        n["id"] for n in ring.get("nodes", [])
        if n.get("type") == "account" and n["id"] != account_id
    ]
    return {
        "transaction_id": txn["transaction_id"],
        "counterparty": txn["destination"],
        "amount": txn["amount"],
        "channel": txn["channel"],
        "ring_id": txn.get("ring"),
        "affected_accounts": affected,
    }


def _decorate(record: dict) -> dict:
    """Attach the non-persisted disclosures every hold view must carry."""
    expires_at = datetime.fromisoformat(record["expires_at"])
    remaining = (expires_at - _now()).total_seconds()
    return {
        **record,
        "expired": remaining <= 0 and record["status"] not in TERMINAL,
        "seconds_remaining": max(0, int(remaining)),
        "interception_window_minutes": HOLD_TTL_MINUTES,
        "interception_window_simulated": True,
        "execution_statement": EXECUTION_STATEMENT,
        "identity_statement": IDENTITY_STATEMENT,
    }


@router.post("/api/hold", status_code=201)
@router.post("/api/prevention/holds", status_code=201)
def create_hold(payload: dict = Body(...)):
    """Create a recommendation and propose it in one step.

    The maker is recorded before any checker action, so the hold is persisted
    directly in PENDING_CHECKER.
    """
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
            error_code="HOLD_FIELDS_REQUIRED",
            message="account_id, action and rationale are all required.",
            retryable=False,
            corrective_action="Enter a rationale before submitting for approval.",
        )

    now = _now()
    context = _simulated_context(account_id)
    record = {
        "hold_id": "HOLD-" + uuid.uuid4().hex[:8].upper(),
        "status": STATUS_PENDING,
        "account_id": account_id,
        "action": action,
        "rationale": rationale,
        "maker": maker,
        "checker": None,
        "decision_note": None,
        "created_at": now.isoformat(),
        "proposed_at": now.isoformat(),
        "decided_at": None,
        "expires_at": (now + timedelta(minutes=HOLD_TTL_MINUTES)).isoformat(),
        "audit_reference": None,
        **context,
    }

    try:
        saved = store.insert_hold(record, actor=maker)
    except Exception as exc:  # pragma: no cover - defensive
        return error_response(
            status_code=500,
            error_code="AUDIT_WRITE_FAILED",
            message="The hold was not recorded because the audit write failed: %s" % exc,
            retryable=True,
            corrective_action="No action was recorded. Retry the proposal.",
        )
    return _decorate(saved)


@router.get("/api/prevention/holds")
def list_holds():
    holds = [_decorate(h) for h in store.list_holds()]
    return {
        "total": len(holds),
        "execution_statement": EXECUTION_STATEMENT,
        "identity_statement": IDENTITY_STATEMENT,
        "holds": holds,
    }


@router.get("/api/hold/{hold_id}")
@router.get("/api/prevention/holds/{hold_id}")
def get_hold(hold_id: str):
    record = store.get_hold(hold_id)
    if record is None:
        return error_response(
            status_code=404,
            error_code="HOLD_NOT_FOUND",
            message="No hold found with id %s." % hold_id,
            retryable=False,
            resource_id=hold_id,
            corrective_action="This record is stale. Return to the case.",
        )
    return _decorate(record)


@router.post("/api/prevention/holds/{hold_id}/propose")
def propose_hold(hold_id: str, payload: dict = Body(...)):
    """Attach a maker to a hold that is still in RECOMMENDED."""
    record = store.get_hold(hold_id)
    if record is None:
        return error_response(
            status_code=404,
            error_code="HOLD_NOT_FOUND",
            message="No hold found with id %s." % hold_id,
            retryable=False,
            resource_id=hold_id,
        )
    maker = payload.get("maker")
    if not maker:
        return error_response(
            status_code=422,
            error_code="HOLD_MAKER_REQUIRED",
            message="A maker identity is required to propose a hold.",
            retryable=False,
            resource_id=hold_id,
        )
    if record["status"] in TERMINAL:
        return error_response(
            status_code=409,
            error_code="HOLD_ALREADY_DECIDED",
            message="Hold %s was already %s." % (hold_id, record["status"]),
            retryable=False,
            resource_id=hold_id,
        )
    if record["status"] == STATUS_PENDING:
        return error_response(
            status_code=409,
            error_code="HOLD_ALREADY_PROPOSED",
            message="Hold %s is already pending independent approval." % hold_id,
            retryable=False,
            resource_id=hold_id,
        )
    return _decorate(store.decide_hold(hold_id, STATUS_PENDING, maker, None))


@router.post("/api/hold/{hold_id}/decision")
@router.post("/api/prevention/holds/{hold_id}/decide")
def decide_hold(hold_id: str, payload: dict = Body(...)):
    record = store.get_hold(hold_id)
    if record is None:
        return error_response(
            status_code=404,
            error_code="HOLD_NOT_FOUND",
            message="No hold found with id %s." % hold_id,
            retryable=False,
            resource_id=hold_id,
            corrective_action="This record is stale. Return to the case.",
        )

    checker = payload.get("checker")
    decision = payload.get("decision")
    note = payload.get("note")

    if not checker or decision not in ("approve", "reject"):
        return error_response(
            status_code=422,
            error_code="HOLD_DECISION_INVALID",
            message="checker and a valid decision (approve|reject) are required.",
            retryable=False,
            resource_id=hold_id,
        )

    # A terminal record is final for everyone, so this is checked before the
    # segregation-of-duties comparison.
    if record["status"] in TERMINAL:
        return error_response(
            status_code=409,
            error_code="HOLD_ALREADY_DECIDED",
            message="Hold %s was already %s by %s." % (
                hold_id, record["status"], record["checker"],
            ),
            retryable=False,
            resource_id=hold_id,
            corrective_action="This decision is final. Review it in the audit log.",
        )

    if not record["maker"]:
        return error_response(
            status_code=409,
            error_code="HOLD_MAKER_REQUIRED",
            message="Hold %s has no recorded maker and cannot be decided." % hold_id,
            retryable=False,
            resource_id=hold_id,
        )

    if checker == record["maker"]:
        return error_response(
            status_code=409,
            error_code="MAKER_CHECKER_CONFLICT",
            message="The checker must be a different person from the maker (%s)."
                    % record["maker"],
            retryable=False,
            resource_id=hold_id,
            corrective_action="Switch to an independent senior analyst identity to approve or reject.",
        )

    expires_at = datetime.fromisoformat(record["expires_at"])
    if decision == "approve" and _now() > expires_at:
        return error_response(
            status_code=409,
            error_code="HOLD_EXPIRED",
            message="The interception window for hold %s closed at %s. It can no "
                    "longer be approved." % (hold_id, record["expires_at"]),
            retryable=False,
            resource_id=hold_id,
            corrective_action="Reject this recommendation, or return to the case and propose a new one.",
        )

    if decision == "reject" and not note:
        return error_response(
            status_code=422,
            error_code="HOLD_REJECTION_NOTE_REQUIRED",
            message="A decision note is required to reject a hold.",
            retryable=False,
            resource_id=hold_id,
        )

    status = STATUS_APPROVED if decision == "approve" else STATUS_REJECTED
    try:
        saved = store.decide_hold(hold_id, status, checker, note)
    except Exception as exc:  # pragma: no cover - defensive
        return error_response(
            status_code=500,
            error_code="AUDIT_WRITE_FAILED",
            message="The decision was rolled back because the audit write failed: %s" % exc,
            retryable=True,
            resource_id=hold_id,
            corrective_action="No decision was recorded. Retry.",
        )
    return _decorate(saved)


@router.post("/api/alerts/{account_id}/decision")
def record_analyst_decision(account_id: str, payload: dict = Body(...)):
    """Analyst disposition. Requires a rationale and writes to the audit chain."""
    decision = payload.get("decision")
    rationale = payload.get("rationale")
    actor = payload.get("actor")

    if not actor:
        return error_response(
            status_code=422,
            error_code="DECISION_ACTOR_REQUIRED",
            message="An analyst identity is required to record a decision.",
            retryable=False,
            resource_id=account_id,
        )
    if decision not in ("confirm_mule", "false_positive", "escalate", "watchlist"):
        return error_response(
            status_code=422,
            error_code="DECISION_INVALID",
            message="decision must be one of confirm_mule, false_positive, "
                    "escalate or watchlist.",
            retryable=False,
            resource_id=account_id,
        )
    if not rationale:
        return error_response(
            status_code=422,
            error_code="DECISION_RATIONALE_REQUIRED",
            message="A rationale is required for every analyst decision.",
            retryable=False,
            resource_id=account_id,
            corrective_action="Describe why this disposition was chosen.",
        )

    try:
        ref = store.record_analyst_decision(account_id, decision, rationale, actor)
    except Exception as exc:  # pragma: no cover - defensive
        return error_response(
            status_code=500,
            error_code="AUDIT_WRITE_FAILED",
            message="The decision was not recorded: %s" % exc,
            retryable=True,
            resource_id=account_id,
        )
    return {
        "account_id": account_id,
        "decision": decision,
        "rationale": rationale,
        "actor": actor,
        "audit_reference": ref,
        "execution_statement": (
            "An analyst disposition is a record only. It does not restrict, "
            "freeze or otherwise act on the account."
        ),
    }
