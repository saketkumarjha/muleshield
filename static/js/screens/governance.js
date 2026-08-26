import { apiGet, ApiError } from "../api.js";
import { errorBanner } from "../components.js";

const STATUS_LABELS = {
  validated_real: "Validated on supplied real data",
  implemented_simulated: "Implemented on simulated data",
  policy: "Policy/integration contract",
  unavailable: "Not implemented / unavailable",
};

export async function mountGovernance(mountEl) {
  mountEl.innerHTML = `
    <div class="screen-header"><h1>Governance</h1></div>
    <div id="gov-host">Loading…</div>
  `;

  try {
    const g = await apiGet("/api/governance");
    const chainOk = g.audit_chain.status === "valid";

    mountEl.querySelector("#gov-host").innerHTML = `
      <div class="gov-section">
        <h2>Runtime status</h2>
        <p class="font-mono">model ${g.runtime_status.model_version} · threshold ${g.runtime_status.threshold_version}</p>
        <p>API: ${g.runtime_status.api_status} · Data plane: ${g.runtime_status.data_plane_status}</p>
      </div>

      <div class="gov-section">
        <h2>Evidence status map</h2>
        ${g.evidence_status_map.map((e) => `
          <div class="evidence-status-item">
            <span class="evidence-status-item__marker evidence-status-item__marker--${e.status}"></span>
            <span>${e.capability}</span>
            <span style="margin-left:auto;color:var(--color-muted);font-size:12px;">${STATUS_LABELS[e.status] || e.status}${e.note ? " — " + e.note : ""}</span>
          </div>
        `).join("")}
      </div>

      <div class="gov-section">
        <h2>Threshold registry</h2>
        <table class="data-table">
          <thead><tr><th>Band</th><th>Raw threshold</th><th>Training FPR budget</th><th>Training recall</th><th>Training precision</th><th>Holdout alerts</th><th>Holdout precision (eval.)</th><th>Recommended action</th></tr></thead>
          <tbody>
            ${g.threshold_registry.map((t) => `
              <tr>
                <td>${t.band}</td>
                <td class="font-mono">${t.raw_threshold.toFixed(2)}</td>
                <td class="font-mono">${(t.training_fpr_budget * 100).toFixed(0)}%</td>
                <td class="font-mono">${(t.training_recall * 100).toFixed(0)}%</td>
                <td class="font-mono">${(t.training_precision * 100).toFixed(0)}%</td>
                <td class="font-mono">${t.holdout_alerts}</td>
                <td class="font-mono">${(t.holdout_precision * 100).toFixed(0)}%</td>
                <td>${t.recommended_action}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="gov-section">
        <h2>Leakage and confound warnings</h2>
        <ul class="gov-warning-list">${g.leakage_warnings.map((w) => `<li>${w}</li>`).join("")}</ul>
      </div>

      <div class="gov-section">
        <h2>Fairness and uncertainty</h2>
        <ul class="gov-warning-list">${g.fairness_uncertainty.map((w) => `<li>${w}</li>`).join("")}</ul>
      </div>

      <div class="gov-section">
        <h2>Audit chain</h2>
        <div class="audit-chain-status audit-chain-status--${chainOk ? "valid" : "broken"}">
          <p>Status: <strong>${g.audit_chain.status}</strong> · Entries: ${g.audit_chain.entry_count}</p>
          <p class="font-mono">Chain head: ${g.audit_chain.chain_head}</p>
          ${g.audit_chain.last_events.length ? g.audit_chain.last_events.map((e) => `
            <p class="font-mono">${e.hold_id} — ${e.status} — maker: ${e.maker}, checker: ${e.checker} — ref: ${e.audit_reference}</p>
          `).join("") : "<p style=\"color:var(--color-muted);\">No decisions recorded yet this session.</p>"}
        </div>
      </div>

      <div class="gov-section">
        <h2>Official problem-statement coverage</h2>
        <table class="data-table">
          <thead><tr><th>Requirement</th><th>Status</th></tr></thead>
          <tbody>
            ${g.problem_statement_coverage.map((r) => `<tr><td>${r.requirement}</td><td>${r.status}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    if (err instanceof ApiError) {
      mountEl.querySelector("#gov-host").innerHTML = errorBanner(err);
    } else {
      throw err;
    }
  }
}
