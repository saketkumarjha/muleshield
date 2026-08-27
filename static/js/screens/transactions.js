import { apiGet, ApiError } from "../api.js";
import {
  riskChip, skeletonRows, errorBanner, esc, emptyState,
  simulatedBanner, fmtAmount, announceSlowLoad,
} from "../components.js";

export async function mountTransactions(mountEl) {
  mountEl.innerHTML = `
    <div class="screen-header">
      <h1>Transactions</h1>
      <span class="tag tag--sim">SIMULATED TRANSACTION PLANE</span>
    </div>
    <div id="txn-disclosure"></div>
    <div id="txn-table-host">${skeletonRows(6)}</div>
  `;
  const cancel = announceSlowLoad(mountEl.querySelector("#txn-table-host"), "the simulated transaction plane");

  try {
    const data = await apiGet("/api/transactions");
    cancel();

    // Disclosure sits above the table, never in a tooltip.
    mountEl.querySelector("#txn-disclosure").innerHTML = `
      ${simulatedBanner(data.banner)}
      <div class="disclosure-banner">
        <p>${esc(data.disclosure)}</p>
        <p class="disclosure-banner__composition">
          Composed from: ${data.composition.map((c) => esc(c)).join(" + ")}
        </p>
      </div>
    `;

    if (!data.transactions.length) {
      mountEl.querySelector("#txn-table-host").innerHTML = emptyState(
        "No simulated transactions.",
        "Zero is a valid result. The generated plane produced no rows.");
      return;
    }

    mountEl.querySelector("#txn-table-host").innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <caption class="visually-hidden">Simulated transactions ranked by policy score.</caption>
          <thead>
            <tr>
              <th scope="col">Transaction ID</th><th scope="col">Time</th>
              <th scope="col">Source</th><th scope="col">Destination</th>
              <th scope="col">Amount</th><th scope="col">Channel</th>
              <th scope="col">Account band</th><th scope="col">Transaction-risk band</th>
              <th scope="col">Transaction-risk score</th>
              <th scope="col">Hold recommended</th><th scope="col">Ring</th>
            </tr>
          </thead>
          <tbody>
            ${data.transactions.map((t) => `
              <tr>
                <td class="font-mono">${esc(t.transaction_id)}</td>
                <td class="font-mono">${esc(t.time)}</td>
                <td class="font-mono">${esc(t.source)}</td>
                <td class="font-mono">${esc(t.destination)}</td>
                <td class="font-mono">${esc(fmtAmount(t.amount))}</td>
                <td>${esc(t.channel)}</td>
                <td>${riskChip(t.account_band)}</td>
                <td>${riskChip(t.txn_band)}</td>
                <td class="font-mono">${esc(t.txn_score.toFixed(2))}</td>
                <td>${t.hold_recommended ? "Yes" : "No"}</td>
                <td class="font-mono">${esc(t.ring || "—")}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    cancel();
    mountEl.querySelector("#txn-table-host").innerHTML = err instanceof ApiError
      ? errorBanner(err, "degraded")
      : errorBanner({ errorCode: "TRANSACTION_FIXTURE_UNAVAILABLE",
          message: "The simulated transaction plane could not be loaded.",
          retryable: true, correctiveAction: null }, "degraded");
  }
}
