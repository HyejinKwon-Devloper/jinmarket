"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeProfileImageUrl, type SessionUser } from "@jinmarket/shared";

import {
  fetchCurrentUser,
  hasSellerAccess,
  isApprovalAdmin,
  requestJson,
} from "../lib/api";
import { PwaInstallPromptUnified } from "./PwaInstallPromptUnified";
import { PushNotificationPrompt } from "./PushNotificationPrompt";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  CloseIcon,
  MenuIcon,
} from "./ui/Icons";

type NavigationItem = {
  href: string;
  label: string;
  description: string;
  adminOnly?: boolean;
};

const defaultShopAppUrl =
  process.env.NODE_ENV === "production"
    ? "https://web.jinmarket.shop"
    : "https://jinmarket.test:3000";
const shopAppUrl = process.env.NEXT_PUBLIC_SHOP_APP_URL ?? defaultShopAppUrl;

const navigationItems: NavigationItem[] = [
  {
    href: "/products",
    label: "상품 관리",
    description: "등록된 상품 목록과 상세 상태를 관리합니다.",
  },
  {
    href: "/products/new",
    label: "새 상품 등록",
    description: "판매할 굿즈를 빠르게 등록합니다.",
  },
  {
    href: "/events",
    label: "이벤트 관리",
    description: "이벤트 목록과 응모 현황을 확인합니다.",
  },
  {
    href: "/events/new",
    label: "새 이벤트 등록",
    description: "응모 이벤트를 새로 생성합니다.",
  },
  {
    href: "/orders",
    label: "주문 관리",
    description: "구매 완료 주문과 연락 상태를 확인합니다.",
  },
  {
    href: "/random-game",
    label: "추첨 게임",
    description: "가위바위보 및 추첨형 흐름을 실행합니다.",
  },
  {
    href: "/seller-approval",
    label: "판매자 승인",
    description: "판매 권한 요청을 검토합니다.",
    adminOnly: true,
  },
  {
    href: "/push",
    label: "푸시 발송",
    description: "관리자 인증 후 대상 사용자와 앱을 골라 운영 푸시를 보냅니다.",
    adminOnly: true,
  },
];

const legalItems = [
  { href: "/privacy", label: "개인정보 처리방침" },
  { href: "/terms", label: "이용약관" },
  { href: "/data-deletion", label: "데이터 삭제 안내" },
] as const;

function resolveCurrentItem(pathname: string) {
  const sortedItems = [...navigationItems].sort(
    (left, right) => right.href.length - left.href.length,
  );

  return (
    sortedItems.find((item) => {
      if (pathname === item.href) {
        return true;
      }

      if (item.href === "/random-game") {
        return pathname.startsWith("/random-game");
      }

      return pathname.startsWith(`${item.href}/`);
    }) ?? null
  );
}

function getUserInitial(user: SessionUser | null) {
  const label =
    user?.displayName?.trim() ||
    user?.threadsUsername?.trim() ||
    user?.email?.trim() ||
    "Admin";

  return label.slice(0, 1).toUpperCase();
}

function getUserStatus(user: SessionUser | null) {
  if (!user) {
    return "로그인이 필요합니다.";
  }

  if (isApprovalAdmin(user)) {
    return "관리자 권한 활성화";
  }

  if (hasSellerAccess(user)) {
    return "판매자 권한 활성화";
  }

  if (user.sellerEmailVerifiedAt) {
    return "판매 승인 대기 중";
  }

  return "이메일 인증 필요";
}

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pathname = usePathname();
  const isImmersiveRoute =
    pathname === "/random-game" || pathname.startsWith("/random-game/");
  const currentItem = resolveCurrentItem(pathname);
  const safeProfileImageUrl = useMemo(
    () => sanitizeProfileImageUrl(user?.profileImageUrl),
    [user?.profileImageUrl],
  );

  const visibleNavigationItems = useMemo(
    () =>
      navigationItems.filter(
        (item) => !item.adminOnly || isApprovalAdmin(user),
      ),
    [user],
  );

  useEffect(() => {
    void fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (
      !user ||
      user.sellerEmailVerifiedAt ||
      pathname === "/login" ||
      typeof window === "undefined"
    ) {
      return;
    }

    const loginUrl = new URL("/login", window.location.origin);
    loginUrl.searchParams.set(
      "return_to",
      `${window.location.pathname}${window.location.search}`,
    );
    loginUrl.searchParams.set("verify_required", "1");
    window.location.replace(loginUrl.toString());
  }, [pathname, user]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [safeProfileImageUrl]);

  useEffect(() => {
    if (!navOpen || typeof window === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNavOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    document.body.style.overflow = "hidden";
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
    window.location.href = "/login";
  }

  if (isImmersiveRoute) {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      <header className="sticky top-0 z-30 border-b border-[var(--buyer-border)] bg-white/90 backdrop-blur">
        <div className="safe-area-top safe-area-inline">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="min-w-0 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--buyer-primary)] sm:text-xs">
                Jinmarket Seller
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
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--buyer-border)] bg-white text-[var(--buyer-dark)] shadow-sm transition hover:bg-[var(--buyer-softest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
              aria-label="메뉴 열기"
              aria-expanded={navOpen}
              aria-controls="admin-navigation-drawer"
              onClick={() => setNavOpen(true)}
            >
              <MenuIcon className="h-5 w-5" />
              <span className="sr-only">메뉴 열기</span>
            </button>
          </div>
        </div>
      </header>

      <header className="hidden adminHeader safe-area-top safe-area-inline">
        <div className="adminHeaderSurface">
          <div className="adminHeaderRow">
            <div className="adminBrandLockup">
              <p className="eyebrow">Jinmarket Admin</p>
              <Link href="/products" className="brand">
                소중한 컬렉션을 <br />
                좋은분에게 보낼 수 있도록 <br /> 이곳에서 관리해보세요
              </Link>
              <br />
            </div>
            <div className="adminHeaderActions">
              <button
                type="button"
                className="adminMenuButton"
                aria-label="메뉴 열기"
                aria-expanded={navOpen}
                aria-controls="admin-navigation-drawer"
                onClick={() => setNavOpen(true)}
              >
                <MenuIcon className="h-5 w-5" />
                <span className="sr-only">메뉴 열기</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        aria-hidden={!navOpen}
        className={`adminDrawerShell ${navOpen ? "open" : ""}`}
      >
        <button
          aria-label="메뉴 닫기"
          className="adminDrawerBackdrop"
          tabIndex={navOpen ? 0 : -1}
          type="button"
          onClick={() => {
            setNavOpen(false);
            menuButtonRef.current?.focus();
          }}
        />

        <aside
          aria-labelledby="admin-navigation-title"
          aria-modal="true"
          className="adminDrawer safe-area-top safe-area-bottom safe-area-inline"
          id="admin-navigation-drawer"
          role="dialog"
        >
          <div className="adminDrawerPanel">
            <div className="adminDrawerHeader">
              <div className="adminDrawerToolbar">
                <div className="adminDrawerTitleBlock">
                  <p className="eyebrow" id="admin-navigation-title">
                    Admin Menu
                  </p>
                  <h2 className="adminDrawerTitle">관리자 메뉴</h2>
                </div>

                <button
                  aria-label="메뉴 닫기"
                  ref={closeButtonRef}
                  className="adminCloseButton"
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

              <div className="adminProfileCard">
                <span aria-hidden="true" className="adminAvatar">
                  {safeProfileImageUrl && !profileImageFailed ? (
                    <img
                      alt=""
                      className="adminAvatarImage"
                      src={safeProfileImageUrl}
                      onError={() => setProfileImageFailed(true)}
                    />
                  ) : (
                    getUserInitial(user)
                  )}
                </span>
                <div className="adminProfileMeta">
                  <p className="eyebrow">Signed in user</p>
                  <strong className="adminProfileName">
                    {user?.displayName ?? "관리자 계정"}
                  </strong>
                  <p className="adminProfileSubline">
                    {user?.email ??
                      "로그인하면 관리자 메뉴가 더 정확하게 보입니다."}
                  </p>
                  <p className="adminProfileStatus">{getUserStatus(user)}</p>
                </div>
              </div>

              <button
                aria-label="메뉴 닫기"
                className="adminCloseButton"
                type="button"
                onClick={() => setNavOpen(false)}
              >
                <CloseIcon className="h-5 w-5" />
                <span className="sr-only">메뉴 닫기</span>
              </button>
            </div>
            <hr className="adminDrawerDivider" />

            <nav aria-label="관리자 주요 메뉴" className="adminDrawerNav">
              <ul className="adminMenuList">
                {visibleNavigationItems.map((item) => {
                  const isActive = currentItem?.href === item.href;

                  return (
                    <li key={item.href}>
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        className={`adminNavItem ${isActive ? "active" : ""}`}
                        href={item.href}
                      >
                        <span className="adminNavItemText">
                          <span className="adminNavItemLabel">
                            {item.label}
                          </span>
                          <span className="adminNavItemDescription">
                            {item.description}
                          </span>
                        </span>
                        <span aria-hidden="true" className="adminNavItemBadge">
                          {isActive ? (
                            <ChevronRightIcon className="h-4 w-4" />
                          ) : (
                            <ArrowRightIcon className="h-4 w-4" />
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="adminDrawerFooter">
              <div className="adminDrawerLegal">
                {legalItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </div>

              <div className="adminDrawerActions">
                <PwaInstallPromptUnified
                  className="min-h-11 px-4"
                  showDismissButton={false}
                />
                <PushNotificationPrompt
                  app="ADMIN"
                  isLoggedIn={Boolean(user)}
                />
                <a
                  className="ghostButton"
                  href={shopAppUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  구매자 사이트 보기
                </a>
                {user ? (
                  <button
                    className="primaryButton"
                    type="button"
                    onClick={() => {
                      void handleLogout();
                    }}
                  >
                    로그아웃
                  </button>
                ) : (
                  <Link className="primaryButton" href="/login">
                    로그인
                  </Link>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <main className="main safe-area-inline">{children}</main>

      <footer className="siteFooter">
        <div className="siteFooterInner safe-area-inline safe-area-bottom">
          <p className="siteFooterCopy">Jinmarket Seller 정책 안내</p>
          <div className="siteFooterLinks">
            <Link href="/privacy">개인정보처리방침</Link>
            <Link href="/terms">이용약관</Link>
            <Link href="/data-deletion">데이터 삭제 안내</Link>
            <PwaInstallPromptUnified
              className="min-h-10 px-3.5"
              showDismissButton={false}
            />
            {legalItems.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
