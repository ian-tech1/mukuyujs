import { useEffect, useRef, useState } from "react";
import { SchoolLogo } from "@/components/school/logo";
import { PortalLoadingBackdrop } from "@/components/school/portal-loading-backdrop";

const DOWNLOAD_LABEL = /\b(download|export)\b/i;

export function DownloadActivityOverlay() {
  const [label, setLabel] = useState("");
  const labelRef = useRef("");

  useEffect(() => {
    let dismissTimer = 0;
    let safetyTimer = 0;
    const dismiss = () => {
      window.clearTimeout(dismissTimer);
      window.clearTimeout(safetyTimer);
      labelRef.current = "";
      setLabel("");
    };

    const start = (nextLabel: string) => {
      window.clearTimeout(dismissTimer);
      window.clearTimeout(safetyTimer);
      labelRef.current = nextLabel.trim() || "Preparing your download";
      setLabel(labelRef.current);
      safetyTimer = window.setTimeout(dismiss, 12000);
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const downloadLink = target.closest<HTMLAnchorElement>("a[download], a[href]");
      if (downloadLink) {
        const linkLabel = downloadLink.getAttribute("aria-label") || downloadLink.textContent || "";
        if (!downloadLink.hasAttribute("download") && !DOWNLOAD_LABEL.test(linkLabel)) return;
        if (!labelRef.current) start(linkLabel || "Preparing your download");
        window.clearTimeout(safetyTimer);
        dismissTimer = window.setTimeout(dismiss, 900);
        return;
      }

      const button = target.closest<HTMLButtonElement>("button");
      if (!button || button.disabled) return;
      const buttonLabel = button.getAttribute("aria-label") || button.textContent || "";
      if (!DOWNLOAD_LABEL.test(buttonLabel)) return;
      start(`Preparing ${buttonLabel.trim().replace(/\s+/g, " ")}`);
    };
    const onDownloadReady = () => {
      if (labelRef.current) {
        window.clearTimeout(dismissTimer);
        dismissTimer = window.setTimeout(dismiss, 500);
      }
    };

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("mukuyu-download-ready", onDownloadReady);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("mukuyu-download-ready", onDownloadReady);
      window.clearTimeout(dismissTimer);
      window.clearTimeout(safetyTimer);
    };
  }, []);

  if (!label) return null;

  return (
    <div className="portal-loading pointer-events-none fixed inset-0 z-[200] grid min-h-[100svh] w-full place-items-center overflow-hidden px-6" role="status" aria-live="polite" aria-label="Preparing download">
      <PortalLoadingBackdrop objectDensity="compact" />
      <div className="portal-loading-center-shade" aria-hidden="true" />
      <div className="portal-loading-card text-center">
        <p className="portal-loading-monogram" aria-hidden="true"><span>MKJ</span></p>
        <p className="portal-loading-kicker">MUKUYU JUNIOR SCHOOL · LEARNING PORTAL</p>
        <span className="portal-loading-orbit" aria-hidden="true"><SchoolLogo className="size-20" /></span>
        <h2 className="portal-loading-title mt-5">Preparing your download</h2>
        <p className="portal-loading-tagline mt-2">{label}</p>
        <p className="portal-loading-message mt-4 text-sm">Your file is being prepared. The download will start shortly.</p>
        <div className="portal-loading-track mt-6" aria-hidden="true"><span className="download-activity-progress" /></div>
        <p className="portal-loading-footnote mt-4 justify-center">MUKUYU JUNIOR SCHOOL · LEARN WITH PURPOSE</p>
      </div>
    </div>
  );
}
