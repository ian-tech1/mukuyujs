import { createMiddleware, createStart } from "@tanstack/react-start";
import { safeErrorName, shouldCaptureServerError } from "@/lib/school/error-report-policy";

const schoolErrorCapture = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (shouldCaptureServerError(error)) {
      try {
        const { recordSchoolError } = await import("@/lib/school/error-reporting.server");
        await recordSchoolError({
          source: "server_function",
          page: "other",
          errorName: safeErrorName(error),
        });
      } catch {
        console.error("[school-error-reporting] Server capture was unavailable.");
      }
    }
    throw error;
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [schoolErrorCapture],
}));
