export function SchoolLogo({ src, className = "size-16" }: { src?: string; className?: string }) {
  return (
    <img
      src={src || "/logo.png"}
      alt="Mukuyu Junior School"
      className={`rounded-full bg-white object-contain p-0.5 ${className}`}
    />
  );
}
