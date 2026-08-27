const screens = new Map();
let mountEl = null;

// Screens that are reached from another screen rather than the sidebar.
const NAV_PARENT = { case: "queue" };

export function registerScreen(name, mountFn) {
  screens.set(name, mountFn);
}

function parseHash() {
  const hash = window.location.hash.replace(/^#\//, "");
  const [name, ...rest] = hash.split("/");
  return { name: name || "queue", params: rest };
}

async function render() {
  const { name, params } = parseHash();
  const mountFn = screens.get(name);

  // Let the outgoing screen drop its document-level listeners.
  mountEl.dispatchEvent(new CustomEvent("screen:unmount"));
  mountEl.innerHTML = "";

  const navTarget = NAV_PARENT[name] || name;
  document.querySelectorAll(".nav-item").forEach((el) => {
    const active = el.dataset.screen === navTarget;
    el.classList.toggle("nav-item--active", active);
    if (active) {
      el.setAttribute("aria-current", "page");
    } else {
      el.removeAttribute("aria-current");
    }
  });

  if (!mountFn) {
    mountEl.innerHTML =
      `<div class="empty-state" role="status"><p class="empty-state__message">` +
      `Unknown screen.</p><p class="empty-state__reason">` +
      `Use the navigation to open a valid screen.</p></div>`;
    return;
  }
  await mountFn(mountEl, params);
}

export function startRouter(mountElement) {
  mountEl = mountElement;
  window.addEventListener("hashchange", render);
  if (!window.location.hash) {
    // Known opening state: queue, Critical band, analyst role, no drawer.
    window.location.hash = "#/queue";
  } else {
    render();
  }
}

export function navigateTo(hash) {
  window.location.hash = hash;
}
