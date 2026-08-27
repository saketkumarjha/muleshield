import { apiPost, ApiError } from "../api.js";
import { errorBanner, esc, fmtAmount, icon } from "../components.js";
import { registerHoldDrawer } from "./case.js";
import { currentIdentity, currentRole, identityForRole } from "../identity.js";
import { refreshSystemStatus } from "../main.js";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function initHoldDrawer() {
  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  const drawer = document.createElement("div");
  drawer.className = "drawer";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-label", "Hold proposal and approval");
  drawer.hidden = true;
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  let currentAccount = null;
  let currentHold = null;
  let lastFocused = null;

  function close() {
    overlay.classList.remove("drawer-overlay--open");
    drawer.classList.remove("drawer--open");
    drawer.hidden = true;
    document.removeEventListener("keydown", onKeydown, true);
    lastFocused?.focus();
  }

  function focusFirst() {
    const target = drawer.querySelector(FOCUSABLE);
    target?.focus();
  }

  /** Escape closes; Tab is trapped inside the drawer while it is open. */
  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const items = Array.from(drawer.querySelectorAll(FOCUSABLE))
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  overlay.addEventListener("click", close);

  function contextRows(hold) {
    const rows = [
      ["Hold ID", hold.hold_id, true],
      ["Account", hold.account_id, true],
      ["Transaction", hold.transaction_id || "none in the simulated plane", true],
      ["Counterparty", hold.counterparty || "none in the simulated plane", true],
      ["Amount", hold.amount != null ? fmtAmount(hold.amount) : "—", true],
      ["Channel", hold.channel || "—", false],
      ["Ring", hold.ring_id || "none", true],
      ["Affected accounts",
        hold.affected_accounts.length ? hold.affected_accounts.join(", ") : "none", true],
      ["Interception window", `${hold.interception_window_minutes} minutes (simulated)`, false],
      ["Expires", hold.expires_at, true],
    ];
    return rows.map(([label, value, mono]) => `
      <div class="drawer__row">
        <span class="drawer__row-label">${esc(label)}</span>
        <span class="${mono ? "font-mono" : ""}">${esc(value)}</span>
      </div>`).join("");
  }

  function renderProposeStep() {
    drawer.innerHTML = `
      <div class="drawer__head">
        <h2>Propose hold — <span class="font-mono">${esc(currentAccount.account_id)}</span></h2>
        <button class="drawer__close" id="drawer-close" aria-label="Close">×</button>
      </div>
      <div id="drawer-error"></div>
      <p class="drawer__step-label">Step 1 of 3 — Proposal</p>

      <label for="maker">Maker identity</label>
      <input id="maker" type="text" value="${esc(currentIdentity())}" />
      <p class="drawer__identity-note">
        DEMO IDENTITY — NOT AUTHENTICATION. Current role: ${esc(currentRole())}.
        Identities are unverified; SSO and RBAC are not integrated.
      </p>

      <label for="proposed-action">Proposed action</label>
      <select id="proposed-action">
        <option value="propose_hold">Hold outgoing transfers pending review</option>
        <option value="propose_step_up">Step-up verification on next transfer</option>
        <option value="propose_watch">Enhanced monitoring only</option>
      </select>

      <label for="rationale">Rationale (required)</label>
      <textarea id="rationale" rows="4">${esc(currentAccount.top_evidence_title || "")}</textarea>

      <p class="drawer__warning">
        ${icon("warning", "Notice")}
        The bank core system executes any actual restriction. Submitting this
        creates a recommendation only.
      </p>

      <div class="drawer__step">
        <button class="btn-primary" id="submit-proposal">Submit for independent approval</button>
        <button class="btn-secondary" id="cancel-proposal">Cancel</button>
      </div>
    `;
    drawer.querySelector("#drawer-close").addEventListener("click", close);
    drawer.querySelector("#cancel-proposal").addEventListener("click", close);
    drawer.querySelector("#submit-proposal").addEventListener("click", submitProposal);
    focusFirst();
  }

  async function submitProposal() {
    const btn = drawer.querySelector("#submit-proposal");
    const maker = drawer.querySelector("#maker").value.trim();
    const rationale = drawer.querySelector("#rationale").value.trim();
    const action = drawer.querySelector("#proposed-action").value;
    const errorHost = drawer.querySelector("#drawer-error");
    errorHost.innerHTML = "";
    btn.disabled = true; // prevents accidental double submission
    try {
      currentHold = await apiPost("/api/hold", {
        account_id: currentAccount.account_id, action, rationale, maker,
      });
      renderPendingStep();
      refreshSystemStatus();
    } catch (err) {
      // Form state is preserved on an inline error.
      errorHost.innerHTML = err instanceof ApiError
        ? errorBanner(err, "action")
        : errorBanner({ errorCode: "HOLD_NOT_RECORDED",
            message: "Server confirmation failed. No hold was recorded.",
            retryable: true, correctiveAction: "Retry the proposal." }, "action");
      btn.disabled = false;
    }
  }

  function renderPendingStep() {
    const senior = identityForRole("senior");
    const suggested = senior !== currentHold.maker ? senior : identityForRole("auditor");
    drawer.innerHTML = `
      <div class="drawer__head">
        <h2>Pending independent approval</h2>
        <button class="drawer__close" id="drawer-close" aria-label="Close">×</button>
      </div>
      <p class="drawer__step-label">Step 2 of 3 — Pending</p>

      <p class="drawer__status drawer__status--pending">
        Status: <strong>${esc(currentHold.status)}</strong>
      </p>
      ${contextRows(currentHold)}
      <div class="drawer__row">
        <span class="drawer__row-label">Maker</span>
        <span class="font-mono">${esc(currentHold.maker)}</span>
      </div>
      <div class="drawer__row">
        <span class="drawer__row-label">Rationale</span>
        <span>${esc(currentHold.rationale)}</span>
      </div>
      <p class="drawer__locked-note">
        Evidence and rationale are locked. Switch to an independent senior
        analyst identity to approve or reject.
      </p>

      <p class="drawer__step-label">Step 3 of 3 — Checker decision</p>
      <label for="checker">Checker identity</label>
      <input id="checker" type="text" value="${esc(suggested)}" />
      <p class="drawer__identity-note">
        Maker <span class="font-mono">${esc(currentHold.maker)}</span> — the
        checker must be a different person. The server enforces this.
      </p>

      <label for="note">Decision note (required to reject)</label>
      <textarea id="note" rows="3"></textarea>

      <p class="drawer__warning">
        ${icon("warning", "Notice")}
        ${esc(currentHold.execution_statement)}
      </p>

      <div id="drawer-error"></div>
      <div class="drawer__step">
        <button class="btn-primary" id="approve-btn">Approve recommendation</button>
        <button class="btn-secondary" id="reject-btn">Reject recommendation</button>
      </div>
    `;
    drawer.querySelector("#drawer-close").addEventListener("click", close);
    drawer.querySelector("#approve-btn").addEventListener("click", () => submitDecision("approve"));
    drawer.querySelector("#reject-btn").addEventListener("click", () => submitDecision("reject"));
    focusFirst();
  }

  async function submitDecision(decision) {
    const approve = drawer.querySelector("#approve-btn");
    const reject = drawer.querySelector("#reject-btn");
    const checker = drawer.querySelector("#checker").value.trim();
    const note = drawer.querySelector("#note").value.trim();
    const errorHost = drawer.querySelector("#drawer-error");
    errorHost.innerHTML = "";
    approve.disabled = true;
    reject.disabled = true;
    try {
      const result = await apiPost(`/api/hold/${encodeURIComponent(currentHold.hold_id)}/decision`, {
        checker, decision, note: note || null,
      });
      renderConfirmation(result);
      refreshSystemStatus();
    } catch (err) {
      errorHost.innerHTML = err instanceof ApiError
        ? errorBanner(err, "action")
        : errorBanner({ errorCode: "DECISION_NOT_RECORDED",
            message: "Server confirmation failed. No decision was recorded.",
            retryable: true, correctiveAction: "Retry the decision." }, "action");
      approve.disabled = false;
      reject.disabled = false;
    }
  }

  function renderConfirmation(result) {
    drawer.innerHTML = `
      <div class="drawer__head">
        <h2>Decision recorded</h2>
        <button class="drawer__close" id="drawer-close" aria-label="Close">×</button>
      </div>
      <div class="drawer__confirmation">
        <p class="drawer__status drawer__status--${esc(result.status)}">
          Status: <strong>${esc(result.status)}</strong>
        </p>
        <div class="drawer__row">
          <span class="drawer__row-label">Maker</span>
          <span class="font-mono">${esc(result.maker)}</span>
        </div>
        <div class="drawer__row">
          <span class="drawer__row-label">Checker</span>
          <span class="font-mono">${esc(result.checker)}</span>
        </div>
        ${result.decision_note ? `
          <div class="drawer__row">
            <span class="drawer__row-label">Decision note</span>
            <span>${esc(result.decision_note)}</span>
          </div>` : ""}
        <p class="drawer__audit-ref font-mono">Audit reference: ${esc(result.audit_reference)}</p>
        <p class="drawer__locked-note">${esc(result.execution_statement)}</p>
      </div>
      <div class="drawer__step">
        <button class="btn-secondary" id="close-drawer">Close</button>
      </div>
    `;
    drawer.querySelector("#drawer-close").addEventListener("click", close);
    drawer.querySelector("#close-drawer").addEventListener("click", close);
    focusFirst();
  }

  function openDrawer(account) {
    lastFocused = document.activeElement;
    currentAccount = account;
    currentHold = null;
    drawer.hidden = false;
    overlay.classList.add("drawer-overlay--open");
    drawer.classList.add("drawer--open");
    document.addEventListener("keydown", onKeydown, true);
    renderProposeStep();
  }

  registerHoldDrawer(openDrawer);
}
