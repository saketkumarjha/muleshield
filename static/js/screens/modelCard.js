import { apiGet, ApiError } from "../api.js";
import { errorBanner } from "../components.js";

export async function mountModelCard(mountEl) {
  mountEl.innerHTML = `
    <div class="screen-header"><h1>Model Card</h1></div>
    <div id="model-card-host">Loading…</div>
  `;

  try {
    const m = await apiGet("/api/model-card");

    mountEl.querySelector("#model-card-host").innerHTML = `
      <div class="model-card-section">
        <h2>Limitations</h2>
        <div class="model-card-limitations">
          <ul>${m.limitations.map((l) => `<li>${l}</li>`).join("")}</ul>
        </div>
      </div>

      <div class="model-card-section">
        <h2>Model identity</h2>
        <p class="font-mono">${m.identity.name} — ${m.identity.version} (threshold ${m.identity.threshold_version})</p>
        <p>${m.identity.family}</p>
      </div>

      <div class="model-card-section">
        <h2>Training and holdout split</h2>
        <p>${m.training_holdout_split.method}</p>
        <p class="font-mono">train: ${m.training_holdout_split.train_accounts.toLocaleString()} accounts · holdout: ${m.training_holdout_split.holdout_accounts.toLocaleString()} accounts · labelled mules in holdout: ${m.training_holdout_split.labelled_mules_holdout}</p>
      </div>

      <div class="model-card-section">
        <h2>Feature regime</h2>
        <ul>${m.feature_regime.map((f) => `<li>${f}</li>`).join("")}</ul>
      </div>

      <div class="model-card-section">
        <h2>Evaluation protocol</h2>
        <p>${m.evaluation_protocol}</p>
      </div>

      <div class="model-card-section">
        <h2>Operating points</h2>
        <table class="data-table">
          <thead><tr><th>Band</th><th>Raw threshold</th><th>Holdout precision (eval.)</th><th>Holdout alerts</th></tr></thead>
          <tbody>
            ${m.operating_points.map((o) => `
              <tr>
                <td>${o.band}</td>
                <td class="font-mono">${o.raw_threshold.toFixed(2)}</td>
                <td class="font-mono">${(o.holdout_precision * 100).toFixed(0)}%</td>
                <td class="font-mono">${o.holdout_alerts}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="model-card-section">
        <h2>Seed sensitivity</h2>
        <p>${m.seed_sensitivity}</p>
      </div>

      <div class="model-card-section">
        <h2>Calibration</h2>
        <p>${m.calibration}</p>
      </div>

      <div class="model-card-section">
        <h2>Leakage exclusions</h2>
        <ul>${m.leakage_exclusions.map((l) => `<li>${l}</li>`).join("")}</ul>
      </div>

      <div class="model-card-section">
        <h2>Rejected experiments</h2>
        <ul>${m.rejected_experiments.map((r) => `<li>${r}</li>`).join("")}</ul>
      </div>

      <div class="model-card-section">
        <h2>Deployment design</h2>
        <p>${m.deployment_design}</p>
      </div>
    `;
  } catch (err) {
    if (err instanceof ApiError) {
      mountEl.querySelector("#model-card-host").innerHTML = errorBanner(err);
    } else {
      throw err;
    }
  }
}
