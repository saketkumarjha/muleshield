import { apiGet, ApiError } from "../api.js";
import { errorBanner } from "../components.js";

export async function mountRing(mountEl) {
  mountEl.innerHTML = `
    <div class="screen-header"><h1>Ring Explorer</h1></div>
    <div id="ring-host">Loading…</div>
  `;

  try {
    const ring = await apiGet("/api/ring/RING-4471");
    const nodeById = Object.fromEntries(ring.nodes.map((n) => [n.id, n]));

    mountEl.querySelector("#ring-host").innerHTML = `
      <div class="ring-plane">
        <div class="ring-plane__banner">SIMULATED TRANSACTION PLANE — ${ring.ring_id} — ${ring.time_window}</div>
        <div class="ring-layout">
          <div class="ring-canvas">
            ${ring.edges.map((e) => `
              <div class="ring-edge-row" data-from="${e.from}" data-to="${e.to}">
                <span class="ring-edge-row__node font-mono">${nodeById[e.from]?.label || e.from}</span>
                <span class="ring-edge-row__arrow">→</span>
                <span class="ring-edge-row__node font-mono">${nodeById[e.to]?.label || e.to}</span>
                <span class="font-mono" style="margin-left:auto;color:var(--color-muted);">${e.amount.toLocaleString()} · ${e.channel}</span>
              </div>
            `).join("")}
          </div>
          <div class="ring-why">
            <h2>Why a ring</h2>
            <ul>${ring.why_flagged.map((w) => `<li>${w}</li>`).join("")}</ul>
          </div>
        </div>
        <div class="ring-inspector" id="ring-inspector">
          <h2>Selected edge</h2>
          <p style="color:var(--color-muted);font-size:13px;">Click an edge above to inspect amount, channel, timestamp, and provenance.</p>
        </div>
      </div>
    `;

    mountEl.querySelectorAll(".ring-edge-row").forEach((row) => {
      row.addEventListener("click", () => {
        const from = row.dataset.from;
        const to = row.dataset.to;
        const edge = ring.edges.find((e) => e.from === from && e.to === to);
        mountEl.querySelector("#ring-inspector").innerHTML = `
          <h2>Selected edge</h2>
          <p><span class="font-mono">${from}</span> → <span class="font-mono">${to}</span></p>
          <p>Amount: <span class="font-mono">${edge.amount.toLocaleString()}</span> · Channel: ${edge.channel}</p>
          <p>Timestamp: <span class="font-mono">${edge.timestamp}</span></p>
          <p style="color:var(--color-simulated);font-size:12px;">Provenance: SIMULATED — supplied dataset contains no real edges.</p>
        `;
      });
    });
  } catch (err) {
    if (err instanceof ApiError) {
      mountEl.querySelector("#ring-host").innerHTML = errorBanner(err);
    } else {
      throw err;
    }
  }
}
