import { apiGet, ApiError } from "../api.js";
import {
  riskChip, skeletonRows, emptyState, errorBanner, esc, icon,
  fmtScore, fmtPct, announceSlowLoad, bandLabel,
} from "../components.js";
import { navigateTo } from "../router.js";

// no_alert rows are not alerts and are deliberately absent from the queue.
const BANDS = [
  { key: null, label: "All alerts" },
  { key: "critical", label: "Critical" },
  { key: "urgent", label: "Urgent" },
  { key: "investigate", label: "Investigate" },
  { key: "watch", label: "Watch" },
  { key: "broad_watch", label: "Broad Watch" },
];

export async function mountQueue(mountEl) {
  // The demo opens in a known state: Critical band active.
  let activeBand = "critical";
  let search = "";
  let page = 1;
  let lastData = null;

  function headerHtml(d) {
    const critical = d.evaluation.operating_points.find((o) => o.band === "critical");
    return `
      <p class="queue-header__summary">
        <strong>${esc(d.band_counts.critical)}</strong> Critical
        · <strong>${esc(d.workload.alerts_in_scope)}</strong> alerts in scope
        · ~${esc(d.workload.estimate_hours)} analyst-hours
        <span class="queue-header__assumption">
          (planning assumption: ${esc(d.workload.assumption_minutes_per_alert)} min per alert, not measured throughput)
        </span>
      </p>
      <p class="queue-header__eval">
        <span class="tag tag--eval">EVALUATION</span>
        Frozen aggregate over the ${esc(d.scope.holdout_total.toLocaleString())}-row holdout:
        ${esc(critical.true_positives)} true positives, ${esc(critical.false_positives)} false positives at Critical
        — ${esc(fmtPct(critical.precision))} precision, ${esc(fmtPct(critical.recall))} recall.
        <span class="queue-header__assumption">
          Small-sample one-shot result. Not attributable to individual rows; runtime rows carry no label.
        </span>
      </p>
      <p class="queue-header__scope font-mono">
        ${esc(d.scope.banded_total)} alerting of ${esc(d.scope.holdout_total.toLocaleString())} holdout accounts
        · model ${esc(d.model_version)}
        · threshold ${esc(d.threshold_version)}
      </p>
      <p class="queue-header__semantics">
        Risk is a <strong>relative risk percentile</strong> against the training
        reference — not a probability, confidence, or likelihood of guilt.
      </p>
    `;
  }

  function tabsHtml(counts) {
    return BANDS.map((b) => {
      const count = b.key ? counts[b.key] : Object.entries(counts)
        .filter(([k]) => k !== "no_alert")
        .reduce((a, [, v]) => a + v, 0);
      const active = b.key === activeBand;
      return `
        <button class="queue-tab${active ? " queue-tab--active" : ""}"
                data-band="${esc(b.key || "")}"
                role="tab" aria-selected="${active}">
          ${esc(b.label)} <span class="queue-tab__count">${esc(count)}</span>
        </button>`;
    }).join("");
  }

  async function renderTable() {
    const host = mountEl.querySelector("#queue-table-host");
    host.innerHTML = skeletonRows(8);
    const cancel = announceSlowLoad(host, "the alert queue");

    try {
      const params = new URLSearchParams();
      if (activeBand) params.set("band", activeBand);
      if (search) params.set("search", search);
      params.set("page", String(page));
      const d = await apiGet(`/api/queue?${params.toString()}`);
      cancel();
      lastData = d;

      mountEl.querySelector("#queue-summary").innerHTML = headerHtml(d);
      mountEl.querySelector("#queue-tabs").innerHTML = tabsHtml(d.band_counts);
      bindTabs();

      if (d.items.length === 0) {
        host.innerHTML = search
          ? emptyState(
              `No accounts match "${search}".`,
              "Zero is a valid result. Clear the search to see the full band.")
          : emptyState(
              `No alerts in the ${bandLabel(activeBand)} band.`,
              "Zero is a valid result for this band, not missing data.");
        renderPager(d);
        return;
      }

      host.innerHTML = `
        <table class="queue-table">
          <caption class="visually-hidden">
            Alert queue, ordered by the server. ${d.total_filtered} rows.
          </caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Account</th>
              <th scope="col">Relative risk percentile</th>
              <th scope="col">Band</th>
              <th scope="col">Top model contribution</th>
              <th scope="col">Ev</th>
              <th scope="col">Completeness</th>
              <th scope="col">Recommended action</th>
            </tr>
          </thead>
          <tbody>
            ${d.items.map((row) => `
              <tr tabindex="0" data-account-id="${esc(row.account_id)}"
                  class="queue-row queue-row--${esc(row.band)}">
                <td class="font-mono">${esc(row.rank)}</td>
                <td class="font-mono">${esc(row.account_id)}</td>
                <td class="font-mono">${esc(fmtScore(row.risk_score))}</td>
                <td>${riskChip(row.band)}</td>
                <td class="queue-cell--truncate" title="${esc(row.top_evidence_title)}">${esc(row.top_evidence_title)}</td>
                <td class="font-mono">${esc(row.evidence_count)}</td>
                <td class="font-mono">${esc(fmtPct(row.completeness, 0))}</td>
                <td class="queue-cell--truncate" title="${esc(row.recommended_action)}">${esc(row.recommended_action)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;

      host.querySelectorAll("tbody tr").forEach((tr) => {
        const open = () => navigateTo(`#/case/${tr.dataset.accountId}`);
        tr.addEventListener("click", open);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); open(); }
          if (e.key === "j") { e.preventDefault(); tr.nextElementSibling?.focus(); }
          if (e.key === "k") { e.preventDefault(); tr.previousElementSibling?.focus(); }
        });
      });

      renderPager(d);
    } catch (err) {
      cancel();
      if (err instanceof ApiError) {
        host.innerHTML = errorBanner(err, "blocking");
      } else {
        host.innerHTML = errorBanner(
          { errorCode: "API_UNREACHABLE",
            message: "The console could not reach the MuleShield API. No cached scores are shown.",
            retryable: true,
            correctiveAction: "Confirm the backend is running, then retry." },
          "blocking");
      }
    }
  }

  function renderPager(d) {
    mountEl.querySelector("#queue-pager").innerHTML = `
      <button class="btn-secondary" id="page-prev" ${d.page <= 1 ? "disabled" : ""}>Previous</button>
      <span class="font-mono">Page ${esc(d.page)} of ${esc(d.total_pages)} · ${esc(d.total_filtered)} rows</span>
      <button class="btn-secondary" id="page-next" ${d.page >= d.total_pages ? "disabled" : ""}>Next</button>
    `;
    mountEl.querySelector("#page-prev").addEventListener("click", () => {
      if (page > 1) { page -= 1; renderTable(); }
    });
    mountEl.querySelector("#page-next").addEventListener("click", () => {
      if (lastData && page < lastData.total_pages) { page += 1; renderTable(); }
    });
  }

  function bindTabs() {
    mountEl.querySelectorAll(".queue-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeBand = btn.dataset.band || null;
        page = 1;
        renderTable();
      });
    });
  }

  mountEl.innerHTML = `
    <div class="queue-header">
      <div class="queue-header__title-row">
        <h1>Alert Queue</h1>
        <span class="tag tag--mode">EVALUATION HOLDOUT</span>
      </div>
      <div id="queue-summary"></div>
    </div>
    <div class="queue-controls">
      <div class="queue-tabs" id="queue-tabs" role="tablist" aria-label="Risk band"></div>
      <div class="queue-search">
        <label class="visually-hidden" for="queue-search-input">Search by account id</label>
        ${icon("search", "Search")}
        <input id="queue-search-input" type="search" placeholder="Search account id…" autocomplete="off" />
      </div>
    </div>
    <div id="queue-table-host"></div>
    <div class="queue-pager" id="queue-pager"></div>
  `;

  const searchInput = mountEl.querySelector("#queue-search-input");
  let debounce = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      search = searchInput.value.trim();
      page = 1;
      renderTable();
    }, 200);
  });

  // "/" focuses search, but never while the operator is already typing.
  const onKey = (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT"
        && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      searchInput.focus();
    }
  };
  document.addEventListener("keydown", onKey);
  mountEl.addEventListener("screen:unmount", () => {
    document.removeEventListener("keydown", onKey);
  }, { once: true });

  await renderTable();
}
