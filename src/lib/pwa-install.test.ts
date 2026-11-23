import assert from "node:assert/strict";
import { test } from "node:test";

test("captures the native install event and records an accepted install", async (t) => {
  const listeners = new Map<string, (event: Event) => void>();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      matchMedia: () => ({ matches: false }),
      addEventListener: (name: string, listener: (event: Event) => void) => listeners.set(name, listener),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { standalone: false },
  });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  });

  const { getPwaInstallState, initializePwaInstallCapture, requestPwaInstall, subscribePwaInstallState } = await import("./pwa-install.ts");
  initializePwaInstallCapture();
  assert.deepEqual(getPwaInstallState(), { available: false, installed: false });

  let latest = getPwaInstallState();
  const unsubscribe = subscribePwaInstallState((state) => { latest = state; });
  let prevented = false;
  let prompted = false;
  listeners.get("beforeinstallprompt")?.({
    preventDefault() { prevented = true; },
    prompt: async () => { prompted = true; },
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  } as unknown as Event);

  assert.equal(prevented, true);
  assert.deepEqual(latest, { available: true, installed: false });
  assert.equal(await requestPwaInstall(), "accepted");
  assert.equal(prompted, true);
  assert.deepEqual(latest, { available: false, installed: true });
  unsubscribe();
});
