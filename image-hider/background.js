importScripts("utils.js");

// Builds one rule per saved domain and replaces the old ruleset.
// Images requested by pages on those domains (and their subdomains) are blocked
// before any network request is made. Paused ("false") entries become allow
// rules, and more specific domains get a higher priority, so a paused
// subdomain can override a blocked parent (and the other way around) exactly
// like the popup shows.
async function syncRules() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  const sites = (data && data[STORAGE_KEY]) || {};

  const addRules = [];
  const seen = new Set();

  for (const key of Object.keys(sites)) {
    const domain = normalizeDomain(key);
    if (!isValidDomain(domain)) {
      console.warn("Image Hider: ignoring unusable domain", key);
      continue;
    }
    if (seen.has(domain)) continue;
    seen.add(domain);
    addRules.push({
      id: addRules.length + 1,
      // More labels = more specific. The most specific matching rule wins.
      priority: domain.split(".").length,
      action: { type: sites[key] === true ? "block" : "allow" },
      condition: {
        initiatorDomains: [domain],
        resourceTypes: ["image"]
      }
    });
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((rule) => rule.id);

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });

  // Temporary blocks are only a convenience for the current page. Once a saved
  // entry covers the same domain (or the other way around), drop the temporary
  // rule so the saved switch is the single source of truth.
  const saved = Object.keys(sites).map(normalizeDomain).filter(isValidDomain);
  if (saved.length === 0) return;

  const tempRules = await chrome.declarativeNetRequest.getSessionRules();
  const removeTempIds = tempRules
    .filter((rule) => {
      const temp =
        rule.condition &&
        rule.condition.initiatorDomains &&
        rule.condition.initiatorDomains[0];
      if (!temp) return false;
      return saved.some(
        (domain) => domainCovers(domain, temp) || domainCovers(temp, domain)
      );
    })
    .map((rule) => rule.id);

  if (removeTempIds.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: removeTempIds,
      addRules: []
    });
  }
}

// Reads the domains that are blocked temporarily (session rules).
async function readTemporaryDomains() {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  return rules
    .map(
      (rule) =>
        (rule.condition &&
          rule.condition.initiatorDomains &&
          rule.condition.initiatorDomains[0]) ||
        null
    )
    .filter((domain) => domain && isValidDomain(domain));
}

// Adds or removes a session block for one domain. Temporary blocks follow the
// same specificity rule as the saved list, but are cleared on browser restart.
async function setTemporaryRule(domain, blocked) {
  const normalized = normalizeDomain(domain);
  if (!isValidDomain(normalized)) {
    throw new Error("Invalid domain: " + domain);
  }

  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const existing = rules.find(
    (rule) =>
      rule.condition &&
      rule.condition.initiatorDomains &&
      rule.condition.initiatorDomains[0] === normalized
  );

  if (blocked) {
    if (existing) return;
    const id = rules.reduce((max, rule) => Math.max(max, rule.id || 0), 0) + 1;
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [],
      addRules: [
        {
          id,
          priority: normalized.split(".").length,
          action: { type: "block" },
          condition: {
            initiatorDomains: [normalized],
            resourceTypes: ["image"]
          }
        }
      ]
    });
  } else if (existing) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [existing.id],
      addRules: []
    });
  }
}

// Runs rule updates one after another so two updates never overlap.
let syncQueue = Promise.resolve();
function enqueue(task) {
  const run = syncQueue.then(task);
  syncQueue = run.catch(() => {});
  return run;
}

// The returned promise rejects when the ruleset could not be updated, so
// callers can report it.
function requestSync() {
  return enqueue(syncRules).catch((err) => {
    console.error("Image Hider: rule sync failed", err);
    throw err;
  });
}

function requestSyncQuietly() {
  requestSync().catch(() => {});
}

chrome.runtime.onInstalled.addListener(requestSyncQuietly);
chrome.runtime.onStartup.addListener(requestSyncQuietly);

// Keeps rules in step if the list changes from another signed-in device.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) requestSyncQuietly();
});

// The popup asks for a sync and waits for it to finish, so a page reload
// right after a change uses the new rules. Failures are reported back instead
// of being reported as success.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  if (message.type === "SYNC_RULES") {
    requestSync().then(
      () =>
        readTemporaryDomains().then(
          (domains) => sendResponse({ ok: true, temporary: domains }),
          () => sendResponse({ ok: true })
        ),
      (err) =>
        sendResponse({
          ok: false,
          error: String((err && err.message) || err)
        })
    );
    return true; // keep the message channel open for the async response
  }

  if (message.type === "GET_TEMPORARY") {
    enqueue(readTemporaryDomains).then(
      (domains) => sendResponse({ ok: true, domains }),
      (err) =>
        sendResponse({
          ok: false,
          error: String((err && err.message) || err)
        })
    );
    return true;
  }

  if (message.type === "SET_TEMPORARY") {
    enqueue(() => setTemporaryRule(message.domain, message.blocked === true)).then(
      () => sendResponse({ ok: true }),
      (err) => {
        console.error("Image Hider: temporary rule update failed", err);
        sendResponse({
          ok: false,
          error: String((err && err.message) || err)
        });
      }
    );
    return true;
  }

  return false;
});

requestSyncQuietly();
