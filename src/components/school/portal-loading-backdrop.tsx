const PORTAL_ORBITALS = [
  { name: "one", shape: "diamond" },
  { name: "two", shape: "diamond" },
  { name: "three", shape: "diamond" },
  { name: "four", shape: "diamond" },
  { name: "five", shape: "ring" },
  { name: "six", shape: "ring" },
  { name: "seven", shape: "ring" },
  { name: "eight", shape: "ring" },
  { name: "nine", shape: "star" },
  { name: "ten", shape: "star" },
  { name: "eleven", shape: "hex" },
  { name: "twelve", shape: "hex" },
  { name: "thirteen", shape: "diamond" },
  { name: "fourteen", shape: "ring" },
  { name: "fifteen", shape: "star" },
  { name: "sixteen", shape: "hex" },
  { name: "seventeen", shape: "diamond" },
  { name: "eighteen", shape: "ring" },
  { name: "nineteen", shape: "star" },
  { name: "twenty", shape: "hex" },
] as const;

const COMPACT_ORBITAL_NAMES = new Set(["one", "five", "nine", "eleven", "fourteen", "fifteen"]);

const OPENING_EXTRA_ORBITALS = [
  { name: "twenty-one", shape: "diamond" },
  { name: "twenty-two", shape: "ring" },
  { name: "twenty-three", shape: "star" },
  { name: "twenty-four", shape: "hex" },
  { name: "twenty-five", shape: "diamond" },
  { name: "twenty-six", shape: "ring" },
  { name: "twenty-seven", shape: "star" },
  { name: "twenty-eight", shape: "hex" },
  { name: "twenty-nine", shape: "diamond" },
  { name: "thirty", shape: "ring" },
  { name: "thirty-one", shape: "star" },
  { name: "thirty-two", shape: "hex" },
] as const;

export function PortalLoadingBackdrop({
  className = "",
  openingOrbitals = false,
  objectDensity = "full",
}: {
  className?: string;
  openingOrbitals?: boolean;
  objectDensity?: "full" | "compact";
}) {
  const baseOrbitals = objectDensity === "compact"
    ? PORTAL_ORBITALS.filter(({ name }) => COMPACT_ORBITAL_NAMES.has(name))
    : PORTAL_ORBITALS;
  const orbitals = [
    ...baseOrbitals.map((orbital) => ({ ...orbital, openingExtra: false })),
    ...(openingOrbitals ? OPENING_EXTRA_ORBITALS.map((orbital) => ({ ...orbital, openingExtra: true })) : []),
  ];

  return (
    <div className={`portal-loading-backdrop ${className}`} aria-hidden="true">
      <div className="portal-loading-aurora" />
      <div className="portal-loading-ribbon-field">
        <span className="portal-loading-ribbon portal-loading-ribbon-one" />
        <span className="portal-loading-ribbon portal-loading-ribbon-two" />
        <span className="portal-loading-ribbon portal-loading-ribbon-three" />
        <span className="portal-loading-ribbon portal-loading-ribbon-four" />
        <span className="portal-loading-ribbon-orb portal-loading-ribbon-orb-one" />
        <span className="portal-loading-ribbon-orb portal-loading-ribbon-orb-two" />
      </div>
      <div className="portal-loading-rays" />
      <div className="portal-loading-atom" />
      <div className="portal-loading-orbit-glints" />
      <div className="portal-loading-stars" />
      <div className="portal-loading-dust" />
      <div className="portal-loading-motes">
        <span className="portal-loading-mote portal-loading-mote-one" />
        <span className="portal-loading-mote portal-loading-mote-two" />
        <span className="portal-loading-mote portal-loading-mote-three" />
        <span className="portal-loading-mote portal-loading-mote-four" />
        <span className="portal-loading-mote portal-loading-mote-five" />
        <span className="portal-loading-mote portal-loading-mote-six" />
      </div>
      <div className="portal-loading-comets">
        <span className="portal-loading-comet portal-loading-comet-one" />
        <span className="portal-loading-comet portal-loading-comet-two" />
        <span className="portal-loading-comet portal-loading-comet-three" />
      </div>
      <div className="portal-loading-orbiting-objects">
        {orbitals.map(({ name, shape, openingExtra }) => (
          <span
            key={name}
            className={`portal-loading-object portal-loading-object-${shape} portal-loading-object-${name}${openingExtra ? " portal-loading-object-opening-extra" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
