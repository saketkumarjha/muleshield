import { apiGet, ApiError } from "../api.js";
import {
  errorBanner, esc, fmtPct, skeletonRows, announceSlowLoad,
} from "../components.js";

export async function mountModelCard(mountEl) {
  mountEl.innerHTML = `
    <div class="screen-header"><h1>Model Card</h1></div>
    <div id="model-card-host">${skeletonRows(6)}</div>
  `;
  const cancel = announceSlowLoad(mountEl.querySelector("#model-card-host"), "the model card");

  try {
    const m = await apiGet("/api/model-card");
    cancel();
    const split = m.training_holdout_split;
    const lat = m.measured_latency;

    // Limitations render before any deployment claim, deliberately.
    mountEl.querySelector("#model-card-host").innerHTML = `
      <section class="model-card-section">
        <h2>Limitations</h2>
        <div class="model-card-limitations">
          <ul>${m.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        </div>
      </section>

      <section class="model-card-section">
        <h2>Model identity</h2>
        <p>${esc(m.identity.name)}</p>
        <p class="font-mono">version ${esc(m.identity.version)}</p>
        <p class="font-mono">threshold ${esc(m.identity.threshold_version)}</p>
        <p><strong>Family:</strong> ${esc(m.identity.family)}</p>
        <p class="gov-note">Activation status: ${esc(m.identity.activation_status)}</p>
      </section>

      <section class="model-card-section">
        <h2>Score semantics</h2>
        <p><strong>${esc(m.score_semantics.value)}</strong></p>
        <p>${esc(m.score_semantics.explanation)}</p>
        <p class="font-mono">${esc(m.score_semantics.formula)}</p>
        <p class="gov-note">Batch invariant: ${m.score_semantics.batch_invariant ? "yes" : "no"}</p>
      </section>

      <section class="model-card-section">
        <h2>Training and holdout split</h2>
        <p>${esc(split.method)}</p>
        <table class="data-table">
          <tbody>
            <tr><th scope="row">Accounts in supplied table</th><td class="font-mono">${esc(split.total_accounts.toLocaleString())}</td></tr>
            <tr><th scope="row">Columns in supplied table</th><td class="font-mono">${esc(split.total_columns.toLocaleString())}</td></tr>
            <tr><th scope="row">Confirmed mules (total)</th><td class="font-mono">${esc(split.confirmed_mules)}</td></tr>
            <tr><th scope="row">Positive rate</th><td class="font-mono">${esc(fmtPct(split.positive_rate, 3))}</td></tr>
            <tr><th scope="row">Training rows / mules</th><td class="font-mono">${esc(split.train_accounts.toLocaleString())} / ${esc(split.train_mules)}</td></tr>
            <tr><th scope="row">Holdout rows / mules</th><td class="font-mono">${esc(split.holdout_accounts.toLocaleString())} / ${esc(split.holdout_mules)}</td></tr>
            <tr><th scope="row">Holdout status</th><td>${esc(split.holdout_status)}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="model-card-section">
        <h2>Feature regime</h2>
        <p class="font-mono">${esc(m.feature_regime.n_features)} inputs selected from ${esc(m.feature_regime.selected_from.toLocaleString())} columns · imputation: ${esc(m.feature_regime.imputation)}</p>
        <p>${esc(m.feature_regime.note)}</p>
        <p><strong>Excluded:</strong></p>
        <ul>${m.feature_regime.excluded.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      </section>

      <section class="model-card-section">
        <h2>Evaluation protocol</h2>
        <p>${esc(m.evaluation_protocol)}</p>
      </section>

      <section class="model-card-section">
        <h2>Operating points</h2>
        <p class="gov-note"><strong>${esc(m.operating_points.semantics)}</strong> — ${esc(m.operating_points.scope)}</p>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Band</th><th scope="col">Raw threshold</th>
                <th scope="col">Alerts</th><th scope="col">True positives</th>
                <th scope="col">False positives</th><th scope="col">False negatives</th>
                <th scope="col">Precision</th><th scope="col">Recall</th>
              </tr>
            </thead>
            <tbody>
              ${m.operating_points.rows.map((o) => `
                <tr>
                  <td>${esc(o.band)}</td>
                  <td class="font-mono">${esc(o.raw_threshold.toFixed(12))}</td>
                  <td class="font-mono">${esc(o.alerts)}</td>
                  <td class="font-mono">${esc(o.true_positives)}</td>
                  <td class="font-mono">${esc(o.false_positives)}</td>
                  <td class="font-mono">${esc(o.false_negatives)}</td>
                  <td class="font-mono">${esc(fmtPct(o.precision))}</td>
                  <td class="font-mono">${esc(fmtPct(o.recall))}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <p class="gov-note">Exclusive band buckets (each account counted once):
          ${Object.entries(m.operating_points.exclusive_band_counts)
            .map(([k, v]) => `${esc(k)} ${esc(v)}`).join(" · ")}</p>
      </section>

      <section class="model-card-section">
        <h2>Seed sensitivity</h2>
        <p>${esc(m.seed_sensitivity)}</p>
      </section>

      <section class="model-card-section">
        <h2>Calibration</h2>
        <p>${esc(m.calibration)}</p>
      </section>

      <section class="model-card-section">
        <h2>Train-only diagnostics</h2>
        <p class="font-mono">average precision ${esc(m.train_oof_diagnostics.average_precision.toFixed(4))} · ROC AUC ${esc(m.train_oof_diagnostics.roc_auc.toFixed(4))}</p>
        <p class="gov-note">${esc(m.train_oof_diagnostics.note)}</p>
      </section>

      <section class="model-card-section">
        <h2>Leakage exclusions</h2>
        <ul>${m.leakage_exclusions.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      </section>

      <section class="model-card-section">
        <h2>Rejected experiments</h2>
        <ul>${m.rejected_experiments.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      </section>

      <section class="model-card-section">
        <h2>Measured latency</h2>
        <p class="font-mono">single row ${esc(lat.single_row_ms.toFixed(0))} ms · batch of 1,000 ${esc(lat.batch_1000_ms.toFixed(0))} ms · all 9,082 rows ${esc(lat.all_9082_ms.toFixed(0))} ms</p>
        <p class="gov-note">${esc(lat.note)}</p>
      </section>

      <section class="model-card-section">
        <h2>Deployment design</h2>
        <p>${esc(m.deployment_design)}</p>
      </section>
    `;
  } catch (err) {
    cancel();
    mountEl.querySelector("#model-card-host").innerHTML = err instanceof ApiError
      ? errorBanner(err, "blocking")
      : errorBanner({ errorCode: "API_UNREACHABLE",
          message: "The model card could not be loaded.",
          retryable: true, correctiveAction: "Confirm the backend is running." }, "blocking");
  }
}
