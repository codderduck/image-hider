const els = {
  siteName: document.getElementById("siteName"),
  siteStatus: document.getElementById("siteStatus"),
  siteToggle: document.getElementById("siteToggle"),
  addToListBtn: document.getElementById("addToListBtn"),
  reloadBtn: document.getElementById("reloadBtn"),
  domainInput: document.getElementById("domainInput"),
  addBtn: document.getElementById("addBtn"),
  toast: document.getElementById("toast"),
  list: document.getElementById("domainList"),
  emptyState: document.getElementById("emptyState"),
  count: document.getElementById("count"),
  themeToggle: document.getElementById("themeToggle")
};

let tab = null;          // the active tab
let currentHost = null;  // normalized domain of the active tab, e.g. "shop.example.com"
let sites = {};          // { domain: true | false }
let temporary = new Set(); // domains blocked from the main toggle but not saved yet
let toastTimer = null;
let saving = false;      // true while a change is being stored

// ---------- Toast ----------
function showToast(text, isError) {
  els.toast.textContent = text;
  els.toast.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2400);
}

// ---------- Theme ----------
const THEME_KEY = "imageHiderTheme";

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme, persist) {
  document.documentElement.dataset.theme = theme;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // Storage may be unavailable; the theme still applies for this session.
    }
  }
  const target = theme === "dark" ? "light" : "dark";
  els.themeToggle.setAttribute("aria-label", "Switch to " + target + " mode");
  els.themeToggle.title = "Switch to " + target + " mode";
}

els.themeToggle.addEventListener("click", () => {
  applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
});

applyTheme(currentTheme(), false);

// ---------- Storage and rule sync ----------
async function loadSites() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {};
}

// Domains that are blocked from the main toggle but not saved in the list yet.
async function loadTemporary() {
  const response = await chrome.runtime.sendMessage({ type: "GET_TEMPORARY" });
  if (!response || response.ok !== true) {
    throw new Error((response && response.error) || "Could not read temporary blocks");
  }
  return new Set(Array.isArray(response.domains) ? response.domains : []);
}

// Saves the list, then waits until the background has rebuilt the blocking rule.
// Throws if either step fails, so the caller can undo the change.
async function persist() {
  await chrome.storage.sync.set({ [STORAGE_KEY]: sites });
  const response = await chrome.runtime.sendMessage({ type: "SYNC_RULES" });
  if (!response || response.ok !== true) {
    throw new Error((response && response.error) || "Rule update failed");
  }
  // The background drops temporary rules for domains that are now saved.
  if (Array.isArray(response.temporary)) {
    temporary = new Set(response.temporary);
  }
}

async function reloadTab() {
  if (!tab || tab.id === undefined) return;
  try {
    await chrome.tabs.reload(tab.id);
  } catch (err) {
    console.error("Image Hider: could not reload tab", err);
  }
}

// Saves, redraws, and reloads the active tab if the change affects it.
// On failure the previous list is restored and the user is told.
async function applyChange(changedDomain, previousSites) {
  saving = true;
  try {
    await persist();
  } catch (err) {
    console.error("Image Hider: change was not applied", err);
    saving = false;
    if (previousSites) sites = previousSites;
    render();
    showToast("Couldn't save the change. Try again.", true);
    return false;
  }

  saving = false;
  render();
  if (currentHost && domainCovers(changedDomain, currentHost)) {
    await reloadTab();
  }
  return true;
}

function currentMatch() {
  return currentHost ? findMatchingDomain(currentHost, sites) : null;
}

// Most specific temporary (unsaved) block that covers the host, or null.
function currentTemp() {
  if (!currentHost) return null;
  let best = null;
  for (const domain of temporary) {
    if (domainCovers(domain, currentHost) && (best === null || domain.length > best.length)) {
      best = domain;
    }
  }
  return best;
}

// The most specific rule (saved or temporary) that decides this page,
// mirroring the priorities used by the blocking rules.
function currentRule() {
  const match = currentMatch();
  const temp = currentTemp();
  if (match && temp) {
    if (temp.split(".").length > match.split(".").length) {
      return { domain: temp, temporary: true };
    }
    return { domain: match, temporary: false };
  }
  if (temp) return { domain: temp, temporary: true };
  if (match) return { domain: match, temporary: false };
  return null;
}

function isBlocked() {
  const rule = currentRule();
  return !!rule && (rule.temporary || sites[rule.domain] === true);
}

// Blocks (or unblocks) the current host for this browser session without
// touching the saved list. "Add to list" is what makes it permanent.
async function setTemporary(domain, blocked) {
  saving = true;
  render();
  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_TEMPORARY",
      domain,
      blocked
    });
    if (!response || response.ok !== true) {
      throw new Error((response && response.error) || "Temporary rule update failed");
    }
    if (blocked) temporary.add(domain);
    else temporary.delete(domain);
    saving = false;
    render();
    return true;
  } catch (err) {
    console.error("Image Hider: could not update temporary blocking", err);
    saving = false;
    render();
    showToast("Couldn't change blocking. Try again.", true);
    return false;
  }
}

// ---------- Rendering ----------
function render() {
  let state = "disabled";

  if (currentHost) {
    const rule = currentRule();
    const blocked = isBlocked();
    state = blocked ? "blocked" : "allowed";

    els.siteName.textContent = currentHost;
    els.siteToggle.disabled = saving;
    els.siteToggle.checked = blocked;
    els.siteToggle.setAttribute(
      "aria-label",
      (blocked ? "Allow images on " : "Block images on ") + currentHost
    );

    if (!blocked) {
      els.siteStatus.textContent = "Images load normally";
    } else if (rule.temporary) {
      els.siteStatus.textContent = "Blocked temporarily";
    } else if (rule.domain === currentHost) {
      els.siteStatus.textContent = "Images blocked";
    } else {
      els.siteStatus.textContent = "Blocked by " + rule.domain;
    }
  } else {
    els.siteName.textContent = "Not available here";
    els.siteToggle.disabled = true;
    els.siteToggle.checked = false;
    els.siteToggle.setAttribute("aria-label", "Blocking is not available on this page");
    els.siteStatus.textContent = "Open a regular website";
  }

  document.documentElement.dataset.state = state;
  els.reloadBtn.disabled = !tab;

  const match = currentMatch();
  const temp = currentTemp();
  els.addToListBtn.disabled = saving || !currentHost || match !== null || !temp;
  els.addToListBtn.title = !currentHost
    ? "Open a regular website first"
    : match
      ? "Already in the blocked sites list"
      : !temp
        ? "Turn on blocking to add this site"
        : "Add " + currentHost + " to the blocked sites list";

  els.addBtn.disabled = saving;
  els.domainInput.disabled = saving;
  renderList();
}

function renderList() {
  els.list.textContent = "";
  const domains = Object.keys(sites).sort();

  els.count.textContent = String(domains.length);
  els.emptyState.hidden = domains.length > 0;

  domains.forEach((domain, index) => {
    const enabled = sites[domain] === true;
    const li = document.createElement("li");
    li.style.setProperty("--i", String(index));
    if (!enabled) li.classList.add("is-off");

    const name = document.createElement("span");
    name.className = "domain-name";
    name.textContent = domain;

    const label = document.createElement("label");
    label.className = "switch";
    label.title = "Turn blocking on or off for this site";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = enabled;
    checkbox.disabled = saving;
    checkbox.setAttribute(
      "aria-label",
      "Block images on " + domain
    );

    const track = document.createElement("span");
    track.className = "slider";

    label.append(checkbox, track);
    checkbox.addEventListener("change", () => onToggleDomain(domain, checkbox.checked));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 6h18"/>' +
      '<path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>' +
      '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
      '<path d="M10 11v6M14 11v6"/>' +
      "</svg>";
    remove.disabled = saving;
    remove.title = "Remove from list";
    remove.setAttribute("aria-label", "Remove " + domain);
    remove.addEventListener("click", () => onRemoveDomain(domain, li));

    li.append(name, label, remove);
    els.list.appendChild(li);
  });
}

// ---------- Actions ----------
// Each action snapshots the list, applies the change optimistically, and
// restores the snapshot if saving or the rule update fails.
async function onToggleDomain(domain, enabled) {
  if (saving) return;
  const previous = sites;
  sites = { ...sites, [domain]: enabled };
  const ok = await applyChange(domain, previous);
  if (ok) showToast(enabled ? "Blocking " + domain : "Paused for " + domain);
}

async function onRemoveDomain(domain, li) {
  if (saving) return;
  if (li) li.classList.add("removing");
  await new Promise((resolve) => setTimeout(resolve, 230));
  const previous = sites;
  const next = { ...sites };
  delete next[domain];
  sites = next;
  const ok = await applyChange(domain, previous);
  if (ok) showToast("Removed " + domain);
}

// Main toggle for the current site.
// On: turn on the list entry that covers this site, or block a new site
//     temporarily (new sites are never added to the list automatically).
// Off: pause the list entry that covers this site (the record stays), or
//     remove the temporary block.
els.siteToggle.addEventListener("change", async () => {
  if (saving) {
    els.siteToggle.checked = !els.siteToggle.checked;
    return;
  }
  if (!currentHost) {
    render();
    return;
  }

  const turningOn = els.siteToggle.checked;
  const rule = currentRule();

  if (turningOn) {
    if (rule && rule.temporary) {
      render();
      return;
    }

    if (rule) {
      if (sites[rule.domain] === true) {
        render();
        return;
      }
      const previous = sites;
      sites = { ...sites, [rule.domain]: true };
      const ok = await applyChange(rule.domain, previous);
      if (ok) showToast("Images blocked on " + currentHost);
      return;
    }

    const ok = await setTemporary(currentHost, true);
    if (ok) {
      await reloadTab();
      showToast("Images blocked. Add to list to keep it.");
    }
    return;
  }

  if (rule && rule.temporary) {
    const ok = await setTemporary(rule.domain, false);
    if (ok) {
      await reloadTab();
      showToast("Images allowed on " + currentHost);
    }
    return;
  }

  if (rule && sites[rule.domain] === true) {
    const previous = sites;
    sites = { ...sites, [rule.domain]: false }; // keep the record, just pause it
    const ok = await applyChange(rule.domain, previous);
    if (ok) showToast("Paused for " + rule.domain);
    return;
  }

  render();
});

// Saves the current site to the list (instead of doing it from the main toggle).
async function addCurrentSite() {
  if (saving || !currentHost || currentMatch() || !currentTemp()) return;
  const previous = sites;
  sites = { ...sites, [currentHost]: true };
  const ok = await applyChange(currentHost, previous);
  if (ok) showToast("Added " + currentHost + " to the list");
}

els.addToListBtn.addEventListener("click", addCurrentSite);

async function addDomain() {
  if (saving) return;
  const domain = parseDomainInput(els.domainInput.value);
  if (!domain) {
    showToast("Enter a valid domain, such as news.example.com", true);
    return;
  }

  const previous = sites;
  sites = { ...sites, [domain]: true };
  const ok = await applyChange(domain, previous);
  if (ok) {
    els.domainInput.value = "";
    showToast("Blocking images on " + domain);
  }
}

els.addBtn.addEventListener("click", addDomain);
els.domainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDomain();
});

els.reloadBtn.addEventListener("click", () => {
  els.reloadBtn.classList.remove("spinning");
  void els.reloadBtn.offsetWidth; // restart the CSS animation
  els.reloadBtn.classList.add("spinning");
  reloadTab();
});

// Keep an open popup in step with changes made in another window or device.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes[STORAGE_KEY]) return;
  sites = changes[STORAGE_KEY].newValue || {};
  render();
});

// ---------- Init ----------
async function init() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab || null;
    currentHost = domainFromUrl(tab && tab.url);
    sites = await loadSites();
    temporary = await loadTemporary();
  } catch (err) {
    console.error("Image Hider: could not load the popup", err);
    tab = null;
    currentHost = null;
    sites = {};
    temporary = new Set();
    render();
    showToast("Couldn't load saved sites.", true);
    return;
  }
  render();
}

init();
