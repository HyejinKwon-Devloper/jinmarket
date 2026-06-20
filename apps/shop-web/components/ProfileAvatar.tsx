"use client";

import { cn } from "../lib/ui";

function getProfileInitial(displayName: string) {
  const trimmed = displayName.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

type ProfileAvatarProps = {
  className?: string;
  displayName: string;
  imageUrl?: string | null;
  size?: "sm" | "lg" | "xl";
};

const sizeClasses = {
  sm: "h-14 w-14 text-lg",
  lg: "h-20 w-20 text-2xl",
  xl: "h-28 w-28 text-3xl",
} as const;

export function ProfileAvatar({
  className,
  displayName,
  imageUrl,
  size = "lg",
}: ProfileAvatarProps) {
  const initial = getProfileInitial(displayName);

  if (imageUrl) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 overflow-hidden rounded-full border border-[var(--buyer-border)] bg-[var(--buyer-softest)]",
          sizeClasses[size],
          className,
        )}
      >
        <img
          alt={`${displayName} 프로필 사진`}
          className="h-full w-full object-cover"
          decoding="async"
          loading="lazy"
          src={imageUrl}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--buyer-border)] bg-gradient-to-br from-[var(--buyer-softest)] via-white to-[var(--buyer-soft)] font-black tracking-[-0.04em] text-[var(--buyer-dark)]",
        sizeClasses[size],
        className,
      )}
    >
      {initial}
    </span>
  );
}

