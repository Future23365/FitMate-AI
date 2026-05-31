import { useId } from "react";

type LogoMarkProps = {
  className?: string;
  animated?: boolean;
};

// FitMate 的品牌标识用 SVG 表达“训练器械 + AI 能量”，首页可开启轻量动效作为首屏视觉焦点。
export function LogoMark({ className = "h-10 w-10", animated = false }: LogoMarkProps) {
  const rawId = useId().replace(/:/g, "");
  const backgroundGradientId = `fitmate-logo-bg-${rawId}`;
  const ringGradientId = `fitmate-logo-ring-${rawId}`;
  const glowGradientId = `fitmate-logo-glow-${rawId}`;
  const clipId = `fitmate-logo-clip-${rawId}`;

  return (
    <svg
      aria-hidden="true"
      className={`${className} shrink-0 overflow-visible`}
      fill="none"
      role="img"
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={backgroundGradientId} x1="18" x2="82" y1="10" y2="88">
          <stop stopColor="#5D8CFF" />
          <stop offset="0.52" stopColor="#2459E6" />
          <stop offset="1" stopColor="#153B9F" />
        </linearGradient>
        <linearGradient id={ringGradientId} x1="18" x2="78" y1="20" y2="76">
          <stop stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.54" stopColor="#BFD1FF" stopOpacity="0.66" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id={glowGradientId} cx="0" cy="0" gradientTransform="translate(36 28) rotate(48) scale(58)" gradientUnits="userSpaceOnUse" r="1">
          <stop stopColor="#FFFFFF" stopOpacity="0.82" />
          <stop offset="0.44" stopColor="#BFD1FF" stopOpacity="0.2" />
          <stop offset="1" stopColor="#2459E6" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <rect height="84" rx="24" width="84" x="6" y="6" />
        </clipPath>
      </defs>

      <rect fill={`url(#${backgroundGradientId})`} height="84" rx="24" width="84" x="6" y="6" />
      <g clipPath={`url(#${clipId})`}>
        <circle cx="35" cy="27" fill={`url(#${glowGradientId})`} r="54" />
        <path d="M14 77C30 61 50 70 84 48" stroke="#FFFFFF" strokeOpacity="0.1" strokeWidth="20" />
        <path d="M21 21C38 13 59 14 75 30" stroke="#FFFFFF" strokeLinecap="round" strokeOpacity="0.22" strokeWidth="2.5" />
      </g>

      <circle
        cx="48"
        cy="48"
        r="32"
        stroke={`url(#${ringGradientId})`}
        strokeDasharray="34 13 9 16"
        strokeLinecap="round"
        strokeWidth="3"
      >
        {animated ? (
          <animateTransform
            attributeName="transform"
            dur="11s"
            from="0 48 48"
            repeatCount="indefinite"
            to="360 48 48"
            type="rotate"
          />
        ) : null}
      </circle>

      <g>
        {animated ? (
          <animateTransform
            attributeName="transform"
            dur="3.4s"
            repeatCount="indefinite"
            type="translate"
            values="0 0;0 -1.2;0 0"
          />
        ) : null}
        <g transform="rotate(-18 48 48)">
          <line stroke="#FFFFFF" strokeLinecap="round" strokeWidth="6" x1="31" x2="65" y1="48" y2="48" />
          <rect fill="#FFFFFF" height="24" rx="4" width="7" x="20" y="36" />
          <rect fill="#FFFFFF" fillOpacity="0.82" height="18" rx="3" width="6" x="29" y="39" />
          <rect fill="#FFFFFF" fillOpacity="0.82" height="18" rx="3" width="6" x="61" y="39" />
          <rect fill="#FFFFFF" height="24" rx="4" width="7" x="69" y="36" />
        </g>
        <circle cx="31" cy="30" fill="#FFFFFF" fillOpacity="0.86" r="2.8">
          {animated ? (
            <animate attributeName="opacity" dur="2.7s" repeatCount="indefinite" values="0.55;1;0.55" />
          ) : null}
        </circle>
        <circle cx="66" cy="66" fill="#FFFFFF" fillOpacity="0.64" r="2.2" />
      </g>

      <g>
        <circle cx="48" cy="48" fill="#FFFFFF" fillOpacity="0.2" r="14" />
        <circle cx="48" cy="48" fill="#FFFFFF" r="5.5">
          {animated ? (
            <animate attributeName="r" dur="2.6s" repeatCount="indefinite" values="5.5;6.6;5.5" />
          ) : null}
        </circle>
        {animated ? (
          <animate attributeName="opacity" dur="2.6s" repeatCount="indefinite" values="0.82;1;0.82" />
        ) : null}
      </g>

      <rect height="83" rx="23.5" stroke="#FFFFFF" strokeOpacity="0.3" width="83" x="6.5" y="6.5" />
    </svg>
  );
}
