import { apiGet, apiPost, ApiError } from "../api.js";
import {
  errorBanner, esc, icon, fmtPct, emptyState, skeletonRows, announceSlowLoad,
} from "../components.js";
import { refreshSystemStatus } from "../main.js";

const STATUS_LABELS = {
  validated_real: "Validated on supplied real data",
  implemented_simulated: "Implemented on simulated data",
  policy: "Policy / integration contract",
  unavailable: "Not implemented or unavailable",
};

function statusCell(status) {
  return `
    <span class="status-marker status-marker--${esc(status)}"></span>
    <span>${esc(STATUS_LABELS[status] || status)}</span>
  `;
}

export async function mountGovernance(mountEl) {
  mountEl.innerHTML = `
    <div class="screen-header"><h1>Governance</h1></div>
    <div id="gov-host">${skeletonRows(6)}</div>
  `;
  const cancel = announceSlowLoad(mountEl.querySelector("#gov-host"), "governance data");

  try {
    const g = await apiGet("/api/governance");
    cancel();
    const chain = g.audit_chain;
    const chainOk = chain.status === "valid";

    mountEl.querySelector("#gov-host").innerHTML = `
      ${chainOk ? "" : `
        <div class="blocking-banner" role="alert">
          ${icon("warning", "Audit chain broken")}
          <div>
            <p><strong>Audit chain verification failed.</strong></p>
            <p>Entry ${esc(chain.failure?.seq)}: ${esc(chain.failure?.reason)}</p>
            <p class="font-mono">expected ${esc(chain.failure?.expected)}</p>
            <p class="font-mono">found ${esc(chain.failure?.found)}</p>
            <p>Recorded decisions cannot be trusted until this is resolved.</p>
          </div>
        </div>`}

      <section class="gov-section">
        <h2>Runtime status</h2>
        <p class="font-mono">model ${esc(g.runtime_status.model_version)}</p>
        <p class="font-mono">threshold ${esc(g.runtime_status.threshold_version)}</p>
        <p>Activation: ${esc(g.runtime_status.activation_status)} on ${esc(g.runtime_status.activated_at_date)}
           · API ${esc(g.runtime_status.api_status)}
           · Data plane ${esc(g.runtime_status.data_plane_status)}</p>
        <p class="gov-note">Score semantics: ${esc(g.runtime_status.score_semantics)}</p>
        <p class="gov-note font-mono">Rollback switch: ${esc(g.runtime_status.rollback_switch)}</p>
        <p class="gov-note gov-note--identity">${esc(g.identity_disclaimer)}</p>
      </section>

      <section class="gov-section">
        <h2>Evidence status map</h2>
        <table class="data-table">
          <thead><tr><th scope="col">Capability</th><th scope="col">Status</th><th scope="col">Basis</th></tr></thead>
          <tbody>
            ${g.evidence_status_map.map((e) => `
              <tr>
                <td>${esc(e.capability)}</td>
                <td class="status-cell">${statusCell(e.status)}</td>
                <td class="gov-note">${esc(e.note)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </section>

      <section class="gov-section">
        <h2>Threshold registry</h2>
        <p class="gov-note">${esc(g.threshold_registry_note)}</p>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Band</th>
                <th scope="col">Raw threshold</th>
                <th scope="col">Train OOF FPR budget</th>
                <th scope="col">Train OOF recall</th>
                <th scope="col">Train OOF precision</th>
                <th scope="col">Holdout alerts (cumulative)</th>
                <th scope="col">Holdout precision (cumulative)</th>
                <th scope="col">Holdout alerts (exclusive bucket)</th>
                <th scope="col">Recommended action</th>
              </tr>
            </thead>
            <tbody>
              ${g.threshold_registry.map((t) => `
                <tr>
                  <td>${esc(t.band)}</td>
                  <td class="font-mono">${esc(t.raw_threshold.toFixed(12))}</td>
                  <td class="font-mono">${esc(fmtPct(t.train_oof_fpr_budget, 1))}</td>
                  <td class="font-mono">${esc(fmtPct(t.train_oof_recall))}</td>
                  <td class="font-mono">${esc(fmtPct(t.train_oof_precision))}</td>
                  <td class="font-mono">${esc(t.holdout_alerts_cumulative)}</td>
                  <td class="font-mono">${esc(fmtPct(t.holdout_precision_cumulative))}</td>
                  <td class="font-mono">${esc(t.holdout_alerts_exclusive)}</td>
                  <td>${esc(t.recommended_action)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="gov-section">
        <h2>Leakage and confound warnings</h2>
        <ul class="gov-warning-list">${g.leakage_warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      </section>

      <section class="gov-section">
        <h2>Fairness and uncertainty</h2>
        <ul class="gov-warning-list">${g.fairness_uncertainty.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      </section>

      <section class="gov-section">
        <h2>Audit chain</h2>
        <div class="audit-chain-status audit-chain-status--${chainOk ? "valid" : "broken"}">
          <p>${chainOk ? icon("verified", "Chain valid") : icon("warning", "Chain broken")}
             Status: <strong>${esc(chain.status)}</strong> · Entries: ${esc(chain.entry_count)}</p>
          <p class="font-mono" title="${esc(chain.chain_head)}">
            Chain head: ${esc(String(chain.chain_head).slice(0, 16))}…
          </p>
          <p class="gov-note">${esc(chain.verification)}</p>
          <p class="gov-note">${esc(chain.scope_note)}</p>
          <button class="btn-secondary" id="verify-chain">Verify audit chain</button>
        </div>
        ${chain.last_events.length
          ? `<ul class="audit-events">${chain.last_events.map((e) => `
              <li>
                <span class="font-mono">#${esc(e.seq)}</span>
                <span class="font-mono">${esc(e.ts)}</span>
                <strong>${esc(e.event_type)}</strong>
                <span>actor ${esc(e.actor)}</span>
                <span class="font-mono">${esc(e.resource)}</span>
                <span class="font-mono" title="${esc(e.entry_hash)}">${esc(e.entry_hash.slice(0, 12))}…</span>
              </li>`).join("")}</ul>`
          : emptyState("No audit entries recorded yet.",
              "Zero is a valid result on a fresh demo database, not missing data.")}
      </section>

      <section class="gov-section">
        <h2>Official problem-statement coverage</h2>
        <p class="gov-note">${esc(g.coverage_note)}</p>
        <table class="data-table">
          <thead><tr><th scope="col">Clause</th><th scope="col">Data status</th><th scope="col">Basis</th></tr></thead>
          <tbody>
            ${g.problem_statement_coverage.map((r) => `
              <tr>
                <td>${esc(r.requirement)}</td>
                <td class="status-cell">${statusCell(r.status)}</td>
                <td class="gov-note">${esc(r.note)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </section>
    `;

    mountEl.querySelector("#verify-chain").addEventListener("click", () => {
      mountGovernance(mountEl);
      refreshSystemStatus();
    });
  } catch (err) {
    cancel();
    mountEl.querySelector("#gov-host").innerHTML = err instanceof ApiError
      ? errorBanner(err, "blocking")
      : errorBanner({ errorCode: "API_UNREACHABLE",
          message: "Governance data could not be loaded. Audit status is unknown — do not treat this as valid.",
          retryable: true, correctiveAction: "Confirm the backend is running." }, "blocking");
  }
}
