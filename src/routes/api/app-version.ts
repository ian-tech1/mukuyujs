import { createFileRoute } from "@tanstack/react-router";
import { createAppVersionResponse } from "@/lib/app-version";

export const Route = createFileRoute("/api/app-version")({
  server: {
    handlers: {
      GET: () => createAppVersionResponse(),
    },
  },
});
