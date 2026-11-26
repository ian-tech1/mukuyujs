import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { normalizeErrorReportPayload, type ErrorReportPayload } from "./error-report-policy";

const SERVER_REPORT_COOLDOWN = "15 minutes";

/** Store only a digest of allow-listed dimensions and an aggregate reporting-window count. */
export async function recordSchoolError(input: ErrorReportPayload) {
  try {
    const report = normalizeErrorReportPayload(input);
    const reportKey = createHash("sha256")
      .update(`${report.source}\u001f${report.page}\u001f${report.errorName}`)
      .digest("hex");
    const sql = await getSql();
    await sql`
      insert into school_error_reports (
        report_key, source, page, error_name, reporting_windows, first_seen, last_seen
      ) values (
        ${reportKey}, ${report.source}, ${report.page}, ${report.errorName}, 1, now(), now()
      )
      on conflict (report_key) do update set
        reporting_windows = school_error_reports.reporting_windows + 1,
        last_seen = now()
      where school_error_reports.last_seen < now() - ${SERVER_REPORT_COOLDOWN}::interval
    `;
  } catch {
    // Error reporting is best-effort and must never mask the original application result.
    console.error("[school-error-reporting] A normalized report could not be stored.");
  }
}
