"""Backend workflow tests.

Covers the definition-of-done list: queue filtering and pagination, independent
degradation of the simulated panels, the maker-checker state machine, analyst
decisions, audit-chain verification, and tamper detection.
"""

from __future__ import annotations

import importlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A fresh database per test, so decisions never leak between them."""
    monkeypatch.setenv("MULESHIELD_CONSOLE_DB", str(tmp_path / "console.db"))
    monkeypatch.delenv("MULESHIELD_SIMULATE_FIXTURE_OUTAGE", raising=False)

    from app.services import store
    importlib.reload(store)

    import app.api.hold as hold_mod
    import app.api.extras as extras_mod
    import app.main as main_mod
    for mod in (hold_mod, extras_mod, main_mod):
        importlib.reload(mod)

    with TestClient(main_mod.app) as c:
        c.store = store
        yield c


MAKER = "analyst.rao"
CHECKER = "senior.iyer"


def _propose(client, account_id="ACC09079", maker=MAKER):
    return client.post("/api/hold", json={
        "account_id": account_id,
        "action": "propose_hold",
        "rationale": "Top-ranked Critical alert; requesting independent review.",
        "maker": maker,
    })


# ------------------------------------------------------------------ health

def test_health_reports_active_model_and_valid_chain(client):
    body = client.get("/api/health").json()
    assert body["model_version"] == "muleshield_cat25_preplgb75_fixed_oof_ecdf_20260825"
    assert body["threshold_version"] == "single_row_oof_ecdf_5x5_seed42_fpr_v1_20260825"
    assert body["audit_chain_status"] == "valid"


# ------------------------------------------------------------------- queue

def test_queue_returns_authoritative_band_counts(client):
    body = client.get("/api/queue").json()
    assert body["band_counts"] == {
        "critical": 25, "urgent": 13, "investigate": 23,
        "watch": 115, "broad_watch": 73, "no_alert": 1568,
    }
    assert body["scope"]["holdout_total"] == 1817
    assert body["scope"]["labels_in_runtime_fixtures"] is False


def test_queue_reports_cumulative_operating_points_separately(client):
    body = client.get("/api/queue").json()
    assert "cumulative" in body["evaluation"]["semantics"]
    assert "exclusive" in body["band_counts_semantics"]
    critical = next(
        o for o in body["evaluation"]["operating_points"] if o["band"] == "critical"
    )
    assert critical["true_positives"] == 16
    assert critical["false_positives"] == 9
    assert critical["false_negatives"] == 0
    assert critical["precision"] == 0.64
    assert critical["recall"] == 1.0


def test_queue_band_filter_and_search(client):
    critical = client.get("/api/queue?band=critical").json()
    assert critical["total_filtered"] == 25
    assert all(i["band"] == "critical" for i in critical["items"])

    hit = client.get("/api/queue?search=ACC09079").json()
    assert hit["total_filtered"] == 1

    miss = client.get("/api/queue?search=NOPE").json()
    assert miss["total_filtered"] == 0
    assert miss["items"] == []


def test_queue_pagination(client):
    page1 = client.get("/api/queue?page=1").json()
    page2 = client.get("/api/queue?page=2").json()
    assert page1["total_filtered"] == 249
    assert len(page1["items"]) == 50
    assert page1["items"][0]["account_id"] != page2["items"][0]["account_id"]


def test_queue_rows_carry_top_evidence_so_there_is_no_n_plus_one(client):
    row = client.get("/api/queue?band=critical").json()["items"][0]
    assert row["top_evidence_title"]
    assert row["evidence_count"] > 0


def test_queue_never_exposes_ground_truth(client):
    raw = client.get("/api/queue?band=critical").text
    assert "_label_validation_only" not in raw
    assert "F3924" not in raw


# -------------------------------------------------------------------- case

def test_unknown_account_returns_404(client):
    r = client.get("/api/case/ACC00000")
    assert r.status_code == 404
    assert r.json()["error_code"] == "ACCOUNT_NOT_FOUND"


def test_case_carries_partial_explanation_disclosure(client):
    body = client.get("/api/case/ACC09079").json()
    assert body["explanation_disclaimer"] == "Partial explanation: CatBoost component (25%)"
    assert body["explanation_component_weight"] == 0.25
    assert body["evidence_counts"]["real"] > 0


def test_graph_outage_does_not_break_the_real_case(client, monkeypatch):
    monkeypatch.setenv("MULESHIELD_SIMULATE_FIXTURE_OUTAGE", "graph")
    case = client.get("/api/case/ACC09079")
    graph = client.get("/api/case/ACC09079/graph")
    assert case.status_code == 200          # real evidence still served
    assert case.json()["evidence_counts"]["real"] > 0
    assert graph.status_code == 503
    assert graph.json()["error_code"] == "GRAPH_FIXTURE_UNAVAILABLE"


def test_timeline_outage_does_not_break_the_real_case(client, monkeypatch):
    monkeypatch.setenv("MULESHIELD_SIMULATE_FIXTURE_OUTAGE", "timeline")
    case = client.get("/api/case/ACC09079")
    timeline = client.get("/api/case/ACC09079/timeline")
    assert case.status_code == 200
    assert timeline.status_code == 503
    assert timeline.json()["error_code"] == "TRANSACTION_FIXTURE_UNAVAILABLE"


def test_lower_band_reports_empty_simulated_context_as_valid_zero(client):
    watch = next(
        i for i in client.get("/api/queue?band=watch").json()["items"]
    )
    body = client.get(f"/api/case/{watch['account_id']}/timeline").json()
    assert body["available"] is False
    assert "valid result" in body["reason"]


# -------------------------------------------------------------------- hold

def test_hold_persists_and_survives_a_new_client(client):
    hold = _propose(client).json()
    assert hold["status"] == "pending_checker"
    assert hold["maker"] == MAKER
    assert hold["audit_reference"]

    fetched = client.get(f"/api/hold/{hold['hold_id']}").json()
    assert fetched["hold_id"] == hold["hold_id"]
    assert fetched["status"] == "pending_checker"

    # Straight from the database: the record is not process memory.
    assert client.store.get_hold(hold["hold_id"])["maker"] == MAKER


def test_hold_record_carries_the_required_disclosures(client):
    hold = _propose(client).json()
    assert "bank core system executes" in hold["execution_statement"]
    assert "NOT AUTHENTICATION" in hold["identity_statement"]
    assert hold["interception_window_simulated"] is True
    assert "affected_accounts" in hold


def test_proposal_without_maker_is_refused(client):
    r = client.post("/api/hold", json={
        "account_id": "ACC09079", "action": "propose_hold", "rationale": "x",
    })
    assert r.status_code == 422
    assert r.json()["error_code"] == "HOLD_MAKER_REQUIRED"


def test_proposal_without_rationale_is_refused(client):
    r = client.post("/api/hold", json={
        "account_id": "ACC09079", "action": "propose_hold", "maker": MAKER,
    })
    assert r.status_code == 422
    assert r.json()["error_code"] == "HOLD_FIELDS_REQUIRED"


def test_decision_on_unknown_hold_is_refused(client):
    r = client.post("/api/hold/HOLD-NOPE/decision",
                    json={"checker": CHECKER, "decision": "approve"})
    assert r.status_code == 404
    assert r.json()["error_code"] == "HOLD_NOT_FOUND"


def test_maker_cannot_be_their_own_checker(client):
    hold = _propose(client).json()
    r = client.post(f"/api/hold/{hold['hold_id']}/decision",
                    json={"checker": MAKER, "decision": "approve"})
    assert r.status_code == 409
    assert r.json()["error_code"] == "MAKER_CHECKER_CONFLICT"
    # The refused decision left the record untouched.
    assert client.get(f"/api/hold/{hold['hold_id']}").json()["status"] == "pending_checker"


def test_independent_checker_can_approve(client):
    hold = _propose(client).json()
    r = client.post(f"/api/hold/{hold['hold_id']}/decision",
                    json={"checker": CHECKER, "decision": "approve"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "approved"
    assert body["checker"] == CHECKER
    assert body["audit_reference"]


def test_reject_requires_a_note_and_then_succeeds(client):
    hold = _propose(client).json()
    missing = client.post(f"/api/hold/{hold['hold_id']}/decision",
                          json={"checker": CHECKER, "decision": "reject"})
    assert missing.status_code == 422
    assert missing.json()["error_code"] == "HOLD_REJECTION_NOTE_REQUIRED"

    ok = client.post(f"/api/hold/{hold['hold_id']}/decision",
                     json={"checker": CHECKER, "decision": "reject",
                           "note": "Evidence is insufficient for a restriction."})
    assert ok.status_code == 200
    assert ok.json()["status"] == "rejected"


def test_a_decided_hold_cannot_be_decided_again(client):
    hold = _propose(client).json()
    client.post(f"/api/hold/{hold['hold_id']}/decision",
                json={"checker": CHECKER, "decision": "approve"})
    again = client.post(f"/api/hold/{hold['hold_id']}/decision",
                        json={"checker": "auditor.mehta", "decision": "reject",
                              "note": "changed my mind"})
    assert again.status_code == 409
    assert again.json()["error_code"] == "HOLD_ALREADY_DECIDED"


def test_expired_hold_cannot_be_approved_but_can_be_rejected(client, tmp_path):
    hold = _propose(client).json()
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    conn = sqlite3.connect(tmp_path / "console.db")
    conn.execute("UPDATE holds SET expires_at = ? WHERE hold_id = ?",
                 (past, hold["hold_id"]))
    conn.commit()
    conn.close()

    approve = client.post(f"/api/hold/{hold['hold_id']}/decision",
                          json={"checker": CHECKER, "decision": "approve"})
    assert approve.status_code == 409
    assert approve.json()["error_code"] == "HOLD_EXPIRED"

    reject = client.post(f"/api/hold/{hold['hold_id']}/decision",
                         json={"checker": CHECKER, "decision": "reject",
                               "note": "Interception window closed."})
    assert reject.status_code == 200


def test_contract_named_prevention_routes_work(client):
    created = client.post("/api/prevention/holds", json={
        "account_id": "ACC09079", "action": "propose_hold",
        "rationale": "via the contract route", "maker": MAKER,
    })
    assert created.status_code == 201
    hold_id = created.json()["hold_id"]
    decided = client.post(f"/api/prevention/holds/{hold_id}/decide",
                          json={"checker": CHECKER, "decision": "approve"})
    assert decided.status_code == 200
    assert decided.json()["status"] == "approved"
    assert client.get("/api/prevention/holds").json()["total"] == 1


# -------------------------------------------------------- analyst decision

def test_analyst_decision_requires_a_rationale(client):
    r = client.post("/api/alerts/ACC09079/decision",
                    json={"decision": "escalate", "actor": MAKER})
    assert r.status_code == 422
    assert r.json()["error_code"] == "DECISION_RATIONALE_REQUIRED"


def test_analyst_decision_writes_an_audit_entry(client):
    before = client.get("/api/governance").json()["audit_chain"]["entry_count"]
    r = client.post("/api/alerts/ACC09079/decision", json={
        "decision": "escalate", "actor": MAKER,
        "rationale": "Model contributions warrant senior review.",
    })
    assert r.status_code == 200
    after = client.get("/api/governance").json()["audit_chain"]
    assert after["entry_count"] == before + 1
    assert after["status"] == "valid"


# -------------------------------------------------------------- audit chain

def test_chain_verifies_after_a_full_workflow(client):
    hold = _propose(client).json()
    client.post(f"/api/hold/{hold['hold_id']}/decision",
                json={"checker": CHECKER, "decision": "approve"})
    client.post("/api/alerts/ACC09079/decision", json={
        "decision": "confirm_mule", "actor": CHECKER, "rationale": "Approved hold.",
    })
    chain = client.get("/api/governance").json()["audit_chain"]
    assert chain["status"] == "valid"
    assert chain["entry_count"] == 3
    assert chain["failure"] is None


def test_tampering_with_a_recorded_entry_is_detected(client, tmp_path):
    hold = _propose(client).json()
    client.post(f"/api/hold/{hold['hold_id']}/decision",
                json={"checker": CHECKER, "decision": "approve"})
    assert client.get("/api/governance").json()["audit_chain"]["status"] == "valid"

    # Rewrite a stored payload without touching its hash.
    conn = sqlite3.connect(tmp_path / "console.db")
    row = conn.execute(
        "SELECT seq, payload FROM audit_events ORDER BY seq ASC LIMIT 1"
    ).fetchone()
    payload = json.loads(row[1])
    payload["maker"] = "someone.else"
    conn.execute("UPDATE audit_events SET payload = ? WHERE seq = ?",
                 (json.dumps(payload, sort_keys=True, separators=(",", ":")), row[0]))
    conn.commit()
    conn.close()

    chain = client.get("/api/governance").json()["audit_chain"]
    assert chain["status"] == "broken"
    assert chain["failure"]["seq"] == row[0]
    assert client.get("/api/health").json()["audit_chain_status"] == "broken"


def test_demo_reset_clears_state_explicitly(client):
    _propose(client)
    assert client.get("/api/governance").json()["audit_chain"]["entry_count"] == 1
    client.post("/api/demo/reset")
    chain = client.get("/api/governance").json()["audit_chain"]
    assert chain["entry_count"] == 0
    assert chain["status"] == "valid"


# --------------------------------------------------------------- governance

def test_coverage_uses_the_four_data_statuses_and_no_aggregate_score(client):
    coverage = client.get("/api/governance/coverage").json()
    statuses = {c["status"] for c in coverage["problem_statement_coverage"]}
    assert statuses <= {"validated_real", "implemented_simulated", "policy", "unavailable"}
    assert "done" not in statuses
    assert len(coverage["problem_statement_coverage"]) == 10


def test_thresholds_match_the_frozen_registry(client):
    rows = client.get("/api/governance/thresholds").json()["threshold_registry"]
    by_band = {r["band"]: r for r in rows}
    assert by_band["critical"]["raw_threshold"] == pytest.approx(0.981942532690984)
    assert by_band["investigate"]["raw_threshold"] == pytest.approx(0.94462319339298)
    assert by_band["critical"]["holdout_alerts_exclusive"] == 25
    assert by_band["critical"]["holdout_alerts_cumulative"] == 25


def test_governance_states_the_month_confound_and_no_time_split(client):
    warnings = " ".join(client.get("/api/governance").json()["leakage_warnings"]).lower()
    assert "class-period confound" in warnings
    assert "not a time-based split" in warnings
    assert "f2230" in warnings and "f3912" in warnings


def test_model_card_does_not_claim_calibration_or_a_time_split(client):
    card = client.get("/api/model-card").json()
    assert "No probability calibration is applied" in card["calibration"]
    assert "NOT a time-based split" in card["training_holdout_split"]["method"]
    assert card["training_holdout_split"]["train_accounts"] == 7265
    assert card["training_holdout_split"]["train_mules"] == 65
    assert card["training_holdout_split"]["holdout_mules"] == 16
    assert "25% CatBoost" in card["identity"]["family"]
    assert "22.3" in card["seed_sensitivity"]


def test_model_card_limitations_precede_deployment_claims(client):
    card = client.get("/api/model-card").json()
    keys = list(card.keys())
    assert keys.index("limitations") < keys.index("deployment_design")


def test_transactions_surface_carries_no_accuracy_claim(client):
    body = client.get("/api/transactions").json()
    assert "not a trained transaction classifier" in body["disclosure"].lower()
    assert body["simulated"] is True


def test_ring_lookup_respects_the_requested_id(client):
    ids = client.get("/api/rings").json()["ring_ids"]
    assert len(ids) > 1
    for ring_id in ids:
        assert client.get(f"/api/ring/{ring_id}").json()["ring_id"] == ring_id
    missing = client.get("/api/ring/RING-DOES-NOT-EXIST")
    assert missing.status_code == 404
    assert missing.json()["error_code"] == "RING_NOT_FOUND"
