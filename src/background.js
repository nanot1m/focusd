const DEFAULT_DOMAINS = ["x.com", "instagram.com"];
const ALLOW_TTL_MS = 10_000;
const allowedNavigations = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const { domains } = await chrome.storage.sync.get("domains");

  if (!Array.isArray(domains)) {
    await chrome.storage.sync.set({ domains: DEFAULT_DOMAINS });
  }
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0 || details.url.startsWith(chrome.runtime.getURL(""))) {
    return;
  }

  const url = parseUrl(details.url);
  if (!url || !["http:", "https:"].includes(url.protocol)) {
    return;
  }

  const allowKey = `${details.tabId}:${url.href}`;
  if (consumeRecentAllow(allowKey)) {
    return;
  }

  const domains = await getDomains();
  if (!domains.some((domain) => hostMatchesDomain(url.hostname, domain))) {
    return;
  }

  const interstitialUrl = chrome.runtime.getURL(
    `src/interstitial.html?target=${encodeURIComponent(url.href)}`
  );

  await chrome.tabs.update(details.tabId, { url: interstitialUrl });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "ALLOW_TARGET" || !message.targetUrl) {
    return false;
  }

  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") {
    sendResponse({ ok: false });
    return false;
  }

  const target = parseUrl(message.targetUrl);
  if (!target) {
    sendResponse({ ok: false });
    return false;
  }

  allowedNavigations.set(`${tabId}:${target.href}`, Date.now() + ALLOW_TTL_MS);
  chrome.tabs.update(tabId, { url: target.href });
  sendResponse({ ok: true });
  return false;
});

async function getDomains() {
  const { domains } = await chrome.storage.sync.get({ domains: DEFAULT_DOMAINS });
  return normalizeDomains(domains);
}

function normalizeDomains(domains) {
  if (!Array.isArray(domains)) {
    return DEFAULT_DOMAINS;
  }

  return [
    ...new Set(
      domains
        .map((domain) => String(domain).trim().toLowerCase())
        .map((domain) => domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
        .map((domain) => domain.replace(/^\*\./, ""))
        .filter(Boolean)
    )
  ];
}

function hostMatchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function consumeRecentAllow(key) {
  const expiresAt = allowedNavigations.get(key);
  if (!expiresAt) {
    return false;
  }

  if (expiresAt < Date.now()) {
    allowedNavigations.delete(key);
    return false;
  }

  allowedNavigations.delete(key);
  return true;
}
