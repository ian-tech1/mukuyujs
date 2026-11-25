const downloadButtonBase =
  "inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-semibold text-white shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const btnDownload = {
  emerald: `${downloadButtonBase} border-emerald-800 bg-emerald-700 hover:bg-emerald-800 focus-visible:outline-emerald-700`,
  blue: `${downloadButtonBase} border-blue-800 bg-blue-700 hover:bg-blue-800 focus-visible:outline-blue-700`,
  rose: `${downloadButtonBase} border-rose-800 bg-rose-700 hover:bg-rose-800 focus-visible:outline-rose-700`,
  violet: `${downloadButtonBase} border-violet-800 bg-violet-700 hover:bg-violet-800 focus-visible:outline-violet-700`,
  cyan: `${downloadButtonBase} border-cyan-800 bg-cyan-700 hover:bg-cyan-800 focus-visible:outline-cyan-700`,
  amber: `${downloadButtonBase} border-amber-800 bg-amber-700 hover:bg-amber-800 focus-visible:outline-amber-700`,
} as const;
