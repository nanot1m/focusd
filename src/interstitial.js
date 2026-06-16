const REFLECTION_PHRASES = [
  "Still want this?",
  "Is this intentional?",
  "What are you avoiding?",
  "Choose with care.",
  "Worth it right now?",
  "Come back to focus."
];

const params = new URLSearchParams(location.search);
const targetUrl = params.get("target");
const target = document.querySelector("#target");
const count = document.querySelector("#count");
const headline = document.querySelector("#headline");
const reflection = document.querySelector("#reflection");
const prompt = document.querySelector(".prompt");
const countdown = document.querySelector(".countdown");
const waterCanvas = document.querySelector("#water");
const continueButton = document.querySelector("#continue");
const cancelButton = document.querySelector("#cancel");

if (!targetUrl) {
  target.textContent = "Missing target URL.";
  continueButton.remove();
} else {
  target.textContent = formatTarget(targetUrl);
  startCountdown();
  startHeadlineSwap();
  startWater();
}

continueButton.addEventListener("click", () => {
  if (globalThis.chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "ALLOW_TARGET", targetUrl });
  }
});

cancelButton.addEventListener("click", () => {
  if (!globalThis.chrome?.tabs?.getCurrent) {
    history.back();
    return;
  }

  chrome.tabs.getCurrent((tab) => {
    if (typeof tab?.id === "number") {
      chrome.tabs.remove(tab.id);
    } else {
      history.back();
    }
  });
});

function startCountdown() {
  let remaining = 3;
  count.textContent = "";

  const timer = setInterval(() => {
    remaining -= 1;

    if (remaining <= 0) {
      clearInterval(timer);
      revealActions();
    }
  }, 1000);
}

function startHeadlineSwap() {
  reflection.textContent = randomPhrase(REFLECTION_PHRASES);

  setTimeout(() => {
    headline.classList.add("is-swapped");
  }, 3000);
}

function randomPhrase(phrases) {
  return phrases[Math.floor(Math.random() * phrases.length)];
}

async function startWater() {
  try {
    const isWebGpu = await globalThis.focusdWater?.start(waterCanvas, {
      duration: 3000
    });

    if (isWebGpu) {
      countdown.classList.add("has-webgpu");
    }
  } catch {
    countdown.classList.remove("has-webgpu");
  }
}

function revealActions() {
  countdown.dataset.state = "ready";
  count.textContent = "Open";
  count.classList.add("is-open");
  prompt.classList.remove("is-waiting");
  prompt.classList.add("is-ready");
  continueButton.disabled = false;
  continueButton.setAttribute("aria-label", "Open page");
  continueButton.focus();
}

function formatTarget(value) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
