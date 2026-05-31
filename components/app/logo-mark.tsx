import { useId } from "react";

type LogoMarkProps = {
  className?: string;
  animated?: boolean;
};

// FitMate 的品牌标识用 SVG 表达“品牌化哑铃 + AI 轨道”，首页可开启轻量动效作为首屏视觉焦点。
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

      <g transform="translate(16 32)">
        {animated ? (
          <animateTransform
            attributeName="transform"
            dur="3.8s"
            repeatCount="indefinite"
            type="translate"
            values="16 32;16 30.8;16 32"
          />
        ) : null}
        <g transform="rotate(-8 32 16)">
          <rect fill="#FFFFFF" fillOpacity="0.2" height="20" rx="6" transform="translate(3 4)" width="58" x="3" y="5" />
          <rect fill="#FFFFFF" height="28" rx="6" width="9" x="0" y="2" />
          <rect fill="#FFFFFF" fillOpacity="0.86" height="22" rx="5" width="8" x="11" y="5" />
          <rect fill="#FFFFFF" fillOpacity="0.96" height="8" rx="4" width="28" x="18" y="12" />
          <rect fill="#DCE7FF" height="14" rx="5" width="14" x="25" y="9" />
          <rect fill="#FFFFFF" fillOpacity="0.86" height="22" rx="5" width="8" x="45" y="5" />
          <rect fill="#FFFFFF" height="28" rx="6" width="9" x="55" y="2" />
          <path d="M27 12.5H37" stroke="#2459E6" strokeLinecap="round" strokeOpacity="0.72" strokeWidth="2.4" />
          <path d="M4 8H7M57 8H60" stroke="#DCE7FF" strokeLinecap="round" strokeOpacity="0.7" strokeWidth="2" />
        </g>
      </g>

      <g>
        {animated ? (
          <circle cx="0" cy="0" fill="#FFFFFF" r="3.2">
            <animateMotion
              dur="5.8s"
              path="M48 16A32 32 0 1 1 48 80A32 32 0 1 1 48 16"
              repeatCount="indefinite"
            />
          </circle>
        ) : (
          <circle cx="48" cy="16" fill="#FFFFFF" r="3.2" />
        )}
        <circle cx="68" cy="28" fill="#FFFFFF" fillOpacity="0.5" r="2" />
        <circle cx="27" cy="70" fill="#FFFFFF" fillOpacity="0.38" r="2.4" />
      </g>

      <rect height="83" rx="23.5" stroke="#FFFFFF" strokeOpacity="0.3" width="83" x="6.5" y="6.5" />
    </svg>
  );
}
