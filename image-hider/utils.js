// Shared helpers used by background.js and popup.js

const STORAGE_KEY = "blockedSites"; // stored as { "example.com": true | false }

// "WWW.Example.com." -> "example.com"
function normalizeDomain(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "")
    .replace(/^www\./, "");
}

// True for a host name such as "news.com" or "m.news.com".
// Rejects wildcards, spaces, empty labels and leading/trailing hyphens, which
// declarativeNetRequest would refuse as initiator domains (a single bad entry
// makes the whole rule update fail, so everything must be validated).
function isValidDomain(domain) {
  if (!domain || domain.length > 253) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}

// Returns the normalized domain of a web page URL, or null for browser pages
// such as chrome:// or the new tab page.
function domainFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const domain = normalizeDomain(parsed.hostname);
    return isValidDomain(domain) ? domain : null;
  } catch (e) {
    return null;
  }
}

// Accepts "news.com", "www.news.com/page" or "https://news.com" and returns "news.com".
// Returns null when the input is not a usable domain.
function parseDomainInput(input) {
  let value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  // People often type a wildcard even though we match subdomains already.
  value = value.replace(/^\*\./, "");
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = "https://" + value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const domain = normalizeDomain(parsed.hostname);
    return isValidDomain(domain) ? domain : null;
  } catch (e) {
    return null;
  }
}

// True when `host` is `domain` itself or one of its subdomains.
// domainCovers("news.com", "m.news.com") -> true
function domainCovers(domain, host) {
  return host === domain || host.endsWith("." + domain);
}

// Returns the most specific saved domain that covers `host`, or null.
function findMatchingDomain(host, sites) {
  let best = null;
  for (const domain of Object.keys(sites)) {
    if (domainCovers(domain, host) && (best === null || domain.length > best.length)) {
      best = domain;
    }
  }
  return best;
}
