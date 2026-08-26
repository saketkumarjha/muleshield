import { registerScreen, startRouter } from "./router.js";
import { mountQueue } from "./screens/queue.js";
import { mountCase } from "./screens/case.js";
import { initHoldDrawer } from "./screens/makerChecker.js";
import { emptyState } from "./components.js";
import { apiGet } from "./api.js";

registerScreen("queue", mountQueue);
registerScreen("case", mountCase);
registerScreen("transactions", async (el) => {
  el.innerHTML = emptyState("Transactions screen is not part of this build.");
});
registerScreen("ring", async (el) => {
  el.innerHTML = emptyState("Ring Explorer is not part of this build.");
});
registerScreen("governance", async (el) => {
  el.innerHTML = emptyState("Governance screen is not part of this build.");
});
registerScreen("model-card", async (el) => {
  el.innerHTML = emptyState("Model Card screen is not part of this build.");
});

initHoldDrawer();
startRouter(document.getElementById("screen-mount"));

apiGet("/api/queue").then((data) => {
  document.getElementById("topbar-model-version").textContent = `model: ${data.model_version}`;
}).catch(() => {
  document.getElementById("topbar-model-version").textContent = "model: unavailable";
});
