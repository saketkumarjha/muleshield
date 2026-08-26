import json
from pathlib import Path

from fastapi import APIRouter

from app.api.hold import _HOLDS

router = APIRouter()

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _load(name: str):
    with open(FIXTURE_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


_TRANSACTIONS = _load("transactions.json")
_RING = _load("ring.json")
_GOVERNANCE = _load("governance.json")
_MODEL_CARD = _load("model_card.json")


@router.get("/api/transactions")
def get_transactions():
    return _TRANSACTIONS


@router.get("/api/ring/{ring_id}")
def get_ring(ring_id: str):
    return _RING


@router.get("/api/governance")
def get_governance():
    decided = [h for h in _HOLDS.values() if h["status"] in ("approved", "rejected")]
    last_events = [
        {
            "hold_id": h["hold_id"],
            "status": h["status"],
            "maker": h["maker"],
            "checker": h["checker"],
            "audit_reference": h["audit_reference"],
        }
        for h in decided
    ]
    audit_chain = {
        "status": "valid",
        "entry_count": len(decided),
        "chain_head": last_events[-1]["audit_reference"] if last_events else "genesis",
        "last_events": last_events[-5:],
    }
    return {**_GOVERNANCE, "audit_chain": audit_chain}


@router.get("/api/model-card")
def get_model_card():
    return _MODEL_CARD
