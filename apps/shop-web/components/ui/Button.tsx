import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/ui";

const baseClasses =
  "inline-flex min-h-10 items-center justify-center rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-55 sm:min-h-11 sm:px-4 sm:text-sm";

const variantClasses = {
  primary:
    "border-[var(--buyer-primary)] bg-[var(--buyer-primary)] text-white shadow-[0_14px_30px_rgba(31,78,121,0.18)] hover:bg-[var(--buyer-primary-strong)] hover:border-[var(--buyer-primary-strong)]",
  outline:
    "border-[var(--buyer-primary)] bg-white text-[var(--buyer-primary)] hover:bg-[var(--buyer-soft)]",
  subtle:
    "border-transparent bg-[var(--buyer-soft)] text-[var(--buyer-dark)] hover:bg-[var(--buyer-soft-strong)]",
} as const;

type ButtonVariant = keyof typeof variantClasses;

type CommonProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
};

type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type LinkButtonProps = CommonProps & {
  href: string;
};

function classes(variant: ButtonVariant, className?: string) {
  return cn(baseClasses, variantClasses[variant], className);
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button className={classes(variant, className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  children,
  className,
  href,
  variant = "primary",
}: LinkButtonProps) {
  return (
    <Link className={classes(variant, className)} href={href}>
      {children}
    </Link>
  );
}
