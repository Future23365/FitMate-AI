import { useId } from "react";

type LogoMarkProps = {
  className?: string;
  animated?: boolean;
};

// FitMate 的品牌标识使用主题蓝 app 外壳和 46 度倾斜哑铃，统一 Web 与 icon 入口的识别形态。
export function LogoMark({ className = "h-10 w-10", animated = false }: LogoMarkProps) {
  const rawId = useId().replace(/:/g, "");
  const shellGradientId = `fitmate-logo-shell-${rawId}`;
  const fieldGradientId = `fitmate-logo-field-${rawId}`;
  const primaryGradientId = `fitmate-logo-primary-${rawId}`;
  const plateGradientId = `fitmate-logo-plate-${rawId}`;
  const gripGradientId = `fitmate-logo-grip-${rawId}`;
  const shadowId = `fitmate-logo-shadow-${rawId}`;

  return (
    <svg
      aria-hidden="true"
      className={`${className} shrink-0 overflow-visible`}
      fill="none"
      role="img"
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
    >
      {animated ? (
        <style>
          {`
            .fitmate-dumbbell-pop {
              transform-box: view-box;
              transform-origin: 120px 120px;
              animation: fitmate-dumbbell-pop 620ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
            }

            @keyframes fitmate-dumbbell-pop {
              0% {
                opacity: 0;
                transform: scale(0.42);
              }
              58% {
                opacity: 1;
                transform: scale(1.06);
              }
              82% {
                transform: scale(0.98);
              }
              100% {
                opacity: 1;
                transform: scale(1);
              }
            }
          `}
        </style>
      ) : null}

      <defs>
        <linearGradient id={shellGradientId} x1="38" x2="202" y1="18" y2="222">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#F2F6FF" />
        </linearGradient>
        <linearGradient id={fieldGradientId} x1="58" x2="184" y1="52" y2="190">
          <stop stopColor="#F7FAFF" />
          <stop offset="1" stopColor="#E6ECFF" />
        </linearGradient>
        <linearGradient id={primaryGradientId} x1="70" x2="170" y1="92" y2="148">
          <stop stopColor="#2459E6" />
          <stop offset="1" stopColor="#163FAF" />
        </linearGradient>
        <linearGradient id={plateGradientId} x1="30" x2="210" y1="78" y2="162">
          <stop stopColor="#3F6FED" />
          <stop offset="0.5" stopColor="#2459E6" />
          <stop offset="1" stopColor="#163FAF" />
        </linearGradient>
        <linearGradient id={gripGradientId} x1="99" x2="141" y1="96" y2="144">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E6ECFF" />
        </linearGradient>
        <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="188" id={shadowId} width="188" x="26" y="26">
          <feDropShadow dx="0" dy="10" floodColor="#163FAF" floodOpacity="0.18" stdDeviation="8" />
        </filter>
      </defs>

      <rect fill={`url(#${shellGradientId})`} height="214" rx="58" width="214" x="13" y="13" />
      <rect height="211" rx="56.5" stroke="#C9D8F4" strokeWidth="2.5" width="211" x="14.5" y="14.5" />
      <rect fill={`url(#${fieldGradientId})`} height="156" rx="44" width="156" x="42" y="42" />
      <rect height="152" rx="42" stroke="#FFFFFF" strokeOpacity="0.86" strokeWidth="4" width="152" x="44" y="44" />

      <g className={animated ? "fitmate-dumbbell-pop" : undefined}>
        <g filter={`url(#${shadowId})`} transform="rotate(46 120 120)">
          {animated ? (
            <animateTransform
              additive="sum"
              attributeName="transform"
              dur="2.2s"
              repeatCount="indefinite"
              type="translate"
              values="0 0;0 -3;0 0"
            />
          ) : null}
          <rect fill={`url(#${primaryGradientId})`} height="30" rx="15" width="108" x="66" y="105" />
          <rect fill="#163FAF" height="56" rx="15" width="18" x="74" y="92" />
          <rect fill="#163FAF" height="56" rx="15" width="18" x="148" y="92" />
          <rect fill={`url(#${plateGradientId})`} height="78" rx="18" width="28" x="36" y="81" />
          <rect fill={`url(#${plateGradientId})`} height="66" rx="16" width="24" x="58" y="87" />
          <rect fill={`url(#${plateGradientId})`} height="66" rx="16" width="24" x="158" y="87" />
          <rect fill={`url(#${plateGradientId})`} height="78" rx="18" width="28" x="176" y="81" />
          <rect fill={`url(#${gripGradientId})`} height="46" rx="15" stroke="#B4C5FF" strokeWidth="3" width="42" x="99" y="97" />
          <path d="M109 107V133M120 104V136M131 107V133" stroke="#2459E6" strokeLinecap="round" strokeOpacity="0.48" strokeWidth="4" />
          <path d="M42 94H58M182 94H198" stroke="#FFFFFF" strokeLinecap="round" strokeOpacity="0.44" strokeWidth="5" />
          <path d="M42 146H58M182 146H198" stroke="#00174B" strokeLinecap="round" strokeOpacity="0.14" strokeWidth="5" />
        </g>
      </g>
    </svg>
  );
}
