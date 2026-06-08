/** SymbolIcon 统一承载 Material Symbols ligature 图标，保证全站图标加载策略集中生效。 */
export function SymbolIcon({
  children,
  className = "",
  filled = false,
}: {
  children: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? "material-symbols-filled" : ""} ${className}`}
      data-symbol-icon=""
    >
      {children}
    </span>
  );
}
