import { createServerFn } from "@tanstack/react-start";
import {
  normalizeErrorReportPayload,
  safeErrorName,
  safeErrorPage,
  type ErrorReportSource,
} from "./error-report-policy";

const CLIENT_REPORT_COOLDOWN_MS = 15 * 60 * 1000;

export const storeClientRuntimeError = createServerFn({ method: "POST" })
  .validator((input: unknown) => normalizeErrorReportPayload(input))
  .handler(async ({ data }) => {
    const { recordSchoolError } = await import("./error-reporting.server");
    await recordSchoolError(data);
    return { ok: true as const };
  });

/** Best-effort browser reporting. No message, stack, full URL, account or browser identity is sent. */
export function reportDetectedError(source: ErrorReportSource, error: unknown) {
  if (typeof window === "undefined") return;

  const data = {
    source,
    page: safeErrorPage(window.location.pathname),
    errorName: safeErrorName(error),
  } as const;
  const throttleKey = `mukuyu-error-report:${data.source}:${data.page}:${data.errorName}`;
  const now = Date.now();

  try {
    const previous = Number(window.sessionStorage.getItem(throttleKey) || 0);
    if (Number.isFinite(previous) && previous > 0 && now - previous < CLIENT_REPORT_COOLDOWN_MS) return;
    window.sessionStorage.setItem(throttleKey, String(now));
  } catch {
    // Storage can be disabled in private browsing. Server-side deduplication remains active.
  }

  void storeClientRuntimeError({ data }).catch(() => undefined);
}
