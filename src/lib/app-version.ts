declare const __APP_BUILD_ID__: string;

export function getAppBuildId(): string {
  return typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "development";
}

export function isAppUpdateAvailable(currentBuildId: string, latestBuildId: string): boolean {
  return Boolean(currentBuildId && latestBuildId && currentBuildId !== latestBuildId);
}

export function createAppVersionResponse(buildId = getAppBuildId()): Response {
  return Response.json(
    { buildId },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        pragma: "no-cache",
        expires: "0",
      },
    },
  );
}
