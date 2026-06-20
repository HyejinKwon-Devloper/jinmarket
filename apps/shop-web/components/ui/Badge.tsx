import type { ReactNode } from "react";

import { cn } from "../../lib/ui";

const badgeClasses =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:py-1 sm:text-[11px]";

const variantClasses = {
  default: "border-transparent bg-[var(--buyer-soft)] text-[var(--buyer-dark)]",
  success: "border-transparent bg-[var(--buyer-success-soft)] text-[var(--buyer-success)]",
  warning: "border-transparent bg-[var(--buyer-warning-soft)] text-[var(--buyer-warning)]",
  danger: "border-transparent bg-[var(--buyer-danger-soft)] text-[var(--buyer-danger)]",
};

export function Badge({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: keyof typeof variantClasses;
}) {
  return (
    <span className={cn(badgeClasses, variantClasses[variant], className)}>
      {children}
    </span>
  );
}
