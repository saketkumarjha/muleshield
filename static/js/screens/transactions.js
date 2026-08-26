import { apiGet, ApiError } from "../api.js";
import { riskChip, skeletonRows, errorBanner } from "../components.js";

export async function mountTransactions(mountEl) {
  mountEl.innerHTML = `
    <div class="screen-header"><h1>Transactions</h1></div>
    <div id="txn-disclosure"></div>
    <div id="txn-table-host">${skeletonRows(6)}</div>
  `;

  try {
    const data = await apiGet("/api/transactions");
    mountEl.querySelector("#txn-disclosure").innerHTML = `
      <div class="disclosure-banner">${data.disclosure}</div>
    `;
    mountEl.querySelector("#txn-table-host").innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Transaction</th><th>Time</th><th>Source</th><th>Destination</th>
            <th>Amount</th><th>Channel</th><th>Account band</th><th>Txn band</th>
            <th>Txn score</th><th>Hold rec.</th><th>Ring</th>
          </tr>
        </thead>
        <tbody>
          ${data.transactions.map((t) => `
            <tr>
              <td class="font-mono">${t.transaction_id}</td>
              <td class="font-mono">${t.time}</td>
              <td class="font-mono">${t.source}</td>
              <td class="font-mono">${t.destination}</td>
              <td class="font-mono">${t.amount.toLocaleString()}</td>
              <td>${t.channel}</td>
              <td>${riskChip(t.account_band)}</td>
              <td>${riskChip(t.txn_band)}</td>
              <td class="font-mono">${t.txn_score.toFixed(2)}</td>
              <td>${t.hold_recommended ? "Yes" : "No"}</td>
              <td class="font-mono">${t.ring || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    if (err instanceof ApiError) {
      mountEl.querySelector("#txn-table-host").innerHTML = errorBanner(err);
    } else {
      throw err;
    }
  }
}
