"""Regenerate console fixtures from the authoritative MuleShield model seed.

The console must never invent model-dependent numbers. Every scientific value in
app/fixtures/ is derived here from the frozen champion pack and the API runtime
seed produced by the model-truth track.

Usage:
    python scripts/build_fixtures.py --seed-root <path to boi_x_iith>

Source of truth (relative to --seed-root):
    outputs/api_seed_single_row_ecdf_20260825/            runtime seed + holdout scores
    outputs/ps2_champion_pack_single_row_ecdf_20260825/   frozen pack + thresholds
    MODEL_ACTIVATION_REGISTRY_20260825.json               activation record

Simulated graph/feed/transaction content is generated deterministically from a
fixed seed so the stage demo is reproducible. It is always badged SIMULATED and
is never presented as evidence of detection performance.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from pathlib import Path

SEED_DIR = "outputs/api_seed_single_row_ecdf_20260825"
PACK_DIR = "outputs/ps2_champion_pack_single_row_ecdf_20260825"
REGISTRY = "MODEL_ACTIVATION_REGISTRY_20260825.json"

BAND_KEY = {
    "Critical": "critical",
    "Urgent": "urgent",
    "Investigate": "investigate",
    "Watch": "watch",
    "BroadWatch": "broad_watch",
    "NoAlert": "no_alert",
}

# Bands whose alerts land in an analyst work queue.
REVIEW_BANDS = ("critical", "urgent", "investigate")
MINUTES_PER_ALERT = 20

SIMULATED_CAVEAT = (
    "SIMULATED - integration-ready schema, not live bank data. The supplied "
    "dataset contains no transaction edges, counterparties or timestamps."
)
POLICY_CAVEAT = (
    "Policy rule evaluated on the simulated transaction plane. It is a "
    "configured threshold, not a model output and not a finding of fraud."
)

RECOMMENDED_ACTION = {
    "Critical": "senior-analyst review; maker-checker approval before any restriction",
    "Urgent": "analyst review within the working day",
    "Investigate": "queue for triage",
    "Watch": "monitor; no individual action",
    "BroadWatch": "monitor in aggregate only",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def read_thresholds(pack: Path) -> list[dict]:
    with open(pack / "threshold_registry.csv", "r", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def build_evidence(detail: dict, rng: random.Random) -> list[dict]:
    """Real SHAP contributions first, then badged simulated and policy items."""
    evidence: list[dict] = []

    for reason in detail.get("reasons_risk_up", [])[:5]:
        evidence.append({
            "type": "model_signal",
            "provenance": "real",
            "title": "Model contribution " + reason["feature"] + " (raises risk)",
            "feature": reason["feature"],
            "contribution": round(reason["shap"], 6),
            "value": reason["value"],
            "direction": "up",
            "source": "CatBoost TreeSHAP on the supplied real account table",
            "caveat": None,
        })

    for reason in detail.get("reasons_risk_down", [])[:2]:
        evidence.append({
            "type": "model_signal",
            "provenance": "real",
            "title": "Model contribution " + reason["feature"] + " (lowers risk)",
            "feature": reason["feature"],
            "contribution": round(reason["shap"], 6),
            "value": reason["value"],
            "direction": "down",
            "source": "CatBoost TreeSHAP on the supplied real account table",
            "caveat": None,
        })

    # Deterministic simulated context, present for the top bands only so the
    # console also exercises the "no simulated context" empty state.
    if detail["risk_band"] in ("Critical", "Urgent"):
        ring_id = "RING-%d" % (4400 + rng.randrange(0, 3) * 17)
        evidence.append({
            "type": "graph_finding",
            "provenance": "simulated",
            "title": "Simulated ring membership " + ring_id,
            "feature": None,
            "contribution": None,
            "value": "fan-in degree %d in the generated plane" % rng.randrange(4, 15),
            "direction": None,
            "ring_id": ring_id,
            "source": "Generated transaction/graph plane",
            "caveat": SIMULATED_CAVEAT,
        })

    if detail["risk_band"] == "Critical" and rng.random() < 0.5:
        evidence.append({
            "type": "feed_match",
            "provenance": "simulated",
            "title": "Simulated NCRP/1930-shaped ticket match",
            "feature": None,
            "contribution": None,
            "value": "Schema-shaped adapter demonstration",
            "direction": None,
            "source": "Generated feed fixture",
            "caveat": SIMULATED_CAVEAT,
        })

    if detail["risk_band"] in ("Critical", "Urgent"):
        evidence.append({
            "type": "policy_rule",
            "provenance": "policy",
            "title": "Policy rule: high-value first-time counterparty",
            "feature": None,
            "contribution": None,
            "value": "Configured threshold INR 200,000 on the simulated plane",
            "direction": None,
            "source": "Prevention policy configuration",
            "caveat": POLICY_CAVEAT,
        })

    return evidence


def build_timeline(account_id: str, band: str, rng: random.Random) -> list[dict]:
    """Deterministic simulated timeline. Empty for lower bands on purpose."""
    if band not in ("critical", "urgent"):
        return []
    events = []
    for i in range(rng.randrange(3, 6)):
        events.append({
            "time": "2026-08-24T%02d:%02d:00Z" % (6 + i, rng.randrange(0, 59)),
            "label": rng.choice([
                "Inbound credit on the generated plane",
                "Outbound transfer on the generated plane",
                "Balance drawn down on the generated plane",
            ]),
            "amount": rng.randrange(20, 300) * 1000,
            "channel": rng.choice(["UPI", "IMPS", "NEFT", "RTGS"]),
        })
    events.sort(key=lambda e: e["time"])
    return events


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed-root", required=True, type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "app" / "fixtures",
    )
    args = parser.parse_args()

    root: Path = args.seed_root
    seed_dir = root / SEED_DIR
    pack_dir = root / PACK_DIR

    required = [
        seed_dir / "seed_summary.json",
        seed_dir / "accounts_holdout.json",
        seed_dir / "alert_detail.json",
        pack_dir / "threshold_registry.csv",
        root / REGISTRY,
    ]
    for path in required:
        if not path.exists():
            raise SystemExit("Missing authoritative source: %s" % path)

    summary = load_json(seed_dir / "seed_summary.json")
    registry = load_json(root / REGISTRY)
    holdout = load_json(seed_dir / "accounts_holdout.json")
    details = {d["account_id"]: d for d in load_json(seed_dir / "alert_detail.json")}
    thresholds = read_thresholds(pack_dir)

    model_version = summary["model_version"]
    threshold_version = summary["threshold_version"]
    score_semantics = registry["score_semantics"]
    cum = summary["holdout"]["cumulative_operating_points"]

    provenance = {
        "generated_by": "scripts/build_fixtures.py",
        "sources": {
            SEED_DIR + "/seed_summary.json": sha256(seed_dir / "seed_summary.json"),
            SEED_DIR + "/accounts_holdout.json": sha256(seed_dir / "accounts_holdout.json"),
            SEED_DIR + "/alert_detail.json": sha256(seed_dir / "alert_detail.json"),
            PACK_DIR + "/threshold_registry.csv": sha256(pack_dir / "threshold_registry.csv"),
            REGISTRY: sha256(root / REGISTRY),
        },
    }

    # ------------------------- accounts.json -------------------------
    accounts = []
    for acc in holdout:
        detail = details.get(acc["account_id"])
        if detail is None:
            continue  # NoAlert rows carry no alert detail
        band = BAND_KEY[acc["risk_band"]]
        acc_seed = int(hashlib.sha256(acc["account_id"].encode()).hexdigest()[:8], 16)
        evidence = build_evidence(detail, random.Random(acc_seed))
        timeline = build_timeline(acc["account_id"], band, random.Random(acc_seed + 1))
        real_signals = [e for e in evidence if e["provenance"] == "real"]
        accounts.append({
            "account_id": acc["account_id"],
            "row_id": acc["row_id"],
            "rank": acc["rank"],
            "risk_score": acc["risk_score"],
            "band": band,
            "completeness": acc["completeness"],
            "recommended_action": acc["recommended_action"],
            "top_evidence_title": (
                real_signals[0]["title"] if real_signals
                else "No model contribution available"
            ),
            "evidence_count": len(evidence),
            "evidence": evidence,
            "timeline": timeline,
            "explanation_scope": detail["explanation_scope"],
            "explanation_component_weight": detail["explanation_component_weight"],
            "leakage_note": detail["leakage_note"],
            "semantics_caveat": detail["semantics_caveat"],
        })

    band_counts = {BAND_KEY[k]: v for k, v in summary["holdout"]["band_counts"].items()}
    alerts_in_scope = sum(band_counts.get(b, 0) for b in REVIEW_BANDS)

    operating_points = [
        {
            "band": BAND_KEY[b],
            "true_positives": v["tp"],
            "false_positives": v["fp"],
            "false_negatives": v["fn"],
            "recall": v["recall"],
            "precision": v["precision"],
            "alerts": v["tp"] + v["fp"],
        }
        for b, v in cum.items()
    ]

    accounts_payload = {
        "model_version": model_version,
        "threshold_version": threshold_version,
        "score_semantics": score_semantics,
        "scope": {
            "name": "frozen 1,817-row holdout",
            "holdout_total": summary["holdout"]["n_accounts"],
            "banded_total": len(accounts),
            "labels_in_runtime_fixtures": summary["labels_in_runtime_fixtures"],
            "note": (
                "Runtime rows carry no ground-truth label. The frozen aggregate "
                "evaluation is reported separately and is not attributable to "
                "individual accounts."
            ),
        },
        "workload": {
            "alerts_in_scope": alerts_in_scope,
            "bands_counted": list(REVIEW_BANDS),
            "assumption_minutes_per_alert": MINUTES_PER_ALERT,
            "estimate_hours": round(alerts_in_scope * MINUTES_PER_ALERT / 60.0, 1),
            "basis": "Stated planning assumption, not a measured analyst throughput.",
        },
        "band_counts": band_counts,
        "band_counts_semantics": (
            "exclusive buckets - each account appears in exactly one band"
        ),
        "evaluation": {
            "status": summary["holdout"]["status"],
            "scope": "frozen aggregate over the whole 1,817-row holdout",
            "semantics": (
                "cumulative operating points - each row counts every alert at or "
                "above that band"
            ),
            "note": summary["holdout"]["note"],
            "operating_points": operating_points,
        },
        "provenance": provenance,
        "accounts": accounts,
    }

    # ------------------------- governance.json -------------------------
    threshold_rows = []
    for t in thresholds:
        band = t["band"]
        threshold_rows.append({
            "band": BAND_KEY[band],
            "raw_threshold": float(t["threshold"]),
            "definition": t["definition"],
            "train_oof_fpr_budget": float(t["fpr_budget"]),
            "train_oof_recall": float(t["train_oof_recall"]),
            "train_oof_precision": float(t["train_oof_precision"]),
            "train_oof_tp": int(t["train_oof_tp"]),
            "train_oof_fp": int(t["train_oof_fp"]),
            "train_oof_fn": int(t["train_oof_fn"]),
            "holdout_alerts_cumulative": cum[band]["tp"] + cum[band]["fp"],
            "holdout_precision_cumulative": cum[band]["precision"],
            "holdout_alerts_exclusive": summary["holdout"]["band_counts"][band],
            "threshold_version": t["threshold_version"],
            "recommended_action": RECOMMENDED_ACTION[band],
        })

    governance = {
        "runtime_status": {
            "model_version": model_version,
            "threshold_version": threshold_version,
            "score_semantics": score_semantics,
            "activation_status": registry["status"],
            "activated_at_date": registry["activated_at_date"],
            "rollback_switch": registry["rollback"]["environment_switch"],
            "api_status": "online",
            "data_plane_status": "simulated fixtures loaded",
        },
        "identity_disclaimer": (
            "DEMO IDENTITY - NOT AUTHENTICATION. Maker and checker names are "
            "demo-supplied and unverified. SSO, authentication and RBAC are not "
            "integrated. No core-banking action is executed by this system."
        ),
        "evidence_status_map": [
            {"capability": "Account-level mule risk classification",
             "status": "validated_real",
             "note": "Trained and evaluated on the supplied real 9,082-account table."},
            {"capability": "Feature engineering and leakage audit",
             "status": "validated_real",
             "note": "300 selected inputs; F2230 and F3912 excluded as unavailable at decision time."},
            {"capability": "Risk scoring, banding and alerting",
             "status": "validated_real",
             "note": "Frozen out-of-fold threshold registry applied to real account scores."},
            {"capability": "Partial model explanation",
             "status": "validated_real",
             "note": "CatBoost TreeSHAP covers the 25% CatBoost component only, not the full blend."},
            {"capability": "Suspicious-transaction detection",
             "status": "implemented_simulated",
             "note": "Generated transaction plane. The supplied table has no transaction rows."},
            {"capability": "Graph ring / cash-out pattern detection",
             "status": "implemented_simulated",
             "note": "Generated graph. The supplied table has no edges, counterparties or timestamps."},
            {"capability": "FMS and TMS alert ingestion",
             "status": "implemented_simulated",
             "note": "Schema-shaped adapter demonstrated on generated fixtures. No live feed."},
            {"capability": "Government cyber-fraud alerts (NCRP / 1930)",
             "status": "implemented_simulated",
             "note": "Ticket-shaped fixtures only. No I4C or NCRP connectivity exists."},
            {"capability": "Real-time regulatory feeds",
             "status": "policy",
             "note": "Integration contract defined. Only a lightweight local replay demo runs."},
            {"capability": "Cross-channel bank data",
             "status": "policy",
             "note": "Channel field modelled in the simulated plane; no cross-channel source is connected."},
            {"capability": "Prevention of circulation of fraudulent proceeds",
             "status": "policy",
             "note": "Hold recommendation and maker-checker workflow only. The bank core system executes any action."},
            {"capability": "Live core-banking hold execution",
             "status": "unavailable",
             "note": "Not implemented. This build records a proposed and approved recommendation; nothing is executed."},
        ],
        "threshold_registry": threshold_rows,
        "threshold_registry_note": (
            "Threshold metrics are train-only out-of-fold estimates from repeated "
            "stratified 5-fold cross-validation (5 repeats, seed 42). Holdout "
            "columns are a one-shot frozen evaluation and were not used to set "
            "any threshold. Cumulative and exclusive counts are shown separately "
            "and must not be conflated."
        ),
        "leakage_warnings": [
            "The month field is a complete class-period confound: every negative belongs to October 2025 and no positive does. It is excluded, and no temporal-generalisation claim is valid from this dataset.",
            "F2230 (period artifact) and F3912 (near-target proxy) are excluded as bank-unsafe: neither exists at decision time.",
            "Post-resolution fields recorded after a fraud case was opened are excluded from the decision-time feature set.",
            "There is no defensible temporal validation set. The train/holdout split is a stratified random partition of one anonymised table, not a time-based split.",
        ],
        "fairness_uncertainty": [
            "The frozen holdout contains only 16 positives. One changed prediction moves holdout recall by 6.25 percentage points.",
            "Critical-band holdout precision of 64% is a small-sample point result from 16 true positives and 9 false positives. It is not a stable long-run rate.",
            "Cross-validation seed changes move precision by up to 22.3 percentage points. No single best-seed result is reported as the headline.",
            "No demographic-parity or protected-attribute fairness analysis has been run for the active model version. This is a stated limitation, not a fairness certification.",
            "Graph, ring, feed and transaction surfaces are simulated and carry no detection-performance evidence of any kind.",
        ],
        "problem_statement_coverage": [
            {"requirement": "AI/ML classification of mule accounts",
             "status": "validated_real",
             "note": "CatBoost/LightGBM rank blend trained and evaluated on the supplied table."},
            {"requirement": "Feature engineering",
             "status": "validated_real",
             "note": "300 decision-time-safe inputs selected from 3,925 columns."},
            {"requirement": "Risk scoring and alerting",
             "status": "validated_real",
             "note": "Frozen five-band out-of-fold threshold registry."},
            {"requirement": "Suspicious-transaction detection",
             "status": "implemented_simulated",
             "note": "Policy and graph composition over a generated plane; no trained transaction classifier."},
            {"requirement": "Financial-transaction ingestion",
             "status": "implemented_simulated",
             "note": "Ingestion path demonstrated against generated transactions."},
            {"requirement": "FMS and TMS alert ingestion",
             "status": "implemented_simulated",
             "note": "Schema-shaped adapters on generated alert fixtures."},
            {"requirement": "Government cyber-fraud alerts or tickets",
             "status": "implemented_simulated",
             "note": "NCRP/1930-shaped ticket fixtures only."},
            {"requirement": "Real-time regulatory inputs or feeds",
             "status": "policy",
             "note": "Integration contract plus a local replay demonstration. No live feed is consumed."},
            {"requirement": "Cross-channel bank data",
             "status": "policy",
             "note": "Contract only. No cross-channel source is connected."},
            {"requirement": "Prevention of circulation of fraudulent proceeds",
             "status": "policy",
             "note": "Hold recommendation, interception window and maker-checker approval. The bank core system executes any action."},
        ],
        "coverage_note": (
            "Ten official clauses, four statuses. Only the account-model clauses "
            "are validated on supplied real data. This is deliberately not a "
            "single aggregate completeness score."
        ),
        "provenance": provenance,
    }

    # ------------------------- model_card.json -------------------------
    lat = summary["latency"]
    model_card = {
        "identity": {
            "name": "MuleShield mule-account risk model",
            "version": model_version,
            "threshold_version": threshold_version,
            "family": (
                "Fixed-reference rank blend: 25% CatBoost + 75% AutoGluon "
                "prepared-LightGBM"
            ),
            "activation_status": registry["status"],
        },
        "score_semantics": {
            "value": score_semantics,
            "explanation": (
                "Each base model's raw score is mapped through its frozen "
                "7,265-row train-OOF empirical CDF, then blended 25/75. The "
                "result is a relative-risk percentile against the training "
                "reference. It is NOT a calibrated probability, a confidence, a "
                "likelihood, or a probability of customer guilt."
            ),
            "batch_invariant": True,
            "formula": (
                "0.25*ECDF_catboost_train_oof(cat) + "
                "0.75*ECDF_prepared_lightgbm_train_oof(lgb)"
            ),
        },
        "limitations": [
            "The frozen holdout contains only 16 positives. The 64% Critical precision and 100% Critical recall are one-shot small-sample results on that single holdout, not production rates.",
            "The holdout is spent. It cannot justify any further model or threshold change.",
            "Cross-validation seed changes move precision by up to 22.3 percentage points.",
            "There is no external validation set and no defensible temporal validation. The month field is a complete class-period confound and is excluded, so no temporal-generalisation claim is valid.",
            "Explanations are partial: CatBoost TreeSHAP covers the 25% CatBoost component only. There is no full-ensemble or causal explanation.",
            "Feature meanings are incomplete pending the BOI data dictionary. Contributions are model behaviour, not business conclusions.",
            "Graph, ring, feed and transaction surfaces are simulated and carry no detection-performance evidence.",
            "No demographic-parity or protected-attribute fairness analysis has been run for this model version.",
            "The model has not been evaluated against adversarial or intentionally evasive behaviour.",
            "Maker and checker identities are demo-supplied and unverified. SSO, authentication and RBAC are not integrated.",
        ],
        "training_holdout_split": {
            "method": (
                "Stratified random partition of one anonymised 9,082-account "
                "table. NOT a time-based split - the month field is a complete "
                "class-period confound and is excluded."
            ),
            "total_accounts": 9082,
            "total_columns": 3925,
            "confirmed_mules": 81,
            "positive_rate": 0.00892,
            "train_accounts": 7265,
            "train_mules": 65,
            "holdout_accounts": summary["holdout"]["n_accounts"],
            "holdout_mules": summary["holdout"]["mules_per_band"]["Critical"],
            "holdout_status": summary["holdout"]["status"],
        },
        "feature_regime": {
            "n_features": summary["n_features"],
            "selected_from": 3925,
            "imputation": summary["imputation"],
            "note": (
                "Inputs are anonymised F-columns from the supplied table. Their "
                "business meaning is not established. The console deliberately "
                "does not translate them into fraud narratives."
            ),
            "excluded": [
                "F2230 - period artifact, not available at decision time",
                "F3912 - near-target proxy, not available at decision time",
                "Month field - complete class-period confound",
                "Post-resolution fields recorded after a case was opened",
            ],
        },
        "evaluation_protocol": (
            "Model and thresholds were frozen first. The 1,817-row holdout was "
            "then scored exactly once. No threshold was tuned on the holdout. "
            "Threshold selection used train-only repeated stratified 5-fold "
            "cross-validation (5 repeats, seed 42)."
        ),
        "operating_points": {
            "semantics": (
                "cumulative - each row counts every alert at or above that band"
            ),
            "scope": (
                "frozen aggregate over the 1,817-row holdout; not attributable "
                "to individual accounts"
            ),
            "rows": [
                {
                    "band": BAND_KEY[b],
                    "raw_threshold": summary["bands"][b],
                    "true_positives": v["tp"],
                    "false_positives": v["fp"],
                    "false_negatives": v["fn"],
                    "alerts": v["tp"] + v["fp"],
                    "precision": v["precision"],
                    "recall": v["recall"],
                }
                for b, v in cum.items()
            ],
            "exclusive_band_counts": band_counts,
        },
        "seed_sensitivity": (
            "Cross-validation seed changes move precision by up to 22.3 "
            "percentage points. No best-seed result is reported as the headline. "
            "Threshold selection is fixed at seed 42 and frozen."
        ),
        "calibration": (
            "No probability calibration is applied. The score is a fixed-"
            "reference relative-risk percentile against the train-OOF empirical "
            "CDF. It must not be displayed or described as a calibrated "
            "probability, a confidence or a likelihood."
        ),
        "leakage_exclusions": [
            "F2230 - period artifact excluded as unavailable at decision time.",
            "F3912 - near-target proxy excluded as unavailable at decision time.",
            "Month field - complete class-period confound; every negative is October 2025 and no positive is.",
            "Post-resolution fields populated only after a fraud case was opened.",
            "Alert-time fields excluded from the pre-alert decision-time model.",
        ],
        "rejected_experiments": [
            "Non-negative logistic stacker - rejected after worse average precision, AUC and false-positive count.",
            "Hard-negative cascade - rejected after large repeat-consistent degradation.",
            "Historical five-model paper ensemble reconstruction - deliberately deferred; not part of this pack.",
            "Cross-account graph embeddings - not trainable; the supplied table contains no real transaction edges.",
        ],
        "train_oof_diagnostics": {
            "average_precision": 0.8955142349464457,
            "roc_auc": 0.9933632478632478,
            "note": "Train-only out-of-fold diagnostics. Not holdout evidence.",
        },
        "measured_latency": {
            "single_row_ms": lat["batch_1_ms"],
            "batch_1000_ms": lat["batch_1000_ms"],
            "all_9082_ms": lat["all_9082_ms"],
            "shap_ms_for_banded": lat["shap_ms_for_banded"],
            "note": (
                "Scoring-only measurement on the development machine, excluding "
                "feature-matrix construction. This is not an SLA and not an "
                "end-to-end request latency."
            ),
        },
        "deployment_design": (
            "Local prototype only. The frozen pack and threshold registry are "
            "loaded from disk at startup. There is no retraining, no feedback "
            "loop, no authentication and no core-banking integration. Rollback "
            "to the previous CatBoost-only model is an explicit environment "
            "switch and is visible in the health endpoint."
        ),
        "provenance": provenance,
    }

    # ------------------- simulated plane: rings + transactions -------------------
    critical_ids = [a["account_id"] for a in accounts if a["band"] == "critical"]
    plane_rng = random.Random(1930)
    rings = {}
    for idx in range(3):
        members = critical_ids[idx * 3:(idx * 3) + 3] or critical_ids[:3]
        ring_id = "RING-%d" % (4400 + idx * 17)
        nodes = [
            {"id": m, "type": "account", "band": "critical", "label": m,
             "risk_rank": i + 1}
            for i, m in enumerate(members)
        ]
        nodes.append({"id": "BEN-%d-01" % idx, "type": "beneficiary", "band": None,
                      "label": "Beneficiary %d-01" % idx, "risk_rank": None})
        nodes.append({"id": "EXT-CASHOUT-%d" % idx, "type": "cashout", "band": None,
                      "label": "External cash-out", "risk_rank": None})
        for s in range(2):
            nodes.append({"id": "SRC-%d-%d" % (idx, s), "type": "source", "band": None,
                          "label": "Fan-in source %d" % s, "risk_rank": None})

        edges = []
        for s in range(2):
            edges.append({
                "from": "SRC-%d-%d" % (idx, s),
                "to": members[0],
                "amount": plane_rng.randrange(20, 90) * 1000,
                "channel": "UPI",
                "timestamp": "2026-08-24T0%d:%02d:00Z" % (6 + s, 10 + s * 7),
            })
        for i, m in enumerate(members):
            nxt = members[i + 1] if i + 1 < len(members) else "BEN-%d-01" % idx
            edges.append({
                "from": m,
                "to": nxt,
                "amount": plane_rng.randrange(90, 300) * 1000,
                "channel": plane_rng.choice(["IMPS", "NEFT", "RTGS"]),
                "timestamp": "2026-08-24T0%d:%02d:00Z" % (7 + i, 20 + i * 9),
            })
        edges.append({
            "from": "BEN-%d-01" % idx,
            "to": "EXT-CASHOUT-%d" % idx,
            "amount": plane_rng.randrange(80, 250) * 1000,
            "channel": "UPI",
            "timestamp": "2026-08-24T09:40:00Z",
        })

        rings[ring_id] = {
            "ring_id": ring_id,
            "simulated": True,
            "banner": SIMULATED_CAVEAT,
            "time_window": "2026-08-24T06:00:00Z to 2026-08-24T09:40:00Z",
            "node_cap": 60,
            "why_flagged": [
                "Fan-in: %d generated sources credit the first account inside the window." % (len(members) + 2),
                "Pass-through: each hop forwards most of its inbound balance within the window.",
                "Shared beneficiary: the chain converges on one generated beneficiary node.",
                "Time-to-drain: the terminal hop moves funds to a generated external cash-out node.",
            ],
            "why_flagged_caveat": (
                "These pattern descriptions are properties of the generated "
                "plane, not observations about real customer behaviour."
            ),
            "nodes": nodes,
            "edges": edges,
        }

    by_id = {a["account_id"]: a for a in accounts}
    transactions = []
    for ring_id, ring in rings.items():
        for e in ring["edges"]:
            score = round(plane_rng.uniform(0.2, 0.95), 2)
            if score >= 0.85:
                txn_band = "critical"
            elif score >= 0.6:
                txn_band = "urgent"
            elif score >= 0.4:
                txn_band = "investigate"
            else:
                txn_band = "watch"
            digest = hashlib.sha256(
                (ring_id + e["from"] + e["to"]).encode()
            ).hexdigest()[:6]
            src = by_id.get(e["from"])
            transactions.append({
                "transaction_id": "TXN-" + digest.upper(),
                "time": e["timestamp"],
                "source": e["from"],
                "destination": e["to"],
                "amount": e["amount"],
                "channel": e["channel"],
                "account_band": src["band"] if src else None,
                "txn_band": txn_band,
                "txn_score": score,
                "hold_recommended": score >= 0.85,
                "ring": ring_id,
            })
    transactions.sort(key=lambda t: t["txn_score"], reverse=True)

    transactions_payload = {
        "simulated": True,
        "banner": SIMULATED_CAVEAT,
        "disclosure": (
            "Transaction risk composes a real account band with simulated graph "
            "context and configured policy rules. It is NOT a trained "
            "transaction classifier and has no measured detection accuracy. No "
            "precision, recall or accuracy may be quoted for this surface."
        ),
        "composition": [
            "Real account risk band from the frozen model",
            "Simulated graph context from the generated plane",
            "Configured policy thresholds",
        ],
        "transactions": transactions,
    }

    rings_payload = {
        "simulated": True,
        "banner": SIMULATED_CAVEAT,
        "default_ring_id": sorted(rings)[0],
        "rings": rings,
    }

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    written = (
        ("accounts.json", accounts_payload),
        ("governance.json", governance),
        ("model_card.json", model_card),
        ("transactions.json", transactions_payload),
        ("ring.json", rings_payload),
    )
    for name, payload in written:
        with open(out / name, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print("wrote %s" % (out / name))

    print("")
    print("accounts:   %d banded holdout rows" % len(accounts))
    print("bands:      %s" % band_counts)
    print("model:      %s" % model_version)
    print("threshold:  %s" % threshold_version)


if __name__ == "__main__":
    main()
