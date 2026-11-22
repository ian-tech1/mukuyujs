import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WELCOME_DISPLAY, hexToRgba, normalizeWelcomeDisplay } from "./welcome-display.ts";

test("the welcome designer exposes exactly 16 shared display and colour controls", () => {
  assert.equal(Object.keys(DEFAULT_WELCOME_DISPLAY).length, 16);
  assert.equal(DEFAULT_WELCOME_DISPLAY.contentAlignment, "left");
  assert.equal(DEFAULT_WELCOME_DISPLAY.showRibbons, true);
  assert.equal(DEFAULT_WELCOME_DISPLAY.animatedWordingPanels, true);
  assert.equal(DEFAULT_WELCOME_DISPLAY.dashboardPanelColorsEnabled, true);
  assert.equal(normalizeWelcomeDisplay({}).animatedWordingPanels, true, "legacy saved display settings keep wording panels enabled");
  assert.equal(normalizeWelcomeDisplay({}).dashboardPanelColorsEnabled, true, "legacy saved display settings keep dashboard panel colors enabled");
});

test("welcome display values are validated and bounded before saving or rendering", () => {
  const normalized = normalizeWelcomeDisplay({
    titleColor: "red",
    subtitleColor: "#123abc",
    panelOpacity: 3,
    gradientAngle: -90,
    contentAlignment: "center",
    contentWidth: "huge",
    titleLetterSpacing: 2,
    titleShadow: false,
    showRibbons: false,
    animatedWordingPanels: false,
    dashboardPanelColorsEnabled: false,
  });
  assert.equal(normalized.titleColor, DEFAULT_WELCOME_DISPLAY.titleColor);
  assert.equal(normalized.subtitleColor, "#123abc");
  assert.equal(normalized.panelOpacity, 1);
  assert.equal(normalized.gradientAngle, 0);
  assert.equal(normalized.contentAlignment, "center");
  assert.equal(normalized.contentWidth, "standard");
  assert.equal(normalized.titleLetterSpacing, 0.12);
  assert.equal(normalized.titleShadow, false);
  assert.equal(normalized.showRibbons, false);
  assert.equal(normalized.animatedWordingPanels, false);
  assert.equal(normalized.dashboardPanelColorsEnabled, false);
});

test("hex opacity helper clamps opacity and rejects unsafe colours", () => {
  assert.equal(hexToRgba("#123456", 0.25), "rgba(18, 52, 86, 0.25)");
  assert.equal(hexToRgba("not-a-colour", 2), "rgba(255, 252, 247, 1)");
});
