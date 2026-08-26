import { apiPost, ApiError } from "../api.js";
import { errorBanner } from "../components.js";
import { registerHoldDrawer } from "./case.js";

export function initHoldDrawer() {
  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  const drawer = document.createElement("div");
  drawer.className = "drawer";
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  let currentAccount = null;
  let currentHold = null;

  function close() {
    overlay.classList.remove("drawer-overlay--open");
    drawer.classList.remove("drawer--open");
  }

  overlay.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  function renderProposeStep() {
    drawer.innerHTML = `
      <h2>Propose hold — ${currentAccount.account_id}</h2>
      <div id="drawer-error"></div>
      <label for="maker">Maker identity</label>
      <input id="maker" type="text" value="analyst.rao" />
      <label for="rationale">Rationale</label>
      <textarea id="rationale" rows="4">${currentAccount.top_evidence_title}</textarea>
      <div class="drawer__step">
        <button class="btn-primary" id="submit-proposal">Submit for independent approval</button>
      </div>
    `;
    drawer.querySelector("#submit-proposal").addEventListener("click", submitProposal);
  }

  async function submitProposal() {
    const maker = drawer.querySelector("#maker").value.trim();
    const rationale = drawer.querySelector("#rationale").value.trim();
    const errorHost = drawer.querySelector("#drawer-error");
    errorHost.innerHTML = "";
    try {
      currentHold = await apiPost("/api/hold", {
        account_id: currentAccount.account_id,
        action: "propose_hold",
        rationale,
        maker,
      });
      renderPendingStep();
    } catch (err) {
      if (err instanceof ApiError) {
        errorHost.innerHTML = errorBanner(err);
      } else {
        throw err;
      }
    }
  }

  function renderPendingStep() {
    drawer.innerHTML = `
      <h2>Pending independent approval</h2>
      <p>Hold <span class="font-mono">${currentHold.hold_id}</span> proposed by <strong>${currentHold.maker}</strong>.</p>
      <p>Expires: <span class="font-mono">${currentHold.expires_at}</span></p>
      <p>Switch to an independent senior analyst identity to approve or reject.</p>
      <div class="drawer__step">
        <label for="checker">Checker identity</label>
        <input id="checker" type="text" value="senior.iyer" />
        <label for="note">Decision note (required to reject)</label>
        <textarea id="note" rows="3"></textarea>
        <div id="drawer-error"></div>
        <button class="btn-primary" id="approve-btn">Approve recommendation</button>
        <button class="btn-secondary" id="reject-btn">Reject recommendation</button>
      </div>
    `;
    drawer.querySelector("#approve-btn").addEventListener("click", () => submitDecision("approve"));
    drawer.querySelector("#reject-btn").addEventListener("click", () => submitDecision("reject"));
  }

  async function submitDecision(decision) {
    const checker = drawer.querySelector("#checker").value.trim();
    const note = drawer.querySelector("#note").value.trim();
    const errorHost = drawer.querySelector("#drawer-error");
    errorHost.innerHTML = "";
    try {
      const result = await apiPost(`/api/hold/${currentHold.hold_id}/decision`, {
        checker,
        decision,
        note: note || null,
      });
      renderConfirmation(result);
    } catch (err) {
      if (err instanceof ApiError) {
        errorHost.innerHTML = errorBanner(err);
      } else {
        throw err;
      }
    }
  }

  function renderConfirmation(result) {
    drawer.innerHTML = `
      <h2>Decision recorded</h2>
      <div class="drawer__confirmation">
        <p>Status: <strong>${result.status}</strong></p>
        <p>Maker: ${result.maker} · Checker: ${result.checker}</p>
        <p class="drawer__audit-ref">Audit reference: ${result.audit_reference}</p>
      </div>
      <div class="drawer__step">
        <button class="btn-secondary" id="close-drawer">Close</button>
      </div>
    `;
    drawer.querySelector("#close-drawer").addEventListener("click", close);
  }

  function openDrawer(account) {
    currentAccount = account;
    currentHold = null;
    overlay.classList.add("drawer-overlay--open");
    drawer.classList.add("drawer--open");
    renderProposeStep();
  }

  registerHoldDrawer(openDrawer);
}
