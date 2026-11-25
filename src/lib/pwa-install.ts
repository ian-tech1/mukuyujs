export type PwaInstallState = {
  available: boolean;
  installed: boolean;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let promptEvent: InstallPromptEvent | null = null;
let installed = false;
let captureInitialized = false;
const subscribers = new Set<(state: PwaInstallState) => void>();

function currentState(): PwaInstallState {
  return { available: promptEvent !== null, installed };
}

function notifySubscribers() {
  const state = currentState();
  subscribers.forEach((subscriber) => subscriber(state));
}

export function isStandalonePwa() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

/** Start at the app root so Chrome's one-shot event is captured before sign-in. */
export function initializePwaInstallCapture() {
  if (typeof window === "undefined" || captureInitialized) return;
  captureInitialized = true;
  installed = isStandalonePwa();

  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    promptEvent = event as InstallPromptEvent;
    notifySubscribers();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    promptEvent = null;
    notifySubscribers();
  });
  notifySubscribers();
}

export function getPwaInstallState(): PwaInstallState {
  return typeof window === "undefined" ? { available: false, installed: false } : currentState();
}

export function subscribePwaInstallState(subscriber: (state: PwaInstallState) => void) {
  subscribers.add(subscriber);
  subscriber(getPwaInstallState());
  return () => {
    subscribers.delete(subscriber);
  };
}

export async function requestPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const pending = promptEvent;
  if (!pending) return "unavailable";
  promptEvent = null;
  notifySubscribers();
  await pending.prompt();
  const choice = await pending.userChoice;
  if (choice.outcome === "accepted") installed = true;
  notifySubscribers();
  return choice.outcome;
}
