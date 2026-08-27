"""Case detail.

The case endpoint returns the real model evidence on its own. Simulated graph
and timeline context live behind separate endpoints so a missing or failing
simulated fixture degrades only its own panel and can never blank the real
model case.

Set MULESHIELD_SIMULATE_FIXTURE_OUTAGE=graph|timeline|both to rehearse the
degraded states without editing any fixture.
"""

from __future__ import annotations

import os

from fastapi import APIRouter

from app.api.errors import error_response
from app.api.fixtures import BY_ID, MODEL_META, RINGS

router = APIRouter()


def _outage(kind: str) -> bool:
    setting = os.environ.get("MULESHIELD_SIMULATE_FIXTURE_OUTAGE", "").lower()
    return setting in (kind, "both")


def _not_found(account_id: str):
    return error_response(
        status_code=404,
        error_code="ACCOUNT_NOT_FOUND",
        message="No case found for account %s." % account_id,
        retryable=False,
        resource_id=account_id,
        corrective_action="Check the account id and return to the queue.",
    )


@router.get("/api/case/{account_id}")
@router.get("/api/alerts/{account_id}")
def get_case(account_id: str):
    """Real model evidence only. Never fails because of a simulated fixture."""
    account = BY_ID.get(account_id)
    if account is None:
        return _not_found(account_id)

    evidence = account["evidence"]
    return {
        **MODEL_META,
        "account_id": account["account_id"],
        "row_id": account["row_id"],
        "rank": account["rank"],
        "risk_score": account["risk_score"],
        "band": account["band"],
        "completeness": account["completeness"],
        "recommended_action": account["recommended_action"],
        "top_evidence_title": account["top_evidence_title"],
        "evidence": evidence,
        "evidence_counts": {
            "real": sum(1 for e in evidence if e["provenance"] == "real"),
            "simulated": sum(1 for e in evidence if e["provenance"] == "simulated"),
            "policy": sum(1 for e in evidence if e["provenance"] == "policy"),
        },
        "explanation_scope": account["explanation_scope"],
        "explanation_component_weight": account["explanation_component_weight"],
        "explanation_disclaimer": "Partial explanation: CatBoost component (25%)",
        "leakage_note": account["leakage_note"],
        "semantics_caveat": account["semantics_caveat"],
        "action_disclaimer": (
            "An analyst disposition is a record only. MuleShield never restricts "
            "or freezes an account; the bank core system executes any action."
        ),
    }


@router.get("/api/case/{account_id}/graph")
@router.get("/api/alerts/{account_id}/graph")
def get_case_graph(account_id: str):
    """Simulated graph neighbourhood. Degrades independently of the case."""
    account = BY_ID.get(account_id)
    if account is None:
        return _not_found(account_id)

    if _outage("graph"):
        return error_response(
            status_code=503,
            error_code="GRAPH_FIXTURE_UNAVAILABLE",
            message="The simulated graph plane is unavailable. Real model "
                    "evidence for this case is unaffected.",
            retryable=True,
            resource_id=account_id,
            corrective_action="Continue with the model evidence; retry the graph panel later.",
        )

    ring_id = next(
        (e.get("ring_id") for e in account["evidence"] if e.get("ring_id")), None
    )
    ring = RINGS["rings"].get(ring_id) if ring_id else None

    if ring is None:
        return {
            **MODEL_META,
            "account_id": account_id,
            "available": False,
            "simulated": True,
            "reason": (
                "No simulated ring context was generated for this band. Zero is "
                "a valid result here, not missing data."
            ),
            "banner": RINGS["banner"],
            "ring": None,
        }

    return {
        **MODEL_META,
        "account_id": account_id,
        "available": True,
        "simulated": True,
        "banner": RINGS["banner"],
        "ring": ring,
    }


@router.get("/api/case/{account_id}/timeline")
@router.get("/api/alerts/{account_id}/timeline")
def get_case_timeline(account_id: str):
    """Simulated transaction timeline. Degrades independently of the case."""
    account = BY_ID.get(account_id)
    if account is None:
        return _not_found(account_id)

    if _outage("timeline"):
        return error_response(
            status_code=503,
            error_code="TRANSACTION_FIXTURE_UNAVAILABLE",
            message="The simulated transaction plane is unavailable. Real model "
                    "evidence for this case is unaffected.",
            retryable=True,
            resource_id=account_id,
            corrective_action="Continue with the model evidence; retry the timeline panel later.",
        )

    events = account.get("timeline", [])
    return {
        **MODEL_META,
        "account_id": account_id,
        "available": bool(events),
        "simulated": True,
        "banner": RINGS["banner"],
        "reason": None if events else (
            "No simulated transaction context was generated for this band. Zero "
            "is a valid result here, not missing data."
        ),
        "events": events,
    }
