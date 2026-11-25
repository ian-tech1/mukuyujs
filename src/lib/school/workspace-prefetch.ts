import type { Workspace } from "@/lib/school/model";

const MAX_AGE_MS = 30_000;
let prefetchedWorkspace: { value: Workspace; savedAt: number } | null = null;

/** Keep the authenticated login preflight result briefly for the portal's first render. */
export function savePortalWorkspacePrefetch(workspace: Workspace) {
  prefetchedWorkspace = { value: workspace, savedAt: Date.now() };
}

/** Consume the handoff once; workspace data is never persisted to browser storage. */
export function takePortalWorkspacePrefetch(): Workspace | null {
  const cached = prefetchedWorkspace;
  prefetchedWorkspace = null;
  return cached && Date.now() - cached.savedAt <= MAX_AGE_MS ? cached.value : null;
}
