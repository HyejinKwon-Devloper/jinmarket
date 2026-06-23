"use client";

import { sanitizeProfileImageUrl } from "@jinmarket/shared";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../lib/ui";

function getProfileInitial(displayName: string) {
  const trimmed = displayName.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

type ProfileAvatarProps = {
  className?: string;
  displayName: string;
  imageUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
};

const sizeClasses = {
  xs: "h-12 w-12 text-[15px]",
  sm: "h-14 w-14 text-lg",
  md: "h-18 w-18 text-[22px]",
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
  const safeImageUrl = useMemo(() => sanitizeProfileImageUrl(imageUrl), [imageUrl]);
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [safeImageUrl]);

  if (safeImageUrl && !hasImageError) {
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
          src={safeImageUrl}
          onError={() => setHasImageError(true)}
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
