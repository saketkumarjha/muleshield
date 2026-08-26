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
