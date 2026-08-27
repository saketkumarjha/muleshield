import { apiGet, ApiError } from "../api.js";
import {
  errorBanner, esc, emptyState, fmtAmount, skeletonRows, announceSlowLoad,
} from "../components.js";

const NODE_CAP = 60;
const VIEW_W = 900;
const VIEW_H = 420;

const BAND_FILL = {
  critical: "var(--band-critical)",
  urgent: "var(--band-urgent)",
  investigate: "var(--band-investigate)",
  watch: "var(--band-watch)",
  broad_watch: "var(--band-broad-watch)",
};

/**
 * Deterministic layered layout. Depth comes from a BFS over the directed edges,
 * so the graph settles once and never moves again.
 */
function layout(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => {
    if (incoming.has(e.to)) incoming.set(e.to, incoming.get(e.to) + 1);
  });

  const depth = new Map();
  const roots = nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  const queue = roots.length ? [...roots] : [nodes[0].id];
  queue.forEach((id) => depth.set(id, 0));

  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const id = queue.shift();
    const d = depth.get(id);
    edges.filter((e) => e.from === id).forEach((e) => {
      if (!depth.has(e.to) || depth.get(e.to) < d + 1) {
        depth.set(e.to, d + 1);
        queue.push(e.to);
      }
    });
  }
  nodes.forEach((n) => { if (!depth.has(n.id)) depth.set(n.id, 0); });

  const layers = new Map();
  nodes.forEach((n) => {
    const d = depth.get(n.id);
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(n);
  });

  const maxDepth = Math.max(...layers.keys());
  const positions = new Map();
  layers.forEach((group, d) => {
    const x = maxDepth === 0 ? VIEW_W / 2 : 70 + (d / maxDepth) * (VIEW_W - 140);
    group.forEach((n, i) => {
      const y = group.length === 1
        ? VIEW_H / 2
        : 60 + (i / (group.length - 1)) * (VIEW_H - 120);
      positions.set(n.id, { x, y });
    });
  });
  return { positions, byId };
}

function nodeRadius(node) {
  // Size by risk rank; non-account nodes stay small and neutral.
  if (node.type !== "account") return 9;
  const rank = node.risk_rank || 3;
  return Math.max(11, 20 - rank * 2);
}

function edgeWidth(amount, maxAmount) {
  const scale = maxAmount ? amount / maxAmount : 0.5;
  return (1.2 + scale * 4.2).toFixed(2); // capped scale
}

export async function mountRing(mountEl, params) {
  const requestedRing = params && params[0];

  mountEl.innerHTML = `
    <div class="screen-header">
      <h1>Ring Explorer</h1>
      <span class="tag tag--sim">SIMULATED TRANSACTION PLANE</span>
    </div>
    <div id="ring-host">${skeletonRows(4)}</div>
  `;
  const cancel = announceSlowLoad(mountEl.querySelector("#ring-host"), "the simulated graph plane");

  let ring;
  try {
    const list = await apiGet("/api/rings");
    const ringId = requestedRing && list.ring_ids.includes(requestedRing)
      ? requestedRing
      : list.default_ring_id;
    ring = await apiGet(`/api/ring/${encodeURIComponent(ringId)}`);
    cancel();
  } catch (err) {
    cancel();
    mountEl.querySelector("#ring-host").innerHTML = err instanceof ApiError
      ? errorBanner(err, "degraded")
      : errorBanner({ errorCode: "GRAPH_FIXTURE_UNAVAILABLE",
          message: "The simulated graph plane could not be loaded.",
          retryable: true, correctiveAction: null }, "degraded");
    return;
  }

  const nodes = ring.nodes.slice(0, NODE_CAP);
  const capped = ring.nodes.length - nodes.length;
  const visible = new Set(nodes.map((n) => n.id));
  const edges = ring.edges.filter((e) => visible.has(e.from) && visible.has(e.to));

  if (!nodes.length) {
    mountEl.querySelector("#ring-host").innerHTML = emptyState(
      "This ring has no nodes.",
      "Zero is a valid result for the generated plane, not missing data.");
    return;
  }

  const { positions, byId } = layout(nodes, edges);
  const maxAmount = Math.max(...edges.map((e) => e.amount), 1);

  const svg = `
    <svg class="ring-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img"
         aria-label="Simulated fund-flow graph for ring ${esc(ring.ring_id)}">
      <title>Simulated fund-flow graph for ring ${esc(ring.ring_id)}</title>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-strong-border)"/>
        </marker>
      </defs>
      <g class="ring-edges">
        ${edges.map((e, i) => {
          const a = positions.get(e.from); const b = positions.get(e.to);
          return `<line class="ring-edge" data-edge="${i}"
            x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
            stroke-width="${edgeWidth(e.amount, maxAmount)}"
            marker-end="url(#arrow)"><title>${esc(e.from)} to ${esc(e.to)}, ${esc(fmtAmount(e.amount))} via ${esc(e.channel)}</title></line>`;
        }).join("")}
      </g>
      <g class="ring-nodes">
        ${nodes.map((n) => {
          const p = positions.get(n.id);
          const fill = n.band ? BAND_FILL[n.band] : "var(--color-border)";
          return `
            <g class="ring-node" data-node="${esc(n.id)}" tabindex="0" role="button"
               aria-label="${esc(n.label)}, ${esc(n.type)}${n.band ? ", band " + esc(n.band) : ""}">
              <circle cx="${p.x}" cy="${p.y}" r="${nodeRadius(n)}"
                      fill="${fill}" stroke="var(--color-navy)" stroke-width="1.2"/>
              <text x="${p.x}" y="${p.y + nodeRadius(n) + 13}" text-anchor="middle"
                    class="ring-node__label">${esc(n.label)}</text>
            </g>`;
        }).join("")}
      </g>
    </svg>
  `;

  mountEl.querySelector("#ring-host").innerHTML = `
    <div class="ring-plane">
      <div class="ring-plane__banner">
        SIMULATED TRANSACTION PLANE — ${esc(ring.ring_id)} — ${esc(ring.time_window)}
      </div>
      <p class="ring-plane__caveat">${esc(ring.banner)}</p>

      <div class="ring-toolbar">
        <label for="ring-select">Ring</label>
        <select id="ring-select">
          ${ring.ring_ids.map((id) => `
            <option value="${esc(id)}" ${id === ring.ring_id ? "selected" : ""}>${esc(id)}</option>`).join("")}
        </select>
        <button class="btn-secondary" id="ring-reset">Reset view</button>
        <button class="btn-secondary" id="ring-fit">Fit to screen</button>
        <span class="ring-toolbar__note">
          ${esc(nodes.length)} of ${esc(ring.nodes.length)} nodes shown (cap ${NODE_CAP})${capped > 0 ? `, ${esc(capped)} hidden` : ""}
        </span>
      </div>

      <div class="ring-layout">
        <div class="ring-canvas" id="ring-canvas">${svg}</div>
        <div class="ring-why">
          <h2>Why a ring</h2>
          <ul>${ring.why_flagged.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
          <p class="evidence-row__caveat">${esc(ring.why_flagged_caveat)}</p>
        </div>
      </div>

      <div class="ring-inspector" id="ring-inspector" aria-live="polite">
        <h2>Inspector</h2>
        <p class="ring-inspector__hint">
          Hover to preview. Click a node or edge to pin it. Escape clears the selection.
        </p>
      </div>
    </div>
  `;

  const inspector = mountEl.querySelector("#ring-inspector");
  let pinned = false;

  function showEdge(e) {
    inspector.innerHTML = `
      <h2>Selected edge</h2>
      <p><span class="font-mono">${esc(e.from)}</span> → <span class="font-mono">${esc(e.to)}</span></p>
      <p>Amount: <span class="font-mono">${esc(fmtAmount(e.amount))}</span> · Channel: ${esc(e.channel)}</p>
      <p>Timestamp: <span class="font-mono">${esc(e.timestamp)}</span></p>
      <p class="ring-inspector__provenance">Provenance: SIMULATED — the supplied dataset contains no real edges.</p>
    `;
  }

  function showNode(n) {
    const out = edges.filter((e) => e.from === n.id);
    const inb = edges.filter((e) => e.to === n.id);
    inspector.innerHTML = `
      <h2>Selected node</h2>
      <p class="font-mono">${esc(n.label)}</p>
      <p>Type: ${esc(n.type)}${n.band ? ` · Band: ${esc(n.band)}` : ""}</p>
      <p>Inbound edges: ${esc(inb.length)} · Outbound edges: ${esc(out.length)}</p>
      <p class="ring-inspector__provenance">Provenance: SIMULATED — node and edges are generated, not observed.</p>
    `;
  }

  function clearSelection() {
    pinned = false;
    mountEl.querySelectorAll(".ring-edge, .ring-node").forEach((el) => {
      el.classList.remove("is-selected");
    });
    mountEl.querySelector(".ring-svg")?.classList.remove("has-selection");
    inspector.innerHTML = `
      <h2>Inspector</h2>
      <p class="ring-inspector__hint">
        Hover to preview. Click a node or edge to pin it. Escape clears the selection.
      </p>`;
  }

  function select(el, render) {
    pinned = true;
    mountEl.querySelectorAll(".ring-edge, .ring-node").forEach((n) => n.classList.remove("is-selected"));
    el.classList.add("is-selected");
    mountEl.querySelector(".ring-svg").classList.add("has-selection");
    render();
  }

  mountEl.querySelectorAll(".ring-edge").forEach((el) => {
    const e = edges[Number(el.dataset.edge)];
    el.addEventListener("mouseenter", () => { if (!pinned) showEdge(e); });
    el.addEventListener("click", () => select(el, () => showEdge(e)));
  });

  mountEl.querySelectorAll(".ring-node").forEach((el) => {
    const n = byId.get(el.dataset.node);
    el.addEventListener("mouseenter", () => { if (!pinned) showNode(n); });
    el.addEventListener("focus", () => { if (!pinned) showNode(n); });
    el.addEventListener("click", () => select(el, () => showNode(n)));
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(el, () => showNode(n)); }
    });
  });

  const onKey = (e) => { if (e.key === "Escape") clearSelection(); };
  document.addEventListener("keydown", onKey);
  mountEl.addEventListener("screen:unmount", () => {
    document.removeEventListener("keydown", onKey);
  }, { once: true });

  const canvas = mountEl.querySelector("#ring-canvas");
  mountEl.querySelector("#ring-reset").addEventListener("click", () => {
    clearSelection();
    canvas.scrollTo({ left: 0, top: 0 });
  });
  mountEl.querySelector("#ring-fit").addEventListener("click", () => {
    canvas.classList.toggle("ring-canvas--fit");
  });
  mountEl.querySelector("#ring-select").addEventListener("change", (e) => {
    window.location.hash = `#/ring/${e.target.value}`;
  });
}
