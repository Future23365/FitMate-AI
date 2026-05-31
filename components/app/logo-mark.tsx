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
      </defs>

      <rect fill={`url(#${backgroundGradientId})`} height="84" rx="24" width="84" x="6" y="6" />
      <path d="M22 24C33 16 62 15 75 28" stroke="#FFFFFF" strokeLinecap="round" strokeOpacity="0.18" strokeWidth="2.4" />

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

      <g transform="translate(15 31)">
        {animated ? (
          <animateTransform
            additive="sum"
            attributeName="transform"
            dur="1.8s"
            repeatCount="indefinite"
            type="translate"
            values="0 0;0 -2;0 0"
          />
        ) : null}
        <g transform="rotate(-14 33 17)">
          {animated ? (
            <animateTransform
              attributeName="transform"
              dur="1.8s"
              repeatCount="indefinite"
              type="rotate"
              values="-18 33 17;-9 33 17;-18 33 17"
            />
          ) : null}
          <path
            d="M3 9H13M3 18H13M53 9H63M53 18H63"
            stroke="#FFFFFF"
            strokeLinecap="round"
            strokeOpacity="0.3"
            strokeWidth="2.2"
          />
          <rect fill="#FFFFFF" fillOpacity="0.16" height="17" rx="7" width="64" x="1" y="8" />
          <rect fill="#FFFFFF" height="30" rx="6" width="9" x="0" y="2" />
          <rect fill="#FFFFFF" fillOpacity="0.88" height="24" rx="5" width="8" x="11" y="5" />
          <rect fill="#FFFFFF" height="9" rx="4.5" width="28" x="19" y="12.5" />
          <rect fill="#FFFFFF" fillOpacity="0.88" height="24" rx="5" width="8" x="47" y="5" />
          <rect fill="#FFFFFF" height="30" rx="6" width="9" x="57" y="2" />
          <path d="M27 14H39" stroke="#2459E6" strokeLinecap="round" strokeOpacity="0.8" strokeWidth="2.6" />
          <path d="M7 6H9M57 6H59" stroke="#DCE7FF" strokeLinecap="round" strokeOpacity="0.76" strokeWidth="2" />
        </g>
        <g stroke="#FFFFFF" strokeLinecap="round" strokeOpacity="0.42" strokeWidth="2">
          <path d="M8 42H22">
            {animated ? <animate attributeName="opacity" dur="1.8s" repeatCount="indefinite" values="0.15;0.55;0.15" /> : null}
          </path>
          <path d="M13 48H31">
            {animated ? <animate attributeName="opacity" dur="1.8s" repeatCount="indefinite" values="0.35;0.08;0.35" /> : null}
          </path>
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
      </g>

      <rect height="83" rx="23.5" stroke="#FFFFFF" strokeOpacity="0.3" width="83" x="6.5" y="6.5" />
    </svg>
  );
}
