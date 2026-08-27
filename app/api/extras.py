"""Transactions, ring explorer, governance, model card, health and demo reset."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.errors import error_response
from app.api.fixtures import GOVERNANCE, MODEL_CARD, MODEL_META, RINGS, TRANSACTIONS
from app.services import store

router = APIRouter()


@router.get("/api/health")
def health():
    chain = store.verify_chain()
    return {
        **MODEL_META,
        "runtime_mode": "vercel_demo" if store.IS_VERCEL else "local_demo",
        "api_status": "online",
        "model_status": "loaded",
        "data_plane_status": "simulated fixtures loaded",
        "audit_chain_status": chain["status"],
        "persistence": store.PERSISTENCE,
        "fixture_provenance": GOVERNANCE["provenance"],
        "note": (
            "Prototype health only. This is not a production readiness "
            "signal."
        ),
    }


@router.get("/api/transactions")
def get_transactions():
    return {**MODEL_META, **TRANSACTIONS}


@router.get("/api/rings")
def list_rings():
    return {
        "simulated": True,
        "banner": RINGS["banner"],
        "default_ring_id": RINGS["default_ring_id"],
        "ring_ids": sorted(RINGS["rings"]),
    }


@router.get("/api/ring/{ring_id}")
def get_ring(ring_id: str):
    ring = RINGS["rings"].get(ring_id)
    if ring is None:
        return error_response(
            status_code=404,
            error_code="RING_NOT_FOUND",
            message="No simulated ring found with id %s." % ring_id,
            retryable=False,
            resource_id=ring_id,
            corrective_action="Choose a ring from the ring list.",
        )
    return {
        "simulated": True,
        "banner": RINGS["banner"],
        "default_ring_id": RINGS["default_ring_id"],
        "ring_ids": sorted(RINGS["rings"]),
        **ring,
    }


@router.get("/api/governance")
@router.get("/api/governance/audit")
def get_governance():
    """Audit-chain status is recomputed from the database on every request."""
    chain = store.verify_chain()
    return {
        **GOVERNANCE,
        "audit_chain": {
            **chain,
            "last_events": store.recent_events(limit=5),
            "verification": (
                "Recomputed on this request by re-hashing every stored entry "
                "against its predecessor. This is not a cached or constant value."
            ),
            "scope_note": (
                "A local hash chain detects alteration of recorded entries. It "
                "is not an external immutable ledger."
            ),
        },
    }


@router.get("/api/governance/model-card")
@router.get("/api/model-card")
def get_model_card():
    return MODEL_CARD


@router.get("/api/governance/thresholds")
def get_thresholds():
    return {
        **MODEL_META,
        "threshold_registry": GOVERNANCE["threshold_registry"],
        "note": GOVERNANCE["threshold_registry_note"],
    }


@router.get("/api/governance/coverage")
def get_coverage():
    return {
        "problem_statement_coverage": GOVERNANCE["problem_statement_coverage"],
        "note": GOVERNANCE["coverage_note"],
    }


@router.post("/api/demo/reset")
def reset_demo():
    """Explicit rehearsal reset. Never runs automatically at startup."""
    store.reset_db()
    return {
        "status": "reset",
        "note": "Holds and audit entries cleared. Fixtures are unchanged.",
    }
