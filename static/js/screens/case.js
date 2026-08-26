import { apiGet, ApiError } from "../api.js";
import { riskChip, provenanceBadge, errorBanner, skeletonRows } from "../components.js";

let openDrawerFn = null;

export function registerHoldDrawer(fn) {
  openDrawerFn = fn;
}

function evidenceRowHtml(ev) {
  return `
    <div class="evidence-row">
      <p class="evidence-row__title">${ev.title} ${provenanceBadge(ev.provenance)}</p>
      ${ev.contribution != null ? `<p class="evidence-row__value font-mono">contribution: ${ev.contribution.toFixed(2)}</p>` : ""}
      ${ev.value ? `<p class="evidence-row__value">${ev.value}</p>` : ""}
      ${ev.caveat ? `<p class="evidence-row__caveat">${ev.caveat}</p>` : ""}
    </div>
  `;
}

export async function mountCase(mountEl, params) {
  const accountId = params[0];
  mountEl.innerHTML = skeletonRows(5);

  let account;
  try {
    account = await apiGet(`/api/case/${accountId}`);
  } catch (err) {
    if (err instanceof ApiError) {
      mountEl.innerHTML = errorBanner(err);
      return;
    }
    throw err;
  }

  mountEl.innerHTML = `
    <div class="case-header">
      <span class="case-header__id">${account.account_id}</span>
      ${riskChip(account.band)}
      <span class="font-mono">raw ${account.raw_score.toFixed(2)}</span>
      <span class="font-mono">calibrated ${account.display_score.toFixed(2)}</span>
      <span>${account.completeness}</span>
    </div>
    <div class="case-grid">
      <div class="case-grid__evidence">
        <h2>Evidence</h2>
        ${account.evidence.map(evidenceRowHtml).join("")}
        <p class="semantics-caveat">Feature meanings come from the supplied dictionary where available. Contributions explain model behavior; they are not independent findings of fraud.</p>
      </div>
      <div class="case-grid__context">
        <h2>Timeline</h2>
        ${account.timeline.map((t) => `<p class="evidence-row__value">${t.time} — ${t.label}</p>`).join("")}
      </div>
      <div class="case-grid__actions">
        <div class="action-rail">
          <button class="btn-primary" id="btn-propose-hold">Propose hold</button>
          <button class="btn-secondary" id="btn-false-positive">Mark false positive</button>
          <button class="btn-secondary" id="btn-escalate">Escalate</button>
        </div>
      </div>
    </div>
  `;

  mountEl.querySelector("#btn-propose-hold").addEventListener("click", () => {
    if (openDrawerFn) openDrawerFn(account);
  });
}
