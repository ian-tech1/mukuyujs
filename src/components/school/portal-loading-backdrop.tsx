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

export function PortalLoadingBackdrop({ className = "", openingOrbitals = false }: { className?: string; openingOrbitals?: boolean }) {
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
        <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-one" />
        <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-two" />
        <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-three" />
        <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-four" />
        <span className="portal-loading-object portal-loading-object-ring portal-loading-object-five" />
        <span className="portal-loading-object portal-loading-object-ring portal-loading-object-six" />
        <span className="portal-loading-object portal-loading-object-ring portal-loading-object-seven" />
        <span className="portal-loading-object portal-loading-object-ring portal-loading-object-eight" />
        <span className="portal-loading-object portal-loading-object-star portal-loading-object-nine" />
        <span className="portal-loading-object portal-loading-object-star portal-loading-object-ten" />
        <span className="portal-loading-object portal-loading-object-hex portal-loading-object-eleven" />
        <span className="portal-loading-object portal-loading-object-hex portal-loading-object-twelve" />
        <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-thirteen" />
        <span className="portal-loading-object portal-loading-object-ring portal-loading-object-fourteen" />
        <span className="portal-loading-object portal-loading-object-star portal-loading-object-fifteen" />
        <span className="portal-loading-object portal-loading-object-hex portal-loading-object-sixteen" />
        <span className="portal-loading-object portal-loading-object-diamond portal-loading-object-seventeen" />
        <span className="portal-loading-object portal-loading-object-ring portal-loading-object-eighteen" />
        <span className="portal-loading-object portal-loading-object-star portal-loading-object-nineteen" />
        <span className="portal-loading-object portal-loading-object-hex portal-loading-object-twenty" />
        {openingOrbitals ? OPENING_EXTRA_ORBITALS.map(({ name, shape }) => (
          <span key={name} className={`portal-loading-object portal-loading-object-${shape} portal-loading-object-${name} portal-loading-object-opening-extra`} />
        )) : null}
      </div>
    </div>
  );
}
