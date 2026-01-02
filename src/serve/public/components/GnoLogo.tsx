interface GnoLogoProps {
  className?: string;
}

export function GnoLogo({ className = "size-8" }: GnoLogoProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="14"
        cy="14"
        fill="none"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M21.5 21.5L28 28"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <circle
        className="text-primary"
        cx="14"
        cy="14"
        fill="none"
        opacity="0.6"
        r="5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        className="text-primary"
        d="M11 14h6M14 11v6"
        opacity="0.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
