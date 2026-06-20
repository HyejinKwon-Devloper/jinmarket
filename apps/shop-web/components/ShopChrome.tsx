"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@jinmarket/shared";

import {
  fetchCurrentUser,
  requestJson,
  subscribeBuyerProfileUpdated,
} from "../lib/api";
import { cn } from "../lib/ui";
import { ProfileAvatar } from "./ProfileAvatar";
import { PwaInstallPrompt } from "./PwaInstallPrompt";
import { Button, LinkButton } from "./ui/Button";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  CloseIcon,
  MenuIcon,
} from "./ui/Icons";

const defaultAdminAppUrl =
  process.env.NODE_ENV === "production"
    ? "https://management.jinmarket.shop"
    : "https://jinmarket.test:3001";
const adminAppUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? defaultAdminAppUrl;

type NavItem = {
  description: string;
  href: string;
  isActive: (pathname: string) => boolean;
  label: string;
};

const navItems: NavItem[] = [
  {
    href: "/",
    label: "홈",
    description: "메인 홈과 판매자별 추천 상품을 둘러볼 수 있어요.",
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/products",
    label: "상품",
    description: "전체 상품을 판매자별로 모아보고 바로 탐색할 수 있어요.",
    isActive: (pathname) =>
      pathname === "/products" || pathname.startsWith("/products/"),
  },
  {
    href: "/events",
    label: "이벤트",
    description: "진행 중인 이벤트와 응모 정보를 확인할 수 있어요.",
    isActive: (pathname) =>
      pathname === "/events" || pathname.startsWith("/events/"),
  },
  {
    href: "/free-share",
    label: "무료 나눔",
    description: "무료 나눔 상품만 모아서 빠르게 확인할 수 있어요.",
    isActive: (pathname) => pathname === "/free-share",
  },
  {
    href: "/my/orders",
    label: "내 주문",
    description: "구매한 상품과 주문 상태를 한 번에 관리해요.",
    isActive: (pathname) =>
      pathname === "/my/orders" || pathname.startsWith("/my/orders/"),
  },
];

function getCurrentNavItem(pathname: string) {
  return navItems.find((item) => item.isActive(pathname)) ?? navItems[0];
}

function getProfileHref(user: SessionUser | null) {
  return user ? "/my/profile" : "/login";
}

function getProfileSubtext(user: SessionUser | null) {
  if (!user) {
    return "로그인하고 주문 내역과 프로필 사진을 함께 관리해 보세요.";
  }

  return user.email ?? user.threadsUsername ?? "구매자 계정";
}

export function ShopChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [user, setUser] = useState<SessionUser | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeNavItem = useMemo(() => getCurrentNavItem(pathname), [pathname]);
  const profileHref = getProfileHref(user);

  useEffect(() => {
    let isMounted = true;

    void fetchCurrentUser()
      .then((nextUser) => {
        if (isMounted) {
          setUser(nextUser);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
        }
      });

    const unsubscribe = subscribeBuyerProfileUpdated((nextUser) => {
      setUser(nextUser);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navOpen]);

  async function handleLogout() {
    await requestJson("/auth/logout", { method: "POST" });
    setUser(null);
    setNavOpen(false);
    window.location.assign("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--buyer-canvas)] text-[var(--buyer-ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--buyer-border)] bg-white/90 backdrop-blur">
        <div className="safe-area-top safe-area-inline">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-3.5 py-3.5 sm:px-6 sm:py-4">
            <div className="min-w-0 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--buyer-primary)] sm:text-xs">
                Jinmarket Buyer
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/"
                  className="block text-[22px] font-extrabold tracking-[-0.03em] text-[var(--buyer-dark)] sm:text-2xl"
                >
                  JINMARKET
                </Link>
              </div>
            </div>

            <button
              ref={menuButtonRef}
              aria-controls="buyer-global-nav"
              aria-expanded={navOpen}
              aria-label="메뉴 열기"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--buyer-border)] bg-white text-[var(--buyer-dark)] shadow-sm transition hover:bg-[var(--buyer-softest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
              type="button"
              onClick={() => setNavOpen(true)}
            >
              <MenuIcon className="h-5 w-5" />
              <span className="sr-only">메뉴 열기</span>
            </button>
          </div>
        </div>
      </header>

      <div
        aria-hidden={!navOpen}
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-300",
          navOpen
            ? "pointer-events-auto bg-slate-950/30 opacity-100"
            : "pointer-events-none bg-slate-950/0 opacity-0",
        )}
      >
        <div
          aria-labelledby="buyer-global-nav-title"
          aria-modal="true"
          className={cn(
            "absolute inset-0 flex flex-col overflow-y-auto bg-white transition-transform duration-300 ease-out",
            navOpen ? "translate-x-0" : "translate-x-full",
          )}
          id="buyer-global-nav"
          role="dialog"
        >
          <div className="safe-area-top safe-area-bottom safe-area-inline flex min-h-full flex-col">
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <h2
                      className="text-[28px] font-extrabold tracking-[-0.05em] text-[var(--buyer-dark)] sm:text-[34px]"
                      id="buyer-global-nav-title"
                    >
                      메뉴
                    </h2>
                  </div>
                </div>

                <button
                  ref={closeButtonRef}
                  aria-label="메뉴 닫기"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--buyer-border)] bg-white text-[var(--buyer-dark)] shadow-sm transition hover:bg-[var(--buyer-softest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
                  type="button"
                  onClick={() => {
                    setNavOpen(false);
                    menuButtonRef.current?.focus();
                  }}
                >
                  <CloseIcon className="h-5 w-5" />
                  <span className="sr-only">메뉴 닫기</span>
                </button>
              </div>

              <section className="mt-6 rounded-[30px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link
                    aria-label={
                      user
                        ? "프로필 사진 변경 페이지 열기"
                        : "로그인 페이지 열기"
                    }
                    className="w-fit rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-4"
                    href={profileHref}
                  >
                    <ProfileAvatar
                      className="shadow-[0_18px_36px_rgba(31,78,121,0.12)]"
                      displayName={user?.displayName ?? "게스트"}
                      imageUrl={user?.profileImageUrl}
                      size="lg"
                    />
                  </Link>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
                      Profile
                    </p>
                    <p className="truncate text-[22px] font-bold tracking-[-0.03em] text-[var(--buyer-dark)]">
                      {user?.displayName ?? "게스트"}
                    </p>
                    <p className="text-sm leading-6 text-[var(--buyer-muted)]">
                      {getProfileSubtext(user)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <LinkButton href={profileHref} variant="outline">
                    {user ? "프로필 사진 변경" : "로그인하고 프로필 등록"}
                  </LinkButton>
                </div>
              </section>

              <div className="my-6 h-px bg-[var(--buyer-border)]" />

              <nav aria-label="구매자 주요 메뉴" className="mt-5 space-y-2">
                {navItems.map((item) => {
                  const isActive = item.isActive(pathname);

                  return (
                    <Link
                      key={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between gap-4 rounded-[22px] border px-4 py-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2 sm:px-5",
                        isActive
                          ? "border-[var(--buyer-primary)] bg-[var(--buyer-softest)] shadow-[0_16px_28px_rgba(31,78,121,0.12)]"
                          : "border-[var(--buyer-border)] bg-white hover:bg-[var(--buyer-softest)]",
                      )}
                      href={item.href}
                    >
                      <span className="min-w-0 space-y-1">
                        <span className="block text-base font-bold text-[var(--buyer-dark)] sm:text-[17px]">
                          {item.label}
                        </span>
                        <span className="block text-sm leading-6 text-[var(--buyer-muted)]">
                          {item.description}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition",
                          isActive
                            ? "border-[var(--buyer-primary)] bg-[var(--buyer-primary)] text-white shadow-[0_10px_18px_rgba(31,78,121,0.18)]"
                            : "border-[var(--buyer-border)] bg-[var(--buyer-softest)] text-[var(--buyer-dark)]",
                        )}
                      >
                        {isActive ? (
                          <ChevronRightIcon className="h-4 w-4" />
                        ) : (
                          <ArrowRightIcon className="h-4 w-4" />
                        )}
                      </span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto pt-6">
                <div className="mb-4 h-px bg-[var(--buyer-border)]" />
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <PwaInstallPrompt />
                  <a
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--buyer-border)] bg-white px-4 text-[13px] font-semibold text-[var(--buyer-dark)] shadow-sm transition hover:bg-[var(--buyer-softest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2 sm:text-sm"
                    href={adminAppUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    판매자/관리자 사이트
                  </a>
                  {user ? (
                    <Button
                      className="min-h-11 px-4"
                      type="button"
                      variant="subtle"
                      onClick={() => void handleLogout()}
                    >
                      로그아웃
                    </Button>
                  ) : (
                    <LinkButton
                      className="min-h-11 px-4"
                      href="/login"
                      variant="subtle"
                    >
                      로그인
                    </LinkButton>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-3.5 text-sm font-medium text-[var(--buyer-dark)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
                    href="/privacy"
                  >
                    개인정보처리방침
                  </Link>
                  <Link
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-3.5 text-sm font-medium text-[var(--buyer-dark)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
                    href="/terms"
                  >
                    이용약관
                  </Link>
                  <Link
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-3.5 text-sm font-medium text-[var(--buyer-dark)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
                    href="/data-deletion"
                  >
                    데이터 삭제 안내
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="safe-area-inline mx-auto w-full max-w-6xl flex-1 px-3.5 py-5 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="safe-area-bottom safe-area-inline border-t border-[var(--buyer-border)] bg-white/95">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
              Buyer Policy
            </p>
            <p className="text-base font-semibold text-[var(--buyer-dark)]">
              JINMARKET 이용 안내
            </p>
            <p className="text-sm leading-6 text-[var(--buyer-muted)]">
              서비스 이용 전 약관과 정책을 확인해 주세요. 앱으로 추가하면 더 편하게
              둘러볼 수 있어요.
            </p>
          </div>
          <nav
            aria-label="서비스 정책"
            className="flex flex-wrap items-center gap-2.5 text-sm"
          >
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-3.5 font-medium text-[var(--buyer-dark)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
              href="/privacy"
            >
              개인정보처리방침
            </Link>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-3.5 font-medium text-[var(--buyer-dark)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
              href="/terms"
            >
              이용약관
            </Link>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-3.5 font-medium text-[var(--buyer-dark)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
              href="/data-deletion"
            >
              데이터 삭제 안내
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
