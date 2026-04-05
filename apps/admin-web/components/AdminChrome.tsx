"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionUser } from "@jinmarket/shared";

import { fetchCurrentUser, isApprovalAdmin, requestJson } from "../lib/api";

const defaultShopAppUrl =
  process.env.NODE_ENV === "production"
    ? "https://web.jinmarket.shop"
    : "https://jinmarket.test:3000";
const shopAppUrl = process.env.NEXT_PUBLIC_SHOP_APP_URL ?? defaultShopAppUrl;

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    void fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  function closeNav() {
    setNavOpen(false);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbarHeaderRow">
          <div>
            <p className="eyebrow">Jinmarket Admin</p>
            <Link href="/products" className="brand" onClick={closeNav}>
              출품자 상품과 판매 현황을 한눈에 관리
            </Link>
          </div>

          <button
            type="button"
            className="navToggle"
            aria-expanded={navOpen}
            aria-controls="admin-lnb"
            onClick={() => setNavOpen((prev) => !prev)}
          >
            {navOpen ? "메뉴 닫기" : "메뉴 열기"}
          </button>
        </div>

        <nav id="admin-lnb" className={`nav ${navOpen ? "open" : ""}`}>
          <Link href="/products" onClick={closeNav}>
            상품 목록
          </Link>
          <Link href="/products/new" onClick={closeNav}>
            상품 등록
          </Link>
          <Link href="/orders" onClick={closeNav}>
            주문 관리
          </Link>
          {isApprovalAdmin(user) ? (
            <Link href="/seller-approval" onClick={closeNav}>
              판매자 승인
            </Link>
          ) : null}
          <a href={shopAppUrl} target="_blank" rel="noreferrer" onClick={closeNav}>
            구매자 사이트
          </a>
          {user ? (
            <button
              className="ghostButton"
              onClick={async () => {
                await requestJson("/auth/logout", { method: "POST" });
                setUser(null);
                closeNav();
                window.location.href = "/login";
              }}
            >
              로그아웃
            </button>
          ) : (
            <Link href="/login" onClick={closeNav}>
              로그인
            </Link>
          )}
        </nav>
      </header>
      <main className="main">{children}</main>
      <footer className="siteFooter">
        <div className="siteFooterInner">
          <p className="siteFooterCopy">Jinmarket Seller 정책 안내</p>
          <div className="siteFooterLinks">
            <Link href="/privacy">개인정보처리방침</Link>
            <Link href="/terms">이용약관</Link>
            <Link href="/data-deletion">데이터 삭제 안내</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
