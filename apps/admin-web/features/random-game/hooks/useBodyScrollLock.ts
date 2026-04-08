"use client";

import { useEffect } from "react";

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) {
      return undefined;
    }

    const body = document.body;
    const previousOverscroll = body.style.overscrollBehavior;

    body.style.overscrollBehavior = "none";

    return () => {
      body.style.overscrollBehavior = previousOverscroll;
    };
  }, [locked]);
}
