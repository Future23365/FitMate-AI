import { useId } from "react";

type LogoMarkProps = {
  className?: string;
  animated?: boolean;
};

// FitMate 的品牌标识以精致哑铃为核心，兼顾小尺寸头像和应用图标的辨识度。
export function LogoMark({ className = "h-10 w-10", animated = false }: LogoMarkProps) {
  const rawId = useId().replace(/:/g, "");
  const shellGradientId = `fitmate-shell-${rawId}`;
  const badgeGradientId = `fitmate-badge-${rawId}`;
  const rimGradientId = `fitmate-rim-${rawId}`;
  const dumbbellGradientId = `fitmate-dumbbell-${rawId}`;
  const highlightGradientId = `fitmate-highlight-${rawId}`;

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
              transform-origin: 122px 120px;
              animation: fitmate-dumbbell-pop 680ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
            }

            @keyframes fitmate-dumbbell-pop {
              0% {
                opacity: 0;
                transform: scale(0.12);
              }
              54% {
                opacity: 1;
                transform: scale(1.08);
              }
              78% {
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
        <linearGradient id={shellGradientId} x1="48" x2="192" y1="18" y2="224">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#F2F6FF" />
        </linearGradient>
        <linearGradient id={badgeGradientId} x1="66" x2="178" y1="48" y2="194">
          <stop stopColor="#19D3F4" />
          <stop offset="0.48" stopColor="#2459E6" />
          <stop offset="1" stopColor="#102A83" />
        </linearGradient>
        <linearGradient id={rimGradientId} x1="48" x2="196" y1="55" y2="185">
          <stop stopColor="#E7F7FF" stopOpacity="0.94" />
          <stop offset="0.5" stopColor="#9DBAFF" stopOpacity="0.44" />
          <stop offset="1" stopColor="#0C2B87" stopOpacity="0.58" />
        </linearGradient>
        <linearGradient id={dumbbellGradientId} x1="66" x2="176" y1="80" y2="152">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.58" stopColor="#F3F8FF" />
          <stop offset="1" stopColor="#D7E7FF" />
        </linearGradient>
        <radialGradient
          cx="0"
          cy="0"
          gradientTransform="translate(82 64) rotate(50) scale(118)"
          gradientUnits="userSpaceOnUse"
          id={highlightGradientId}
          r="1"
        >
          <stop stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="72" id={`fitmate-soft-shadow-${rawId}`} width="146" x="47" y="111">
          <feDropShadow dx="0" dy="12" floodColor="#071C63" floodOpacity="0.22" stdDeviation="8" />
        </filter>
      </defs>

      <rect fill={`url(#${shellGradientId})`} height="214" rx="58" width="214" x="13" y="13" />
      <rect height="211" rx="56.5" stroke="#C9D8F4" strokeWidth="2.5" width="211" x="14.5" y="14.5" />
      <path
        d="M120 36C153.5 36 184.5 51.5 199.5 79.5C214.5 107.5 210 143 188.5 169.5C167.5 195.5 134.5 205 103 196.5C72 188 47.5 162.5 40.5 130C33.5 97 45.5 64 71.5 47.5C85.5 39 101.5 36 120 36Z"
        fill={`url(#${badgeGradientId})`}
      />
      <path
        d="M120 36C153.5 36 184.5 51.5 199.5 79.5C214.5 107.5 210 143 188.5 169.5C167.5 195.5 134.5 205 103 196.5C72 188 47.5 162.5 40.5 130C33.5 97 45.5 64 71.5 47.5C85.5 39 101.5 36 120 36Z"
        stroke={`url(#${rimGradientId})`}
        strokeWidth="5"
      />
      <path
        d="M59 75C79 54 118 47 151 56C173 62 189 76 198 94"
        stroke={`url(#${highlightGradientId})`}
        strokeLinecap="round"
        strokeWidth="29"
      />
      <path d="M74 166C101 181 145 181 171 161" stroke="#061C62" strokeLinecap="round" strokeOpacity="0.13" strokeWidth="18" />

      <g className={animated ? "fitmate-dumbbell-pop" : undefined}>
        <g filter={`url(#fitmate-soft-shadow-${rawId})`} transform="rotate(-14 120 120)">
          {animated ? (
            <animateTransform
              additive="sum"
              attributeName="transform"
              dur="2.4s"
              repeatCount="indefinite"
              type="translate"
              values="0 0;0 -4;0 0"
            />
          ) : null}
          <path
            d="M55 87C55 81.5 59.5 77 65 77H76C81.5 77 86 81.5 86 87V153C86 158.5 81.5 163 76 163H65C59.5 163 55 158.5 55 153V87Z"
            fill={`url(#${dumbbellGradientId})`}
          />
          <path
            d="M87 94C87 88.5 91.5 84 97 84H104C109.5 84 114 88.5 114 94V146C114 151.5 109.5 156 104 156H97C91.5 156 87 151.5 87 146V94Z"
            fill="#E8F2FF"
          />
          <rect fill={`url(#${dumbbellGradientId})`} height="22" rx="11" width="48" x="96" y="109" />
          <path d="M104 120H136" stroke="#7EA4FF" strokeLinecap="round" strokeOpacity="0.42" strokeWidth="4" />
          <path
            d="M126 94C126 88.5 130.5 84 136 84H143C148.5 84 153 88.5 153 94V146C153 151.5 148.5 156 143 156H136C130.5 156 126 151.5 126 146V94Z"
            fill="#E8F2FF"
          />
          <path
            d="M154 87C154 81.5 158.5 77 164 77H175C180.5 77 185 81.5 185 87V153C185 158.5 180.5 163 175 163H164C158.5 163 154 158.5 154 153V87Z"
            fill={`url(#${dumbbellGradientId})`}
          />
          <path d="M65 92H76M164 92H175" stroke="#FFFFFF" strokeLinecap="round" strokeOpacity="0.82" strokeWidth="5" />
          <path d="M65 148H76M164 148H175" stroke="#AFC8FF" strokeLinecap="round" strokeOpacity="0.44" strokeWidth="5" />
        </g>
      </g>
    </svg>
  );
}
