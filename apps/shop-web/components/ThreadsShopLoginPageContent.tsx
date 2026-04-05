"use client";

import { useEffect, useState } from "react";
import { buildThreadsLoginHref, resolveSafeReturnTo } from "@jinmarket/shared";
import { apiBaseUrl } from "../lib/api";

export function ThreadsShopLoginPageContent() {
  const [targetUrl, setTargetUrl] = useState("/");
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setTargetUrl(resolveSafeReturnTo(params.get("return_to"), "/", window.location.origin));
    setLoginError(params.get("error"));
  }, []);

  return (
    <section className="loginCard">
      <p className="eyebrow">Login</p>
      <h1>구매를 시작하려면 로그인해 주세요.</h1>
      <p className="muted">
        Threads 계정으로 본인 인증 후 로그인합니다. 로그인 뒤에는 원래 보려던 페이지로 안전하게 돌아갑니다.
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
