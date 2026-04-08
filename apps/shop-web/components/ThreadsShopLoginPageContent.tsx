"use client";

import { useEffect, useState } from "react";
import { resolveSafeReturnTo } from "@jinmarket/shared";

import { requestJson } from "../lib/api";

type AuthResponse = {
  message: string;
};

export function ThreadsShopLoginPageContent() {
  const [targetUrl, setTargetUrl] = useState("/");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [resetLoginId, setResetLoginId] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetNewPasswordConfirm, setResetNewPasswordConfirm] = useState("");
  const [resetRequested, setResetRequested] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [signupLoginId, setSignupLoginId] = useState("");
  const [signupDisplayName, setSignupDisplayName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [signupSubmitting, setSignupSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setTargetUrl(resolveSafeReturnTo(params.get("return_to"), "/", window.location.origin));
    setLoginMessage(params.get("error"));
  }, []);

  function redirectToTarget() {
    window.location.href = targetUrl;
  }

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loginSubmitting) {
      return;
    }

    try {
      setLoginSubmitting(true);
      setLoginMessage(null);
      const response = await requestJson<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          loginId,
          password
        })
      });
      setLoginMessage(response.message);
      redirectToTarget();
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleSignupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (signupSubmitting) {
      return;
    }

    if (signupPassword !== signupPasswordConfirm) {
      setSignupMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    try {
      setSignupSubmitting(true);
      setSignupMessage(null);
      const response = await requestJson<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          loginId: signupLoginId,
          displayName: signupDisplayName,
          password: signupPassword
        })
      });
      setSignupMessage(response.message);
      redirectToTarget();
    } catch (error) {
      setSignupMessage(error instanceof Error ? error.message : "회원가입에 실패했습니다.");
    } finally {
      setSignupSubmitting(false);
    }
  }

  async function handleRequestReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (resetSubmitting) {
      return;
    }

    try {
      setResetSubmitting(true);
      setResetMessage(null);
      const response = await requestJson<AuthResponse>("/auth/password/reset/request-code", {
        method: "POST",
        body: JSON.stringify({
          loginId: resetLoginId,
          email: resetEmail,
          portal: "SHOP"
        })
      });
      setResetRequested(true);
      setResetMessage(response.message);
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : "비밀번호 재설정 요청에 실패했습니다.");
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleVerifyReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (resetSubmitting) {
      return;
    }

    if (resetNewPassword !== resetNewPasswordConfirm) {
      setResetMessage("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    try {
      setResetSubmitting(true);
      setResetMessage(null);
      const response = await requestJson<AuthResponse>("/auth/password/reset/verify", {
        method: "POST",
        body: JSON.stringify({
          loginId: resetLoginId,
          email: resetEmail,
          code: resetCode,
          newPassword: resetNewPassword,
          portal: "SHOP"
        })
      });
      setResetMessage(response.message);
      redirectToTarget();
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : "비밀번호 재설정에 실패했습니다.");
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <section className="loginCard">
      <p className="eyebrow">Buyer Login</p>
      <h1>구매자 사이트에 로그인해 주세요</h1>
      <p className="muted">
        구매와 무료 나눔 신청은 로그인 후 이용할 수 있습니다. 구매자 사이트는 이메일 인증 없이 바로 가입할 수
        있습니다.
      </p>

      <form onSubmit={handleLoginSubmit} style={{ marginTop: 20, display: "grid", gap: 12 }}>
        <div className="field">
          <label htmlFor="shop-login-id">아이디</label>
          <input
            id="shop-login-id"
            className="input"
            type="text"
            autoComplete="username"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="@ 없이 입력"
          />
        </div>
        <div className="field">
          <label htmlFor="shop-login-password">비밀번호</label>
          <input
            id="shop-login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="actionRow">
          <button className="primaryButton" type="submit" disabled={loginSubmitting}>
            {loginSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </div>
        {loginMessage ? <div className="message">{loginMessage}</div> : null}
      </form>

      <div
        aria-hidden="true"
        style={{ height: 1, background: "rgba(15, 23, 42, 0.12)", margin: "24px 0" }}
      />

      <form onSubmit={handleRequestReset} style={{ display: "grid", gap: 12 }}>
        <div>
          <p className="eyebrow">Buyer Reset</p>
          <h2 style={{ margin: "6px 0 0", fontSize: "1.15rem" }}>비밀번호 재설정</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            기존 구매자 계정인데 비밀번호가 아직 없다면, 아래에서 인증번호를 받아 초기 비밀번호를 설정할 수
            있습니다.
          </p>
        </div>
        <div className="field">
          <label htmlFor="shop-reset-id">아이디</label>
          <input
            id="shop-reset-id"
            className="input"
            type="text"
            autoComplete="username"
            value={resetLoginId}
            onChange={(event) => setResetLoginId(event.target.value)}
            placeholder="@ 없이 입력"
          />
        </div>
        <div className="field">
          <label htmlFor="shop-reset-email">이메일</label>
          <input
            id="shop-reset-email"
            className="input"
            type="email"
            autoComplete="email"
            value={resetEmail}
            onChange={(event) => setResetEmail(event.target.value)}
          />
        </div>
        <div className="actionRow">
          <button className="secondaryButton" type="submit" disabled={resetSubmitting}>
            {resetSubmitting ? "전송 중..." : resetRequested ? "인증번호 다시 보내기" : "인증번호 보내기"}
          </button>
        </div>
      </form>

      {resetRequested ? (
        <form onSubmit={handleVerifyReset} style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <div className="field">
            <label htmlFor="shop-reset-code">인증번호</label>
            <input
              id="shop-reset-code"
              className="input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={resetCode}
              onChange={(event) => setResetCode(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="shop-reset-password">새 비밀번호</label>
            <input
              id="shop-reset-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={resetNewPassword}
              onChange={(event) => setResetNewPassword(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="shop-reset-password-confirm">새 비밀번호 확인</label>
            <input
              id="shop-reset-password-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={resetNewPasswordConfirm}
              onChange={(event) => setResetNewPasswordConfirm(event.target.value)}
            />
          </div>
          <div className="actionRow">
            <button className="primaryButton" type="submit" disabled={resetSubmitting}>
              {resetSubmitting ? "설정 중..." : "비밀번호 설정 완료"}
            </button>
          </div>
        </form>
      ) : null}

      {resetMessage ? <div className="message" style={{ marginTop: 16 }}>{resetMessage}</div> : null}

      <div
        aria-hidden="true"
        style={{ height: 1, background: "rgba(15, 23, 42, 0.12)", margin: "24px 0" }}
      />

      <form onSubmit={handleSignupSubmit} style={{ display: "grid", gap: 12 }}>
        <div>
          <p className="eyebrow">Sign Up</p>
          <h2 style={{ margin: "6px 0 0", fontSize: "1.15rem" }}>바로 가입하기</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            구매자 사이트는 이메일 인증 없이 바로 가입할 수 있습니다.
          </p>
        </div>
        <div className="field">
          <label htmlFor="shop-signup-name">이름</label>
          <input
            id="shop-signup-name"
            className="input"
            type="text"
            autoComplete="name"
            value={signupDisplayName}
            onChange={(event) => setSignupDisplayName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="shop-signup-id">아이디</label>
          <input
            id="shop-signup-id"
            className="input"
            type="text"
            autoComplete="username"
            value={signupLoginId}
            onChange={(event) => setSignupLoginId(event.target.value)}
            placeholder="@ 없이 입력"
          />
        </div>
        <div className="field">
          <label htmlFor="shop-signup-password">비밀번호</label>
          <input
            id="shop-signup-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={signupPassword}
            onChange={(event) => setSignupPassword(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="shop-signup-password-confirm">비밀번호 확인</label>
          <input
            id="shop-signup-password-confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={signupPasswordConfirm}
            onChange={(event) => setSignupPasswordConfirm(event.target.value)}
          />
        </div>
        <div className="actionRow">
          <button className="secondaryButton" type="submit" disabled={signupSubmitting}>
            {signupSubmitting ? "가입 처리 중..." : "회원가입"}
          </button>
        </div>
      </form>

      {signupMessage ? <div className="message" style={{ marginTop: 16 }}>{signupMessage}</div> : null}
    </section>
  );
}
