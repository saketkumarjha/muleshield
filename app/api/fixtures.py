"""Single load point for the generated fixtures.

Every value in app/fixtures/ is produced by scripts/build_fixtures.py from the
frozen champion pack and the API runtime seed. Nothing here invents, rounds or
recomputes a model-dependent number.
"""

from __future__ import annotations

import json
from pathlib import Path

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def load(name: str):
    with open(FIXTURE_DIR / name, "r", encoding="utf-8") as fh:
        return json.load(fh)


ACCOUNTS = load("accounts.json")
GOVERNANCE = load("governance.json")
MODEL_CARD = load("model_card.json")
TRANSACTIONS = load("transactions.json")
RINGS = load("ring.json")

BY_ID = {a["account_id"]: a for a in ACCOUNTS["accounts"]}

MODEL_META = {
    "model_version": ACCOUNTS["model_version"],
    "threshold_version": ACCOUNTS["threshold_version"],
    "score_semantics": ACCOUNTS["score_semantics"],
}
