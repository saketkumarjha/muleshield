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
