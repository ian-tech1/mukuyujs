export type PwaInstallState = {
  available: boolean;
  installed: boolean;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type WindowWithInstallPrompt = Window & {
  __mukuyuBeforeInstallPrompt?: InstallPromptEvent | null;
};

type NavigatorWithInstall = Navigator & {
  install?: () => Promise<unknown>;
};

let promptEvent: InstallPromptEvent | null = null;
let installed = false;
let captureInitialized = false;
const subscribers = new Set<(state: PwaInstallState) => void>();

function currentState(): PwaInstallState {
  return { available: promptEvent !== null || supportsNativeInstall(), installed };
}

function supportsNativeInstall() {
  return typeof navigator !== "undefined" &&
    typeof (navigator as NavigatorWithInstall).install === "function";
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
  const installWindow = window as WindowWithInstallPrompt;
  if (installWindow.__mukuyuBeforeInstallPrompt) {
    promptEvent = installWindow.__mukuyuBeforeInstallPrompt;
    installWindow.__mukuyuBeforeInstallPrompt = null;
  }

  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    promptEvent = event as InstallPromptEvent;
    installWindow.__mukuyuBeforeInstallPrompt = promptEvent;
    notifySubscribers();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    promptEvent = null;
    installWindow.__mukuyuBeforeInstallPrompt = null;
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
  if (pending) {
    promptEvent = null;
    if (typeof window !== "undefined") {
      (window as WindowWithInstallPrompt).__mukuyuBeforeInstallPrompt = null;
    }
    notifySubscribers();
    await pending.prompt();
    const choice = await pending.userChoice;
    if (choice.outcome === "accepted") installed = true;
    notifySubscribers();
    return choice.outcome;
  }

  if (!supportsNativeInstall()) return "unavailable";
  const install = (navigator as NavigatorWithInstall).install;
  if (typeof install !== "function") return "unavailable";
  try {
    await install.call(navigator);
    installed = true;
    notifySubscribers();
    return "accepted";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "dismissed";
    throw error;
  }
}
