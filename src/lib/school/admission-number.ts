export type AdmissionNumberSettings = {
  prefix: string;
  includeYear: boolean;
  numberDigits: number;
};

export const DEFAULT_ADMISSION_NUMBER_SETTINGS: AdmissionNumberSettings = {
  prefix: "MKS",
  includeYear: true,
  numberDigits: 5,
};

export function normalizeAdmissionNumberSettings(value: unknown): AdmissionNumberSettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawPrefix = typeof source.prefix === "string" ? source.prefix.trim().toUpperCase() : "";
  const parsedDigits = Number(source.numberDigits);
  return {
    prefix: /^[A-Z0-9]{1,12}$/.test(rawPrefix) ? rawPrefix : DEFAULT_ADMISSION_NUMBER_SETTINGS.prefix,
    includeYear: typeof source.includeYear === "boolean" ? source.includeYear : DEFAULT_ADMISSION_NUMBER_SETTINGS.includeYear,
    numberDigits: Number.isInteger(parsedDigits) && parsedDigits >= 4 && parsedDigits <= 8
      ? parsedDigits
      : DEFAULT_ADMISSION_NUMBER_SETTINGS.numberDigits,
  };
}

export function validateAdmissionNumberSettings(value: unknown): AdmissionNumberSettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawPrefix = typeof source.prefix === "string" ? source.prefix.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{1,12}$/.test(rawPrefix)) {
    throw new Error("Use a prefix of 1–12 letters or numbers, with no spaces or punctuation.");
  }
  if (typeof source.includeYear !== "boolean") {
    throw new Error("Choose whether admission numbers should include the year.");
  }
  const numberDigits = Number(source.numberDigits);
  if (!Number.isInteger(numberDigits) || numberDigits < 4 || numberDigits > 8) {
    throw new Error("The number section must be between 4 and 8 digits.");
  }
  return { prefix: rawPrefix, includeYear: source.includeYear, numberDigits };
}

export function formatAdmissionNumberExample(
  settings: AdmissionNumberSettings,
  year = new Date().getFullYear(),
  number = 42,
): string {
  const safe = normalizeAdmissionNumberSettings(settings);
  const parts = [safe.prefix];
  if (safe.includeYear) parts.push(String(year));
  parts.push(String(Math.abs(Math.trunc(number)) % (10 ** safe.numberDigits)).padStart(safe.numberDigits, "0"));
  return parts.join("-");
}
