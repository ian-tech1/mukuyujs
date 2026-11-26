export const ERROR_REPORT_SOURCES = [
  "server_function",
  "window_error",
  "unhandled_rejection",
  "route_boundary",
] as const;

export const ERROR_REPORT_PAGES = ["opening", "portal", "other"] as const;

export const ERROR_REPORT_NAMES = [
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "ChunkLoadError",
  "NetworkError",
  "UnknownError",
] as const;

export type ErrorReportSource = (typeof ERROR_REPORT_SOURCES)[number];
export type ErrorReportPage = (typeof ERROR_REPORT_PAGES)[number];
export type ErrorReportName = (typeof ERROR_REPORT_NAMES)[number];

export type ErrorReportPayload = {
  source: ErrorReportSource;
  page: ErrorReportPage;
  errorName: ErrorReportName;
};

const sourceSet = new Set<string>(ERROR_REPORT_SOURCES);
const pageSet = new Set<string>(ERROR_REPORT_PAGES);
const errorNameSet = new Set<string>(ERROR_REPORT_NAMES);

export function safeErrorPage(pathname: string): ErrorReportPage {
  if (pathname === "" || pathname === "/") return "opening";
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return "portal";
  return "other";
}

export function safeErrorName(error: unknown): ErrorReportName {
  const candidate =
    error !== null && typeof error === "object" && "name" in error && typeof error.name === "string"
      ? error.name
      : "";
  return errorNameSet.has(candidate) ? (candidate as ErrorReportName) : "UnknownError";
}

/** Accept only the three bounded fields; messages, stacks and extra input are discarded. */
export function normalizeErrorReportPayload(input: unknown): ErrorReportPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid error-report payload.");
  }

  const value = input as Record<string, unknown>;
  if (
    typeof value.source !== "string" ||
    !sourceSet.has(value.source) ||
    typeof value.page !== "string" ||
    !pageSet.has(value.page) ||
    typeof value.errorName !== "string" ||
    !errorNameSet.has(value.errorName)
  ) {
    throw new Error("Invalid error-report category.");
  }

  return {
    source: value.source as ErrorReportSource,
    page: value.page as ErrorReportPage,
    errorName: value.errorName as ErrorReportName,
  };
}

const expectedInputError = /^(?:sign in required\.?$|please choose a new password\b|only\b|enter\b|choose\b|select\b|provide\b|upload\b|type\b|invalid (?:input|request|date|selection|email|phone|password|answer|score|time|format|role|permission|access|credentials)\b|not found\.?$|you do not have .*permission\b)/i;

/** Do not turn expected auth, validation or cancelled work into operational alerts. */
export function shouldCaptureServerError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  if (["AbortError", "ZodError", "ValidationError"].includes(error.name)) return false;
  return !expectedInputError.test(error.message.trim());
}
