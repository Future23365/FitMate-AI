import { useId } from "react";

type LogoMarkProps = {
  className?: string;
  animated?: boolean;
};

// FitMate 的品牌标识使用蓝色圆角徽章与白色哑铃负形，强调产品 Logo 的清晰识别。
export function LogoMark({ className = "h-10 w-10", animated = false }: LogoMarkProps) {
  const rawId = useId().replace(/:/g, "");
  const badgeGradientId = `fitmate-badge-${rawId}`;
  const shineGradientId = `fitmate-shine-${rawId}`;

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
        <linearGradient id={badgeGradientId} x1="57" x2="183" y1="44" y2="196">
          <stop stopColor="#5D8CFF" />
          <stop offset="0.55" stopColor="#2459E6" />
          <stop offset="1" stopColor="#1746BF" />
        </linearGradient>
        <radialGradient
          cx="0"
          cy="0"
          gradientTransform="translate(85 69) rotate(48) scale(110)"
          gradientUnits="userSpaceOnUse"
          id={shineGradientId}
          r="1"
        >
          <stop stopColor="#FFFFFF" stopOpacity="0.46" />
          <stop offset="0.52" stopColor="#FFFFFF" stopOpacity="0.08" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect fill="#FFFFFF" height="210" rx="60" width="210" x="15" y="15" />
      <rect height="207" rx="58.5" stroke="#D7E3FF" strokeWidth="2.5" width="207" x="16.5" y="16.5" />
      <rect fill={`url(#${badgeGradientId})`} height="156" rx="46" width="156" x="42" y="42" />
      <path d="M62 72C85 54 138 52 174 76" stroke={`url(#${shineGradientId})`} strokeLinecap="round" strokeWidth="34" />

      <g className={animated ? "fitmate-dumbbell-pop" : undefined}>
        <g transform="rotate(-10 120 120)">
          {animated ? (
            <animateTransform
              additive="sum"
              attributeName="transform"
              dur="2.4s"
              repeatCount="indefinite"
              type="translate"
              values="0 0;0 -5;0 0"
            />
          ) : null}
          <rect fill="#FFFFFF" height="72" rx="18" width="26" x="48" y="84" />
          <rect fill="#FFFFFF" fillOpacity="0.88" height="58" rx="17" width="24" x="78" y="91" />
          <rect fill="#FFFFFF" height="22" rx="11" width="48" x="96" y="109" />
          <rect fill="#FFFFFF" fillOpacity="0.88" height="58" rx="17" width="24" x="138" y="91" />
          <rect fill="#FFFFFF" height="72" rx="18" width="26" x="166" y="84" />
          <path d="M58 98H66M174 98H182" stroke="#DCE7FF" strokeLinecap="round" strokeWidth="5" />
        </g>
      </g>

    </svg>
  );
}
