"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionUser } from "@jinmarket/shared";

import { fetchCurrentUser, requestJson } from "../lib/api";

const defaultAdminAppUrl =
  process.env.NODE_ENV === "production"
    ? "https://management.jinmarket.shop"
    : "https://jinmarket.test:3200";
const adminAppUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? defaultAdminAppUrl;

export function ShopChrome({ children }: { children: React.ReactNode }) {
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
            <p className="eyebrow">Jinmarket Shop</p>
            <Link href="/" className="brand" onClick={closeNav}>
              여러 사람의 물건을 가볍게 만나는 마켓
            </Link>
          </div>

          <button
            type="button"
            className="navToggle"
            aria-expanded={navOpen}
            aria-controls="shop-lnb"
            onClick={() => setNavOpen((prev) => !prev)}
          >
            {navOpen ? "메뉴 닫기" : "메뉴 열기"}
          </button>
        </div>

        <nav id="shop-lnb" className={`nav ${navOpen ? "open" : ""}`}>
          <Link href="/" onClick={closeNav}>
            상품 목록
          </Link>
          <Link href="/free-share" onClick={closeNav}>
            무료 나눔 존
          </Link>
          <Link href="/my/orders" onClick={closeNav}>
            내 구매
          </Link>
          <a
            href={adminAppUrl}
            target="_blank"
            rel="noreferrer"
            onClick={closeNav}
          >
            판매자 사이트
          </a>
          {user ? (
            <button
              className="ghostButton"
              onClick={async () => {
                await requestJson("/auth/logout", { method: "POST" });
                setUser(null);
                setNavOpen(false);
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
          <p className="siteFooterCopy">Jinmarket 정책 안내</p>
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
