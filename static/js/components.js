const BAND_LABELS = {
  critical: "Critical",
  urgent: "Urgent",
  investigate: "Investigate",
  watch: "Watch",
  broad_watch: "Broad Watch",
  no_alert: "No Alert",
};

export function riskChip(band) {
  const label = BAND_LABELS[band] || band;
  return `<span class="chip chip--${band}">${label}</span>`;
}

const PROVENANCE_LABELS = {
  real: "REAL",
  simulated: "SIMULATED",
  policy: "POLICY",
};

export function provenanceBadge(kind) {
  const label = PROVENANCE_LABELS[kind] || kind.toUpperCase();
  return `<span class="badge badge--${kind}">${label}</span>`;
}

export function skeletonRows(count) {
  return Array.from({ length: count }, () => `<div class="skeleton-row"></div>`).join("");
}

export function emptyState(message) {
  return `<div class="empty-state"><p>${message}</p></div>`;
}

export function errorBanner(apiError) {
  return `
    <div class="error-banner">
      <div class="error-banner__code">${apiError.errorCode}</div>
      <p>${apiError.message}</p>
      ${apiError.correctiveAction ? `<p>${apiError.correctiveAction}</p>` : ""}
    </div>
  `;
}
