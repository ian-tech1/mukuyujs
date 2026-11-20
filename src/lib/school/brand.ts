import { reportLink } from "@/lib/school/model";

export function liveReportLink(base: string, code: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return reportLink(base, code, origin);
}

export async function logoDataUrl(logoData: string) {
  if (logoData.startsWith("data:image")) return logoData;
  const response = await fetch("/logo.png");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
