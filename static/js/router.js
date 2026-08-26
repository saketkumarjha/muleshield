const screens = new Map();
let mountEl = null;

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
  mountEl.innerHTML = "";
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("nav-item--active", el.dataset.screen === name);
  });
  if (!mountFn) {
    mountEl.innerHTML = `<div class="empty-state"><p>Unknown screen: ${name}</p></div>`;
    return;
  }
  await mountFn(mountEl, params);
}

export function startRouter(mountElement) {
  mountEl = mountElement;
  window.addEventListener("hashchange", render);
  if (!window.location.hash) {
    window.location.hash = "#/queue";
  } else {
    render();
  }
}

export function navigateTo(hash) {
  window.location.hash = hash;
}
