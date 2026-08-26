import { registerScreen, startRouter } from "./router.js";
import { mountQueue } from "./screens/queue.js";
import { mountCase } from "./screens/case.js";
import { initHoldDrawer } from "./screens/makerChecker.js";
import { mountTransactions } from "./screens/transactions.js";
import { mountRing } from "./screens/ring.js";
import { mountGovernance } from "./screens/governance.js";
import { mountModelCard } from "./screens/modelCard.js";
import { apiGet } from "./api.js";

registerScreen("queue", mountQueue);
registerScreen("case", mountCase);
registerScreen("transactions", mountTransactions);
registerScreen("ring", mountRing);
registerScreen("governance", mountGovernance);
registerScreen("model-card", mountModelCard);

initHoldDrawer();
startRouter(document.getElementById("screen-mount"));

apiGet("/api/queue").then((data) => {
  document.getElementById("topbar-model-version").textContent = `model: ${data.model_version}`;
}).catch(() => {
  document.getElementById("topbar-model-version").textContent = "model: unavailable";
});
