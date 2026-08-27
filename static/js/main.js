import { registerScreen, startRouter } from "./router.js";
import { mountQueue } from "./screens/queue.js";
import { mountCase } from "./screens/case.js";
import { initHoldDrawer } from "./screens/makerChecker.js";
import { mountTransactions } from "./screens/transactions.js";
import { mountRing } from "./screens/ring.js";
import { mountGovernance } from "./screens/governance.js";
import { mountModelCard } from "./screens/modelCard.js";
import { apiGet } from "./api.js";
import { icon } from "./components.js";

registerScreen("queue", mountQueue);
registerScreen("case", mountCase);
registerScreen("transactions", mountTransactions);
registerScreen("ring", mountRing);
registerScreen("governance", mountGovernance);
registerScreen("model-card", mountModelCard);

// Nav icons carry a text label alongside them, never colour or shape alone.
document.querySelectorAll(".nav-item").forEach((el) => {
  el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon, ""));
  el.querySelector("svg")?.setAttribute("aria-hidden", "true");
});

initHoldDrawer();
startRouter(document.getElementById("screen-mount"));

function setStatus(key, value, state) {
  const row = document.querySelector(`.system-status-row[data-key="${key}"]`);
  if (!row) return;
  row.querySelector("[data-value]").textContent = value;
  row.querySelector(".system-status-row__dot").className =
    `system-status-row__dot system-status-row__dot--${state}`;
}

/**
 * The status strip must show failure before the operator opens a broken screen,
 * so it reflects the real health response rather than static markup.
 */
export async function refreshSystemStatus() {
  try {
    const h = await apiGet("/api/health");
    document.getElementById("topbar-model-version").textContent = `model: ${h.model_version}`;
    document.getElementById("topbar-model-version").title = h.model_version;
    document.getElementById("topbar-threshold-version").textContent =
      `threshold: ${h.threshold_version}`;
    document.getElementById("topbar-threshold-version").title = h.threshold_version;
    document.getElementById("mode-strip").textContent = h.runtime_mode === "vercel_demo"
      ? "HOSTED DEMO | EPHEMERAL WORKFLOW STATE | SIMULATED TRANSACTION PLANE"
      : "LOCAL DEMO | EVALUATION HOLDOUT | SIMULATED TRANSACTION PLANE";

    const chainOk = h.audit_chain_status === "valid";
    document.getElementById("topbar-audit-status").textContent =
      `audit: ${h.audit_chain_status}`;
    document.getElementById("topbar-audit-status").className =
      chainOk ? "status-ok" : "status-error";

    setStatus("api", h.api_status, h.api_status === "online" ? "ok" : "error");
    setStatus("model", h.model_status, h.model_status === "loaded" ? "ok" : "error");
    setStatus("audit", h.audit_chain_status, chainOk ? "ok" : "error");
    setStatus("plane", h.data_plane_status, "sim");
  } catch {
    document.getElementById("mode-strip").textContent =
      "DEMO UNAVAILABLE | BACKEND HEALTH CHECK FAILED";
    document.getElementById("topbar-model-version").textContent = "model: unavailable";
    document.getElementById("topbar-threshold-version").textContent = "threshold: unavailable";
    document.getElementById("topbar-audit-status").textContent = "audit: unknown";
    setStatus("api", "offline", "error");
    setStatus("model", "unknown", "error");
    setStatus("audit", "unknown", "error");
    setStatus("plane", "unknown", "error");
  }
}

refreshSystemStatus();
