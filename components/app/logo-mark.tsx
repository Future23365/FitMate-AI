type LogoMarkProps = {
  className?: string;
  animated?: boolean;
};

// FitMate 的品牌标识使用极简哑铃与勾选负空间，保持小尺寸下的清晰识别。
export function LogoMark({ className = "h-10 w-10", animated = false }: LogoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={`${className} shrink-0 overflow-visible`}
      fill="none"
      role="img"
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#FFFFFF" height="84" rx="24" width="84" x="6" y="6" />
      <rect height="83" rx="23.5" stroke="#D7E3FF" width="83" x="6.5" y="6.5" />
      <path
        d="M24 70C35 75 57 75 72 62"
        stroke="#DCE7FF"
        strokeLinecap="round"
        strokeWidth="5"
      />

      <g transform="translate(14 30)">
        {animated ? (
          <animateTransform
            additive="sum"
            attributeName="transform"
            dur="2.8s"
            repeatCount="indefinite"
            type="translate"
            values="0 0;0 -1.2;0 0"
          />
        ) : null}
        <rect fill="#2459E6" height="36" rx="10" width="12" x="0" y="0" />
        <rect fill="#2459E6" height="30" rx="9" width="11" x="13" y="3" />
        <rect fill="#2459E6" height="12" rx="6" width="26" x="22" y="12" />
        <rect fill="#2459E6" height="30" rx="9" width="11" x="46" y="3" />
        <rect fill="#2459E6" height="36" rx="10" width="12" x="58" y="0" />
        <path d="M29 16L34 21L43 11" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4.5" />
        <path d="M5 7H8M62 7H65" stroke="#DCE7FF" strokeLinecap="round" strokeWidth="2.5" />
      </g>

      <path
        d="M25 27C34 22 62 22 71 30"
        stroke="#DCE7FF"
        strokeLinecap="round"
        strokeWidth="3"
      >
        {animated ? (
          <animate attributeName="opacity" dur="2.8s" repeatCount="indefinite" values="0.35;0.85;0.35" />
        ) : null}
      </path>
    </svg>
  );
}
