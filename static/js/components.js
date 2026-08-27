/**
 * Shared presentation components.
 *
 * Every value that reaches innerHTML passes through esc(). Server responses are
 * treated as untrusted for HTML rendering, per the governance contract.
 */

export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BAND_LABELS = {
  critical: "Critical",
  urgent: "Urgent",
  investigate: "Investigate",
  watch: "Watch",
  broad_watch: "Broad Watch",
  no_alert: "No Alert",
};

export function bandLabel(band) {
  return BAND_LABELS[band] || band || "—";
}

export function riskChip(band) {
  if (!band) return `<span class="chip chip--no_alert">—</span>`;
  return `<span class="chip chip--${esc(band)}">${esc(bandLabel(band))}</span>`;
}

const PROVENANCE_LABELS = {
  real: "REAL",
  simulated: "SIMULATED",
  policy: "POLICY",
};

export function provenanceBadge(kind) {
  const label = PROVENANCE_LABELS[kind] || String(kind || "").toUpperCase();
  return `<span class="badge badge--${esc(kind)}">${esc(label)}</span>`;
}

/* --- Icons (design guide 5.6). Inline, local, each with an accessible name. --- */
const ICON_PATHS = {
  queue: "M3 5h18M3 10h18M3 15h12M3 20h8",
  case: "M4 4h11l5 5v11H4z M15 4v5h5",
  graph: "M6 18a2 2 0 100-4 2 2 0 000 4z M18 8a2 2 0 100-4 2 2 0 000 4z M12 20a2 2 0 100-4 2 2 0 000 4z M7.5 15.5l9-9",
  transactions: "M4 8h14l-3-3 M20 16H6l3 3",
  shield: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z",
  audit: "M5 4h14v16H5z M8 9h8M8 13h8M8 17h4",
  model: "M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 100 6 3 3 0 000-6z",
  warning: "M12 4l9 16H3z M12 10v4M12 17h.01",
  simulated: "M4 12h16M4 7h16M4 17h16",
  verified: "M4 12l5 5L20 6",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14z M20 20l-4-4",
};

export function icon(name, accessibleName) {
  const path = ICON_PATHS[name];
  if (!path) return "";
  const label = accessibleName || name;
  return (
    `<svg class="icon" viewBox="0 0 24 24" role="img" aria-label="${esc(label)}" ` +
    `fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ` +
    `stroke-linejoin="round" focusable="false"><title>${esc(label)}</title>` +
    `<path d="${path}"/></svg>`
  );
}

export function skeletonRows(count) {
  return (
    `<div class="skeleton" role="status" aria-live="polite" aria-busy="true">` +
    `<span class="visually-hidden">Loading</span>` +
    Array.from({ length: count }, () => `<div class="skeleton-row"></div>`).join("") +
    `<p class="skeleton__slow" hidden></p></div>`
  );
}

/**
 * After two seconds, name the service still loading. Returns a cancel function.
 */
export function announceSlowLoad(hostEl, serviceName) {
  const timer = setTimeout(() => {
    const note = hostEl.querySelector(".skeleton__slow");
    if (note) {
      note.textContent = `Still loading ${serviceName}…`;
      note.hidden = false;
    }
  }, 2000);
  return () => clearTimeout(timer);
}

/**
 * @param {string} message what is empty
 * @param {string} reason  whether zero is a valid result or missing data
 */
export function emptyState(message, reason) {
  return `
    <div class="empty-state" role="status">
      <p class="empty-state__message">${esc(message)}</p>
      ${reason ? `<p class="empty-state__reason">${esc(reason)}</p>` : ""}
    </div>
  `;
}

/**
 * Failure classification. `severity` is one of:
 *   blocking  model, real-case or audit failure
 *   degraded  simulated plane only
 *   action    an action failed; form state is preserved
 */
export function errorBanner(apiError, severity = "blocking") {
  const retry = apiError && apiError.retryable
    ? `<p class="error-banner__retry">This request can be retried.</p>`
    : "";
  return `
    <div class="error-banner error-banner--${esc(severity)}" role="alert">
      <div class="error-banner__head">
        ${icon("warning", "Error")}
        <span class="error-banner__code">${esc(apiError.errorCode)}</span>
      </div>
      <p>${esc(apiError.message)}</p>
      ${apiError.correctiveAction ? `<p class="error-banner__action">${esc(apiError.correctiveAction)}</p>` : ""}
      ${retry}
    </div>
  `;
}

export function simulatedBanner(text) {
  return `
    <div class="simulated-banner" role="note">
      ${icon("simulated", "Simulated data")}
      <span>${esc(text)}</span>
    </div>
  `;
}

export function fmtScore(value) {
  return typeof value === "number" ? value.toFixed(6) : "—";
}

export function fmtPct(value, digits = 1) {
  return typeof value === "number" ? `${(value * 100).toFixed(digits)}%` : "—";
}

export function fmtAmount(value) {
  return typeof value === "number" ? value.toLocaleString("en-IN") : "—";
}
