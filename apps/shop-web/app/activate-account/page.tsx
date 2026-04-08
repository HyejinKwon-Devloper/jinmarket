"use client";

import { useEffect } from "react";

const configuredAdminAppUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL?.replace(/\/+$/, "") ?? "";

function getAdminActivationUrl() {
  if (configuredAdminAppUrl) {
    return `${configuredAdminAppUrl}/activate-account`;
  }

  if (typeof window === "undefined") {
    return "https://jinmarket.test:3200/activate-account";
  }

  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.port = nextUrl.port === "3100" ? "3200" : nextUrl.port;
    nextUrl.pathname = "/activate-account";
    return `${nextUrl.origin}${nextUrl.pathname}`;
  } catch {
    return "https://jinmarket.test:3200/activate-account";
  }
}

export default function ShopActivateAccountRedirectPage() {
  const adminActivationUrl = getAdminActivationUrl();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = `${adminActivationUrl}${window.location.search}`;
    window.location.replace(nextUrl);
  }, [adminActivationUrl]);

  return (
    <section className="loginCard">
      <p className="eyebrow">Seller Portal</p>
      <h1>기존 계정 전환은 판매자 사이트에서 진행해 주세요</h1>
      <p className="muted">
        판매자 전용 이메일 인증과 기존 Threads 계정 전환은 판매자 사이트에서만 진행됩니다. 잠시 후 자동으로
        이동합니다.
      </p>
      <div className="actionRow" style={{ marginTop: 20 }}>
        <a className="primaryButton" href={adminActivationUrl}>
          판매자 사이트로 이동
        </a>
      </div>
    </section>
  );
}
