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
            error_code="HOLD_FIELDS_REQUIRED",
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

    if checker == record["maker"]:
        return error_response(
            status_code=409,
            error_code="MAKER_CHECKER_CONFLICT",
            message="The checker must be a different person from the maker.",
            retryable=False,
            resource_id=hold_id,
            corrective_action="Switch to an independent senior analyst identity to approve or reject.",
        )

    if record["status"] != "pending":
        return error_response(
            status_code=409,
            error_code="HOLD_ALREADY_DECIDED",
            message=f"Hold {hold_id} was already {record['status']}.",
            retryable=False,
            resource_id=hold_id,
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
