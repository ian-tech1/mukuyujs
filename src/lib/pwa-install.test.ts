import assert from "node:assert/strict";
import { test } from "node:test";

test("captures the native install event and records an accepted install", async (t) => {
  const listeners = new Map<string, (event: Event) => void>();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let prevented = false;
  let prompted = false;
  const earlyEvent = {
    preventDefault() { prevented = true; },
    prompt: async () => { prompted = true; },
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  } as unknown as Event;
  earlyEvent.preventDefault();
  const testNavigator: { standalone: boolean; install?: () => Promise<void> } = { standalone: false };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __mukuyuBeforeInstallPrompt: earlyEvent,
      matchMedia: () => ({ matches: false }),
      addEventListener: (name: string, listener: (event: Event) => void) => listeners.set(name, listener),
    },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: testNavigator,
  });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  });

  const { getPwaInstallState, initializePwaInstallCapture, isStandalonePwa, requestPwaInstall, subscribePwaInstallState } = await import("./pwa-install.ts");
  let latest = getPwaInstallState();
  const unsubscribe = subscribePwaInstallState((state) => { latest = state; });
  assert.equal(isStandalonePwa(), false);
  initializePwaInstallCapture();
  assert.deepEqual(getPwaInstallState(), { available: true, installed: false });
  assert.deepEqual(latest, { available: true, installed: false });
  assert.equal(prevented, true);
  assert.equal(await requestPwaInstall(), "accepted");
  assert.equal(prompted, true);
  assert.deepEqual(latest, { available: false, installed: true });

  let nativeInstallCalled = false;
  testNavigator.install = async () => { nativeInstallCalled = true; };
  assert.deepEqual(getPwaInstallState(), { available: true, installed: true });
  assert.equal(await requestPwaInstall(), "accepted");
  assert.equal(nativeInstallCalled, true);
  unsubscribe();
});
