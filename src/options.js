const DEFAULT_DOMAINS = ["x.com", "instagram.com"];
const form = document.querySelector("#form");
const textarea = document.querySelector("#domains");
const resetButton = document.querySelector("#reset");
const status = document.querySelector("#status");

loadDomains();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveDomains(parseTextarea());
  showStatus("Your pause list is saved.");
});

resetButton.addEventListener("click", async () => {
  textarea.value = DEFAULT_DOMAINS.join("\n");
  await saveDomains(DEFAULT_DOMAINS);
  showStatus("Default pause list restored.");
});

async function loadDomains() {
  const { domains } = await storageGet({ domains: DEFAULT_DOMAINS });
  textarea.value = normalizeDomains(domains).join("\n");
}

async function saveDomains(domains) {
  await storageSet({ domains: normalizeDomains(domains) });
}

function parseTextarea() {
  return textarea.value.split(/\r?\n/);
}

function normalizeDomains(domains) {
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

function showStatus(message) {
  status.textContent = message;
  setTimeout(() => {
    status.textContent = "";
  }, 1600);
}

async function storageGet(defaults) {
  if (globalThis.chrome?.storage?.sync?.get) {
    return chrome.storage.sync.get(defaults);
  }

  return defaults;
}

async function storageSet(values) {
  if (globalThis.chrome?.storage?.sync?.set) {
    await chrome.storage.sync.set(values);
  }
}
