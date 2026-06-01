import { useId } from "react";

type LogoMarkProps = {
  className?: string;
  animated?: boolean;
};

// FitMate 的品牌标识以精致哑铃为核心，兼顾小尺寸头像和应用图标的辨识度。
export function LogoMark({ className = "h-10 w-10", animated = false }: LogoMarkProps) {
  const rawId = useId().replace(/:/g, "");
  const shellGradientId = `fitmate-shell-${rawId}`;
  const fieldGradientId = `fitmate-field-${rawId}`;
  const dumbbellGradientId = `fitmate-dumbbell-${rawId}`;
  const plateGradientId = `fitmate-plate-${rawId}`;
  const gripGradientId = `fitmate-grip-${rawId}`;
  const glowGradientId = `fitmate-glow-${rawId}`;

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
        <linearGradient id={fieldGradientId} x1="54" x2="189" y1="43" y2="195">
          <stop stopColor="#F8FCFF" />
          <stop offset="0.44" stopColor="#E6F3FF" />
          <stop offset="1" stopColor="#DCE8FF" />
        </linearGradient>
        <linearGradient id={plateGradientId} x1="34" x2="198" y1="76" y2="161">
          <stop stopColor="#19D3F4" />
          <stop offset="0.34" stopColor="#2459E6" />
          <stop offset="1" stopColor="#081C5C" />
        </linearGradient>
        <linearGradient id={dumbbellGradientId} x1="69" x2="171" y1="94" y2="146">
          <stop stopColor="#0B1F5F" />
          <stop offset="0.52" stopColor="#123CBA" />
          <stop offset="1" stopColor="#06143F" />
        </linearGradient>
        <linearGradient id={gripGradientId} x1="103" x2="139" y1="98" y2="143">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.42" stopColor="#E9F3FF" />
          <stop offset="1" stopColor="#B8D0FF" />
        </linearGradient>
        <radialGradient
          cx="0"
          cy="0"
          gradientTransform="translate(125 116) rotate(28) scale(110 72)"
          gradientUnits="userSpaceOnUse"
          id={glowGradientId}
          r="1"
        >
          <stop stopColor="#2EE8FF" stopOpacity="0.48" />
          <stop offset="0.55" stopColor="#2459E6" stopOpacity="0.12" />
          <stop offset="1" stopColor="#2459E6" stopOpacity="0" />
        </radialGradient>
        <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="122" id={`fitmate-soft-shadow-${rawId}`} width="210" x="15" y="73">
          <feDropShadow dx="0" dy="15" floodColor="#06143F" floodOpacity="0.2" stdDeviation="9" />
        </filter>
      </defs>

      <rect fill={`url(#${shellGradientId})`} height="214" rx="58" width="214" x="13" y="13" />
      <rect height="211" rx="56.5" stroke="#C9D8F4" strokeWidth="2.5" width="211" x="14.5" y="14.5" />
      <path
        d="M120 35C160 35 194 58 204 93C214 128 199 166 167 187C135 208 92 202 64 176C36 149 31 106 52 73C67 49 91 35 120 35Z"
        fill={`url(#${fieldGradientId})`}
      />
      <path
        d="M120 35C160 35 194 58 204 93C214 128 199 166 167 187C135 208 92 202 64 176C36 149 31 106 52 73C67 49 91 35 120 35Z"
        stroke="#FFFFFF"
        strokeOpacity="0.88"
        strokeWidth="6"
      />
      <path d="M47 151C69 189 124 205 168 178" stroke="#2459E6" strokeLinecap="round" strokeOpacity="0.13" strokeWidth="18" />
      <ellipse cx="121" cy="120" fill={`url(#${glowGradientId})`} rx="82" ry="58" transform="rotate(-19 121 120)" />

      <g className={animated ? "fitmate-dumbbell-pop" : undefined}>
        <g filter={`url(#fitmate-soft-shadow-${rawId})`} transform="rotate(-18 120 120)">
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
          <path d="M69 102H171V138H69Z" fill={`url(#${dumbbellGradientId})`} />
          <path d="M28 95L42 76H72L88 96V144L72 164H42L28 145Z" fill={`url(#${plateGradientId})`} />
          <path d="M67 88H94C101 88 106 93 106 100V140C106 147 101 152 94 152H67Z" fill={`url(#${dumbbellGradientId})`} />
          <rect fill={`url(#${gripGradientId})`} height="50" rx="16" width="38" x="101" y="95" />
          <path d="M109 106V134M120 104V136M131 106V134" stroke="#2459E6" strokeLinecap="round" strokeOpacity="0.34" strokeWidth="4" />
          <path d="M146 88H173V152H146C139 152 134 147 134 140V100C134 93 139 88 146 88Z" fill={`url(#${dumbbellGradientId})`} />
          <path d="M152 96L168 76H198L212 95V145L198 164H168L152 144Z" fill={`url(#${plateGradientId})`} />
          <path d="M43 91H65M44 148H65M175 91H197M175 148H196" stroke="#FFFFFF" strokeLinecap="round" strokeOpacity="0.52" strokeWidth="5" />
          <path d="M28 120H84M156 120H212" stroke="#06143F" strokeLinecap="round" strokeOpacity="0.18" strokeWidth="5" />
          <path d="M33 101L46 84H70M170 84H194L207 101" stroke="#7DEBFF" strokeLinecap="round" strokeOpacity="0.64" strokeWidth="4" />
        </g>
      </g>
    </svg>
  );
}
