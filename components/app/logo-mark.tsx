export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-card`}
    >
      <svg
        aria-hidden="true"
        className="h-[68%] w-[68%]"
        fill="none"
        viewBox="0 0 64 64"
      >
        <path
          d="M13 24.5h6v15h-6a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Z"
          fill="currentColor"
        />
        <path
          d="M45 24.5h6a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-6v-15Z"
          fill="currentColor"
        />
        <path
          d="M21 18h7v28h-7a3 3 0 0 1-3-3V21a3 3 0 0 1 3-3Z"
          fill="currentColor"
        />
        <path
          d="M36 18h7a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3h-7V18Z"
          fill="currentColor"
        />
        <path
          d="M26 29h12v6H26v-6Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
