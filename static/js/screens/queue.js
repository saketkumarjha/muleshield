import { apiGet, ApiError } from "../api.js";
import { riskChip, skeletonRows, emptyState, errorBanner } from "../components.js";
import { navigateTo } from "../router.js";

const BANDS = [
  { key: null, label: "All" },
  { key: "critical", label: "Critical" },
  { key: "urgent", label: "Urgent" },
  { key: "investigate", label: "Investigate" },
  { key: "watch", label: "Watch" },
  { key: "broad_watch", label: "Broad Watch" },
];

export async function mountQueue(mountEl) {
  let activeBand = null;

  async function renderTable() {
    const tableHost = mountEl.querySelector("#queue-table-host");
    tableHost.innerHTML = skeletonRows(6);
    try {
      const data = await apiGet(`/api/queue${activeBand ? `?band=${activeBand}` : ""}`);
      if (data.items.length === 0) {
        tableHost.innerHTML = emptyState("No alerts in this band.");
        return;
      }
      tableHost.innerHTML = `
        <table class="queue-table">
          <thead>
            <tr>
              <th>#</th><th>Account</th><th>Raw risk</th><th>Display risk</th>
              <th>Band</th><th>Top evidence</th><th>Ev</th><th>Status</th><th>Age</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((row, i) => `
              <tr tabindex="0" data-account-id="${row.account_id}">
                <td>${i + 1}</td>
                <td class="font-mono">${row.account_id}</td>
                <td class="font-mono">${row.raw_score.toFixed(2)}</td>
                <td class="font-mono">${row.display_score.toFixed(2)}</td>
                <td>${riskChip(row.band)}</td>
                <td>${row.top_evidence_title}</td>
                <td class="font-mono">${row.evidence_count}</td>
                <td>${row.status}</td>
                <td>${row.age_hours}h</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
      tableHost.querySelectorAll("tbody tr").forEach((tr) => {
        const open = () => navigateTo(`#/case/${tr.dataset.accountId}`);
        tr.addEventListener("click", open);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter") open();
        });
      });

      const header = mountEl.querySelector("#queue-summary");
      header.innerHTML = `
        <p class="queue-header__summary">${data.band_counts.critical} Critical | ${Math.round(data.scope.evaluation_precision * 100)}% precision | ~${data.scope.workload_hours_estimate} analyst-hours</p>
        <p class="queue-header__scope">Top ${data.scope.displayed_total} displayed from ${data.scope.holdout_total} holdout accounts | model ${data.model_version} | threshold ${data.threshold_version}</p>
      `;
    } catch (err) {
      if (err instanceof ApiError) {
        tableHost.innerHTML = errorBanner(err);
      } else {
        throw err;
      }
    }
  }

  mountEl.innerHTML = `
    <div class="queue-header">
      <h1>Alert Queue</h1>
      <div id="queue-summary"></div>
    </div>
    <div class="queue-tabs">
      ${BANDS.map((b) => `<button class="queue-tab${b.key === activeBand ? " queue-tab--active" : ""}" data-band="${b.key || ""}">${b.label}</button>`).join("")}
    </div>
    <div id="queue-table-host"></div>
  `;

  mountEl.querySelectorAll(".queue-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeBand = btn.dataset.band || null;
      mountEl.querySelectorAll(".queue-tab").forEach((b) => b.classList.remove("queue-tab--active"));
      btn.classList.add("queue-tab--active");
      renderTable();
    });
  });

  await renderTable();
}
