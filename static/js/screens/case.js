import { apiGet, apiPost, ApiError } from "../api.js";
import {
  riskChip, provenanceBadge, errorBanner, skeletonRows, emptyState,
  esc, fmtScore, fmtPct, fmtAmount, announceSlowLoad, simulatedBanner,
} from "../components.js";
import { currentIdentity } from "../identity.js";
import { navigateTo } from "../router.js";

let openDrawerFn = null;

export function registerHoldDrawer(fn) {
  openDrawerFn = fn;
}

function evidenceRowHtml(ev) {
  const contribution = ev.contribution != null
    ? `<span class="evidence-row__contribution font-mono">${ev.contribution > 0 ? "+" : ""}${esc(ev.contribution.toFixed(4))}</span>`
    : "";
  return `
    <li class="evidence-row evidence-row--${esc(ev.provenance)}">
      <div class="evidence-row__head">
        <span class="evidence-row__title">${esc(ev.title)}</span>
        ${provenanceBadge(ev.provenance)}
        ${contribution}
      </div>
      ${ev.value !== null && ev.value !== undefined
        ? `<p class="evidence-row__value">Value: <span class="font-mono">${esc(ev.value)}</span></p>` : ""}
      <p class="evidence-row__source">Source: ${esc(ev.source)}</p>
      ${ev.caveat ? `<p class="evidence-row__caveat">${esc(ev.caveat)}</p>` : ""}
    </li>
  `;
}

/** Graph and timeline each load on their own and can fail without the case. */
async function loadGraph(host, accountId) {
  host.innerHTML = skeletonRows(2);
  const cancel = announceSlowLoad(host, "the simulated graph plane");
  try {
    const g = await apiGet(`/api/case/${encodeURIComponent(accountId)}/graph`);
    cancel();
    if (!g.available) {
      host.innerHTML = emptyState("No simulated ring context.", g.reason);
      return;
    }
    const ring = g.ring;
    host.innerHTML = `
      ${simulatedBanner(g.banner)}
      <p class="panel-row"><strong>Ring:</strong> <span class="font-mono">${esc(ring.ring_id)}</span></p>
      <p class="panel-row"><strong>Window:</strong> <span class="font-mono">${esc(ring.time_window)}</span></p>
      <ul class="panel-list">${ring.why_flagged.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
      <p class="evidence-row__caveat">${esc(ring.why_flagged_caveat)}</p>
      <button class="btn-secondary" id="open-ring">Open in Ring Explorer</button>
    `;
    host.querySelector("#open-ring").addEventListener("click", () => {
      navigateTo(`#/ring/${ring.ring_id}`);
    });
  } catch (err) {
    cancel();
    // Simulated-plane failure degrades this panel only.
    host.innerHTML = err instanceof ApiError
      ? errorBanner(err, "degraded")
      : errorBanner({ errorCode: "GRAPH_FIXTURE_UNAVAILABLE",
          message: "The simulated graph panel could not load. Model evidence above is unaffected.",
          retryable: true, correctiveAction: null }, "degraded");
  }
}

async function loadTimeline(host, accountId) {
  host.innerHTML = skeletonRows(2);
  const cancel = announceSlowLoad(host, "the simulated transaction plane");
  try {
    const t = await apiGet(`/api/case/${encodeURIComponent(accountId)}/timeline`);
    cancel();
    if (!t.available) {
      host.innerHTML = emptyState("No simulated transaction timeline.", t.reason);
      return;
    }
    host.innerHTML = `
      ${simulatedBanner(t.banner)}
      <ul class="timeline">
        ${t.events.map((e) => `
          <li class="timeline__item">
            <span class="font-mono timeline__time">${esc(e.time)}</span>
            <span class="timeline__label">${esc(e.label)}</span>
            <span class="font-mono timeline__amount">${esc(fmtAmount(e.amount))} · ${esc(e.channel)}</span>
          </li>`).join("")}
      </ul>
    `;
  } catch (err) {
    cancel();
    host.innerHTML = err instanceof ApiError
      ? errorBanner(err, "degraded")
      : errorBanner({ errorCode: "TRANSACTION_FIXTURE_UNAVAILABLE",
          message: "The simulated timeline could not load. Model evidence above is unaffected.",
          retryable: true, correctiveAction: null }, "degraded");
  }
}

export async function mountCase(mountEl, params) {
  const accountId = params[0];
  mountEl.innerHTML = skeletonRows(6);
  const cancel = announceSlowLoad(mountEl, "the case evidence");

  let account;
  try {
    account = await apiGet(`/api/case/${encodeURIComponent(accountId)}`);
    cancel();
  } catch (err) {
    cancel();
    mountEl.innerHTML = err instanceof ApiError
      ? errorBanner(err, "blocking")
      : errorBanner({ errorCode: "API_UNREACHABLE",
          message: "The console could not reach the MuleShield API.",
          retryable: true, correctiveAction: "Confirm the backend is running." }, "blocking");
    return;
  }

  // Group by provenance so a heavier simulated weight can never outrank a real
  // model contribution in the reading order.
  const real = account.evidence.filter((e) => e.provenance === "real");
  const simulated = account.evidence.filter((e) => e.provenance === "simulated");
  const policy = account.evidence.filter((e) => e.provenance === "policy");

  mountEl.innerHTML = `
    <div class="case-header">
      <div class="case-header__line">
        <span class="case-header__id font-mono">${esc(account.account_id)}</span>
        ${riskChip(account.band)}
        <span class="font-mono" title="Relative risk percentile">
          relative risk percentile ${esc(fmtScore(account.risk_score))}
        </span>
        <span class="font-mono">completeness ${esc(fmtPct(account.completeness, 0))}</span>
        <button class="btn-secondary case-actions-toggle" id="btn-toggle-actions">Actions</button>
      </div>
      <p class="case-header__meta font-mono">
        rank ${esc(account.rank)} · model ${esc(account.model_version)} · threshold ${esc(account.threshold_version)}
      </p>
      <p class="case-header__action"><strong>Recommended:</strong> ${esc(account.recommended_action)}</p>
      <p class="case-header__semantics">${esc(account.score_semantics)}</p>
    </div>

    <div class="case-grid">
      <section class="case-grid__evidence" aria-labelledby="evidence-heading">
        <h2 id="evidence-heading">Model evidence <span class="badge badge--real">REAL</span></h2>
        <p class="explanation-scope">${esc(account.explanation_disclaimer)} —
          ${esc(account.explanation_scope)}, weight ${esc(account.explanation_component_weight)}.</p>
        ${real.length
          ? `<ul class="evidence-list">${real.map(evidenceRowHtml).join("")}</ul>`
          : emptyState("No model contribution available.",
              "The explanation component did not return attributions for this account.")}
        <p class="semantics-caveat">${esc(account.semantics_caveat)}</p>
        <p class="leakage-note">${esc(account.leakage_note)}</p>

        <h2>Simulated and policy context</h2>
        ${simulated.length || policy.length
          ? `<ul class="evidence-list">${[...simulated, ...policy].map(evidenceRowHtml).join("")}</ul>`
          : emptyState("No simulated or policy context for this account.",
              "Zero is a valid result for this band, not missing data.")}
      </section>

      <aside class="case-grid__context" aria-label="Simulated context">
        <h2>Timeline</h2>
        <div id="case-timeline-host"></div>
        <h2>Ring context</h2>
        <div id="case-graph-host"></div>
      </aside>

      <aside class="case-grid__actions" aria-label="Actions and audit">
        <div class="action-rail">
          <button class="btn-primary" id="btn-propose-hold">Propose hold</button>
          <h3>Record analyst decision</h3>
          <label for="disposition">Disposition</label>
          <select id="disposition">
            <option value="confirm_mule">Confirm mule</option>
            <option value="false_positive">Mark false positive</option>
            <option value="escalate">Escalate</option>
            <option value="watchlist">Add to watchlist</option>
          </select>
          <label for="decision-rationale">Rationale (required)</label>
          <textarea id="decision-rationale" rows="3"></textarea>
          <button class="btn-secondary" id="btn-record-decision">Record analyst decision</button>
          <div id="decision-result"></div>
          <p class="action-rail__disclaimer">${esc(account.action_disclaimer)}</p>
        </div>
      </aside>
    </div>
  `;

  // Real evidence is already on screen; these two resolve independently.
  loadTimeline(mountEl.querySelector("#case-timeline-host"), accountId);
  loadGraph(mountEl.querySelector("#case-graph-host"), accountId);

  mountEl.querySelector("#btn-propose-hold").addEventListener("click", () => {
    if (openDrawerFn) openDrawerFn(account);
  });

  const decisionBtn = mountEl.querySelector("#btn-record-decision");
  decisionBtn.addEventListener("click", async () => {
    const rationale = mountEl.querySelector("#decision-rationale").value.trim();
    const decision = mountEl.querySelector("#disposition").value;
    const host = mountEl.querySelector("#decision-result");
    host.innerHTML = "";
    decisionBtn.disabled = true;
    try {
      const res = await apiPost(`/api/alerts/${encodeURIComponent(accountId)}/decision`, {
        decision, rationale, actor: currentIdentity(),
      });
      host.innerHTML = `
        <div class="confirmation">
          <p>Recorded: <strong>${esc(res.decision)}</strong></p>
          <p class="font-mono">Audit reference: ${esc(res.audit_reference)}</p>
          <p class="confirmation__note">${esc(res.execution_statement)}</p>
        </div>`;
    } catch (err) {
      // Form state is preserved so the operator can correct and resubmit.
      host.innerHTML = err instanceof ApiError
        ? errorBanner(err, "action")
        : errorBanner({ errorCode: "DECISION_NOT_RECORDED",
            message: "No decision was recorded. Your rationale has been kept.",
            retryable: true, correctiveAction: null }, "action");
    } finally {
      decisionBtn.disabled = false;
    }
  });

  const actionsToggle = mountEl.querySelector("#btn-toggle-actions");
  const actionsRail = mountEl.querySelector(".case-grid__actions");
  actionsToggle.addEventListener("click", () => {
    actionsRail.classList.toggle("case-grid__actions--open");
  });
}
