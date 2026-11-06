import iconos from "../assets/ui-icons.svg?no-inline";

function Icono({ nombre, className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`${iconos}#${nombre}`} />
    </svg>
  );
}

export default Icono;
