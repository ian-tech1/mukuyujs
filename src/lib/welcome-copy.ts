export function splitWelcomeParagraphs(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[\t ]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function welcomeCopyColour(index: number, tick: number, enabled: boolean, fallback: string) {
  if (!enabled) return fallback;
  const hue = ((Math.trunc(index) + Math.trunc(tick) * 31) % 360 + 360) % 360;
  return `hsl(${hue}, 72%, 86%)`;
}
