"use client";

import { useEffect, useState } from "react";
import { buildThreadsLoginHref, resolveSafeReturnTo } from "@jinmarket/shared";
import { apiBaseUrl } from "../lib/api";

export function ThreadsAdminLoginPageContent() {
  const [targetUrl, setTargetUrl] = useState("/products");
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setTargetUrl(resolveSafeReturnTo(params.get("return_to"), "/products", window.location.origin));
    setLoginError(params.get("error"));
  }, []);

  return (
    <section className="loginCard">
      <p className="eyebrow">Seller Login</p>
      <h1>판매를 시작하려면 로그인해 주세요.</h1>
      <p className="muted">
        Threads 계정으로 본인 인증 후 로그인합니다. 로그인 뒤 판매자 승인 신청을 남기면 승인 완료 후 상품 등록을 시작할 수 있습니다.
      </p>

      <div className="actionRow" style={{ marginTop: 18 }}>
        <a className="primaryButton" href={buildThreadsLoginHref(targetUrl, apiBaseUrl)}>
          Threads로 로그인
        </a>
      </div>

      {loginError ? <div className="message">{loginError}</div> : null}
    </section>
  );
}
