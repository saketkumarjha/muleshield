"""Alert queue.

Ordering, banding and filtering are all server-side. The console never infers a
band, recomputes a threshold, or derives evaluation metrics from the rows it
happens to be showing.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.fixtures import ACCOUNTS, MODEL_META

router = APIRouter()

BANDS = ("critical", "urgent", "investigate", "watch", "broad_watch", "no_alert")
PAGE_SIZE = 50


def _row(acc: dict) -> dict:
    """Queue rows carry their own top evidence, so the console never issues one
    detail request per visible row."""
    return {
        "account_id": acc["account_id"],
        "rank": acc["rank"],
        "risk_score": acc["risk_score"],
        "band": acc["band"],
        "top_evidence_title": acc["top_evidence_title"],
        "evidence_count": acc["evidence_count"],
        "completeness": acc["completeness"],
        "recommended_action": acc["recommended_action"],
    }


@router.get("/api/queue")
@router.get("/api/alerts")
def get_queue(
    band: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
):
    accounts = ACCOUNTS["accounts"]

    filtered = accounts
    if band:
        filtered = [a for a in filtered if a["band"] == band]
    if search:
        needle = search.strip().lower()
        filtered = [a for a in filtered if needle in a["account_id"].lower()]

    total_filtered = len(filtered)
    total_pages = max(1, (total_filtered + PAGE_SIZE - 1) // PAGE_SIZE)
    start = (page - 1) * PAGE_SIZE
    page_items = filtered[start:start + PAGE_SIZE]

    return {
        **MODEL_META,
        "scope": ACCOUNTS["scope"],
        "workload": ACCOUNTS["workload"],
        # Exclusive buckets, for navigation.
        "band_counts": ACCOUNTS["band_counts"],
        "band_counts_semantics": ACCOUNTS["band_counts_semantics"],
        # Cumulative operating points, reported separately and never mixed in.
        "evaluation": ACCOUNTS["evaluation"],
        "provenance": ACCOUNTS["provenance"],
        "filter": {"band": band, "search": search},
        "page": page,
        "page_size": PAGE_SIZE,
        "total_pages": total_pages,
        "total_filtered": total_filtered,
        "items": [_row(a) for a in page_items],
    }
