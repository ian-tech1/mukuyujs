export function Seal({ className = "size-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <circle cx="40" cy="40" r="38" fill="#0e2a4a" />
      <circle cx="40" cy="40" r="33" fill="none" stroke="#f3e6c4" strokeWidth="1.4" />
      <circle cx="40" cy="40" r="30" fill="none" stroke="#9a7430" strokeWidth="0.6" />
      <path d="M18 46c6-2 10-8 14-8h16c4 0 8 6 14 8" fill="none" stroke="#f3e6c4" strokeWidth="1.2" />
      <path d="M24 44 V34 h10 c4 0 6 3 6 6 v4 H24z M40 44 V34 h10 c4 0 6 3 6 6 v4 H40z" fill="#f3e6c4" />
      <path d="M40 34 v12" stroke="#0e2a4a" strokeWidth="1" />
      <path d="M16 28c8 6 14 8 24 8s16-2 24-8" fill="none" stroke="#d4b15a" strokeWidth="1" />
      <text x="40" y="62" textAnchor="middle" fill="#f3e6c4" fontSize="7" fontFamily="Georgia, serif">
        MUKUYU
      </text>
    </svg>
  );
}
