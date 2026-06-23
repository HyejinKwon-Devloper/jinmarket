"use client";

import Link from "next/link";

import { useBuyerSession } from "./BuyerSessionProvider";

export function BuyerLoginHint() {
  const { hasError, isResolved, user } = useBuyerSession();

  if (!isResolved || hasError || user) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-3 py-2.5 text-[12px] leading-5 text-[var(--buyer-dark)] sm:px-4 sm:py-3 sm:text-sm sm:leading-6">
      로그인 없이도 목록은 볼 수 있지만 무료 나눔 요청이나 구매 진행은 로그인
      후에 가능합니다.{" "}
      <Link
        className="font-semibold text-[var(--buyer-primary)] underline"
        href="/login"
      >
        로그인
      </Link>
      하고 계속해 주세요.
    </div>
  );
}
