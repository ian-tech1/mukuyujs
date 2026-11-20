import type { ReactNode } from "react";
import type { Workspace } from "@/lib/school/model";

export type Gate = {
  ws: Workspace;
  refresh: () => Promise<void>;
  flash: (message: string, bad?: boolean) => void;
  onWelcomeChange?: (settings: { enabled: boolean; url: string }) => void;
};

export function errText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-md border border-line bg-card px-3 text-sm text-ink outline-none focus:border-info";

export const btnClass =
  "inline-flex h-11 items-center justify-center rounded-md bg-navy px-4 text-sm font-semibold text-paper disabled:opacity-50";

export const btnGhost =
  "inline-flex h-11 items-center justify-center rounded-md border border-line bg-card px-4 text-sm font-semibold text-ink";
