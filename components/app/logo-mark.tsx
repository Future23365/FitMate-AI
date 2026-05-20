import { SymbolIcon } from "./symbol-icon";

export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-2xl bg-primary-container text-white shadow-sm`}
    >
      <SymbolIcon className="text-[24px]" filled>
        fitness_center
      </SymbolIcon>
    </div>
  );
}
