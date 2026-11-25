import { getWelcomePage } from "@/lib/school/api";

let welcomePageRequest: ReturnType<typeof getWelcomePage> | null = null;

/** Share simultaneous root/login/portal appearance reads without keeping stale settings. */
export function getWelcomePageRequest() {
  if (welcomePageRequest) return welcomePageRequest;

  const request = getWelcomePage();
  welcomePageRequest = request;
  void request.then(
    () => {
      if (welcomePageRequest === request) welcomePageRequest = null;
    },
    () => {
      if (welcomePageRequest === request) welcomePageRequest = null;
    },
  );
  return request;
}
