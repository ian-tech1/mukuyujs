import assert from "node:assert/strict";
import test from "node:test";
import { splitWelcomeParagraphs, welcomeCopyColour } from "./welcome-copy.ts";

test("splitWelcomeParagraphs normalizes Windows newlines and preserves line breaks within paragraphs", () => {
  assert.deepEqual(
    splitWelcomeParagraphs("First line\r\nsecond line\r\n\r\nThird paragraph\n\nFourth paragraph"),
    ["First line\nsecond line", "Third paragraph", "Fourth paragraph"],
  );
});

test("welcome lines receive distinct colours and advance together on each tick", () => {
  const firstTick = [40, 87, 134].map((index) => welcomeCopyColour(index, 0, true, "#fff"));
  const nextTick = [40, 87, 134].map((index) => welcomeCopyColour(index, 1, true, "#fff"));

  assert.equal(new Set(firstTick).size, firstTick.length);
  assert.equal(new Set(nextTick).size, nextTick.length);
  assert.deepEqual(firstTick, ["hsl(40, 72%, 86%)", "hsl(87, 72%, 86%)", "hsl(134, 72%, 86%)"]);
  assert.deepEqual(nextTick, ["hsl(71, 72%, 86%)", "hsl(118, 72%, 86%)", "hsl(165, 72%, 86%)"]);
});

test("welcome colour selection wraps hue values and uses the saved body colour when cycling is disabled", () => {
  assert.equal(welcomeCopyColour(350, 1, true, "#fff"), "hsl(21, 72%, 86%)");
  assert.equal(welcomeCopyColour(3, 2, false, "#e5e7eb"), "#e5e7eb");
});
