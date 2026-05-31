import { useId } from "react";

type LogoMarkProps = {
  className?: string;
  animated?: boolean;
};

// FitMate 的品牌标识用 SVG 表达“FitMate 字母标识 + AI 轨道”，首页可开启轻量动效作为首屏视觉焦点。
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

      <g transform="translate(26 24)">
        {animated ? (
          <animateTransform
            attributeName="transform"
            dur="3.8s"
            repeatCount="indefinite"
            type="translate"
            values="26 24;26 22.8;26 24"
          />
        ) : null}
        <path
          d="M11 2H37C41.4 2 45 5.6 45 10C45 14.4 41.4 18 37 18H24V25H34C38.1 25 41.5 28.4 41.5 32.5C41.5 36.6 38.1 40 34 40H24V49C24 52.9 20.9 56 17 56C13.1 56 10 52.9 10 49V18H8C3.6 18 0 14.4 0 10C0 5.6 3.6 2 8 2H11Z"
          fill="#FFFFFF"
          opacity="0.18"
          transform="translate(3 3)"
        />
        <path
          d="M11 2H37C41.4 2 45 5.6 45 10C45 14.4 41.4 18 37 18H24V25H34C38.1 25 41.5 28.4 41.5 32.5C41.5 36.6 38.1 40 34 40H24V49C24 52.9 20.9 56 17 56C13.1 56 10 52.9 10 49V18H8C3.6 18 0 14.4 0 10C0 5.6 3.6 2 8 2H11Z"
          fill="#FFFFFF"
        />
        <path
          d="M24 18H37C41.4 18 45 14.4 45 10C45 5.6 41.4 2 37 2H24V18Z"
          fill="#DCE7FF"
        />
        <circle cx="17" cy="10" fill="#2459E6" r="3.5" />
        <circle cx="34" cy="32.5" fill="#2459E6" fillOpacity="0.88" r="3" />
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
