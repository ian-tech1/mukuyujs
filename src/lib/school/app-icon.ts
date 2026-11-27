export const MAX_SCHOOL_APP_ICON_BYTES = 250_000;
export const SCHOOL_APP_ICON_DATA_URL_PREFIX = "data:image/png;base64,";

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const REQUIRED_ICON_EDGE = 512;

function readUint32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

/** Decode and validate the PNG signature and 512×512 IHDR dimensions. */
export function decodeSchoolAppIconDataUrl(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length > 350_000 || !value.startsWith(SCHOOL_APP_ICON_DATA_URL_PREFIX)) return null;
  const encoded = value.slice(SCHOOL_APP_ICON_DATA_URL_PREFIX.length);
  if (!BASE64_PATTERN.test(encoded)) return null;

  try {
    const binary = atob(encoded);
    if (binary.length < 24 || binary.length > MAX_SCHOOL_APP_ICON_BYTES) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

    if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null;
    if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
    if (readUint32(bytes, 16) !== REQUIRED_ICON_EDGE || readUint32(bytes, 20) !== REQUIRED_ICON_EDGE) return null;
    return bytes;
  } catch {
    return null;
  }
}

export function isValidSchoolAppIconDataUrl(value: unknown): value is string {
  return typeof value === "string" && (value === "" || decodeSchoolAppIconDataUrl(value) !== null);
}
