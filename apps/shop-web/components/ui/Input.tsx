import type { InputHTMLAttributes } from "react";

import { cn } from "../../lib/ui";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-xl border border-[var(--buyer-border)] bg-white px-3 text-[13px] text-[var(--buyer-ink)] shadow-sm outline-none transition placeholder:text-[var(--buyer-muted)] focus-visible:border-[var(--buyer-accent)] focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)]/30 sm:h-11 sm:px-3.5 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
