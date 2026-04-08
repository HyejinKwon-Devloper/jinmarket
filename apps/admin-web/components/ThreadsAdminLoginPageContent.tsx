"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionUser } from "@jinmarket/shared";
import { resolveSafeReturnTo } from "@jinmarket/shared";

import { fetchCurrentUser, requestJson } from "../lib/api";

type LoginResponse = {
  user: SessionUser;
  message: string;
};

type VerificationResponse = {
  ok?: boolean;
  user?: SessionUser;
  message: string;
};

export function AdminLoginPageContent() {
  const [targetUrl, setTargetUrl] = useState("/products");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [needsSellerEmailVerification, setNeedsSellerEmailVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);

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
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupVerificationCode, setSignupVerificationCode] = useState("");
  const [signupVerificationRequested, setSignupVerificationRequested] = useState(false);
  const [signupMessage, setSignupMessage] = useState<string | null>(null);
  const [signupSubmitting, setSignupSubmitting] = useState(false);

  function redirectToTarget(nextTarget = targetUrl) {
    window.location.href = nextTarget;
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const resolvedTarget = resolveSafeReturnTo(params.get("return_to"), "/products", window.location.origin);
    setTargetUrl(resolvedTarget);

    if (params.get("error")) {
      setLoginMessage(params.get("error"));
    } else if (params.get("verify_required") === "1") {
      setLoginMessage("판매자 사이트 이용을 위해 이메일 인증이 필요합니다.");
    }

    void fetchCurrentUser()
      .then((user) => {
        if (!user) {
          return;
        }

        if (user.sellerEmailVerifiedAt) {
          redirectToTarget(resolvedTarget);
          return;
        }

        setNeedsSellerEmailVerification(true);
        setVerificationEmail(user.email ?? "");
        setLoginMessage("판매자 사이트 이용을 위해 이메일 인증이 필요합니다.");
      })
      .catch(() => undefined);
  }, []);

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loginSubmitting) {
      return;
    }

    try {
      setLoginSubmitting(true);
      setLoginMessage(null);
      const response = await requestJson<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          loginId,
          password,
        }),
      });

      if (response.user.sellerEmailVerifiedAt) {
        setLoginMessage(response.message);
        redirectToTarget();
        return;
      }

      setNeedsSellerEmailVerification(true);
      setVerificationEmail(response.user.email ?? "");
      setVerificationRequested(false);
      setVerificationCode("");
      setLoginMessage("판매자 이메일 인증이 필요합니다. 인증번호를 요청해 주세요.");
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleRequestSellerVerification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (verificationSubmitting) {
      return;
    }

    try {
      setVerificationSubmitting(true);
      setLoginMessage(null);
      const response = await requestJson<VerificationResponse>("/auth/seller-email/request-code", {
        method: "POST",
        body: JSON.stringify({
          email: verificationEmail,
        }),
      });
      setVerificationRequested(true);
      setLoginMessage(response.message);
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : "인증번호 발송에 실패했습니다.");
    } finally {
      setVerificationSubmitting(false);
    }
  }

  async function handleVerifySellerEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (verificationSubmitting) {
      return;
    }

    try {
      setVerificationSubmitting(true);
      setLoginMessage(null);
      const response = await requestJson<VerificationResponse>("/auth/seller-email/verify", {
        method: "POST",
        body: JSON.stringify({
          code: verificationCode,
        }),
      });
      setLoginMessage(response.message);
      redirectToTarget();
    } catch (error) {
      setLoginMessage(error instanceof Error ? error.message : "이메일 인증을 완료하지 못했습니다.");
    } finally {
      setVerificationSubmitting(false);
    }
  }

  async function handleRequestPasswordReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (resetSubmitting) {
      return;
    }

    try {
      setResetSubmitting(true);
      setResetMessage(null);
      const response = await requestJson<VerificationResponse>("/auth/password/reset/request-code", {
        method: "POST",
        body: JSON.stringify({
          loginId: resetLoginId,
          email: resetEmail,
          portal: "ADMIN",
        }),
      });
      setResetRequested(true);
      setResetMessage(response.message);
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : "비밀번호 재설정 요청에 실패했습니다.");
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleVerifyPasswordReset(event: React.FormEvent<HTMLFormElement>) {
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
      const response = await requestJson<LoginResponse>("/auth/password/reset/verify", {
        method: "POST",
        body: JSON.stringify({
          loginId: resetLoginId,
          email: resetEmail,
          code: resetCode,
          newPassword: resetNewPassword,
          portal: "ADMIN",
        }),
      });
      setResetMessage(response.message);
      redirectToTarget();
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : "비밀번호 재설정에 실패했습니다.");
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleRequestCode(event: React.FormEvent<HTMLFormElement>) {
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
      const response = await requestJson<VerificationResponse>("/auth/register/request-code", {
        method: "POST",
        body: JSON.stringify({
          loginId: signupLoginId,
          displayName: signupDisplayName,
          email: signupEmail,
          password: signupPassword,
        }),
      });
      setSignupVerificationRequested(true);
      setSignupMessage(response.message);
    } catch (error) {
      setSignupMessage(error instanceof Error ? error.message : "인증번호 발송에 실패했습니다.");
    } finally {
      setSignupSubmitting(false);
    }
  }

  async function handleVerifySignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (signupSubmitting) {
      return;
    }

    try {
      setSignupSubmitting(true);
      setSignupMessage(null);
      const response = await requestJson<LoginResponse>("/auth/register/verify", {
        method: "POST",
        body: JSON.stringify({
          loginId: signupLoginId,
          email: signupEmail,
          code: signupVerificationCode,
        }),
      });
      setSignupMessage(response.message);
      redirectToTarget();
    } catch (error) {
      setSignupMessage(error instanceof Error ? error.message : "회원가입을 완료하지 못했습니다.");
    } finally {
      setSignupSubmitting(false);
    }
  }

  async function handleLogoutForDifferentAccount() {
    await requestJson("/auth/logout", { method: "POST" });
    setNeedsSellerEmailVerification(false);
    setVerificationEmail("");
    setVerificationCode("");
    setVerificationRequested(false);
    setLoginId("");
    setPassword("");
    setLoginMessage(null);
  }

  return (
    <section className="loginCard">
      <p className="eyebrow">Seller Login</p>
      <h1>판매자 사이트에 로그인해 주세요</h1>
      <p className="muted">
        기존 판매자 계정으로 로그인할 수 있습니다. 판매자 사이트는 주문 알림 메일 발송을 위해 이메일 인증이
        필요합니다.
      </p>

      {!needsSellerEmailVerification ? (
        <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
          <form onSubmit={handleLoginSubmit} style={{ display: "grid", gap: 12 }}>
            <div className="field">
              <label htmlFor="admin-login-id">아이디</label>
              <input
                id="admin-login-id"
                className="input"
                type="text"
                autoComplete="username"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="@ 없이 입력"
              />
            </div>
            <div className="field">
              <label htmlFor="admin-login-password">비밀번호</label>
              <input
                id="admin-login-password"
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
            style={{ height: 1, background: "rgba(15, 23, 42, 0.12)", margin: "12px 0" }}
          />

          <form onSubmit={handleRequestPasswordReset} style={{ display: "grid", gap: 12 }}>
            <div>
              <p className="eyebrow">Seller Reset</p>
              <h2 style={{ margin: "6px 0 0", fontSize: "1.15rem" }}>비밀번호 찾기</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                이미 등록된 판매자 이메일이 있다면 인증번호로 비밀번호를 다시 설정할 수 있습니다. 기존 소셜 전용
                계정이었다면 아래 계정 전환 페이지를 이용해 주세요.
              </p>
            </div>
            <div className="field">
              <label htmlFor="admin-reset-id">아이디</label>
              <input
                id="admin-reset-id"
                className="input"
                type="text"
                autoComplete="username"
                value={resetLoginId}
                onChange={(event) => setResetLoginId(event.target.value)}
                placeholder="@ 없이 입력"
              />
            </div>
            <div className="field">
              <label htmlFor="admin-reset-email">이메일</label>
              <input
                id="admin-reset-email"
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
            <form onSubmit={handleVerifyPasswordReset} style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <label htmlFor="admin-reset-code">인증번호</label>
                <input
                  id="admin-reset-code"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={resetCode}
                  onChange={(event) => setResetCode(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-reset-password">새 비밀번호</label>
                <input
                  id="admin-reset-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={resetNewPassword}
                  onChange={(event) => setResetNewPassword(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="admin-reset-password-confirm">새 비밀번호 확인</label>
                <input
                  id="admin-reset-password-confirm"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={resetNewPasswordConfirm}
                  onChange={(event) => setResetNewPasswordConfirm(event.target.value)}
                />
              </div>
              <div className="actionRow">
                <button className="primaryButton" type="submit" disabled={resetSubmitting}>
                  {resetSubmitting ? "설정 중..." : "비밀번호 재설정"}
                </button>
              </div>
            </form>
          ) : null}

          {resetMessage ? <div className="message">{resetMessage}</div> : null}

          <div className="panel" style={{ marginTop: 12 }}>
            <p className="eyebrow">Legacy Seller</p>
            <h2 style={{ margin: "6px 0 0", fontSize: "1.15rem" }}>기존 계정 전환</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              예전 소셜 로그인 전용 판매자 계정이라면, 판매자 사이트에서 이메일 인증 후 비밀번호를 새로 만들 수
              있습니다.
            </p>
            <div className="actionRow" style={{ marginTop: 14 }}>
              <Link className="ghostButton" href="/activate-account">
                계정 전환 페이지로 이동
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 20, display: "grid", gap: 12 }}>
          <form onSubmit={handleRequestSellerVerification} style={{ display: "grid", gap: 12 }}>
            <div>
              <p className="eyebrow">Email Verify</p>
              <h2 style={{ margin: "6px 0 0", fontSize: "1.15rem" }}>판매자 이메일 인증</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                주문 알림을 받을 이메일 주소로 인증번호를 보내드립니다.
              </p>
            </div>
            <div className="field">
              <label htmlFor="admin-verify-email">이메일</label>
              <input
                id="admin-verify-email"
                className="input"
                type="email"
                autoComplete="email"
                value={verificationEmail}
                onChange={(event) => setVerificationEmail(event.target.value)}
              />
            </div>
            <div className="actionRow">
              <button className="secondaryButton" type="submit" disabled={verificationSubmitting}>
                {verificationSubmitting
                  ? "전송 중..."
                  : verificationRequested
                    ? "인증번호 다시 보내기"
                    : "인증번호 보내기"}
              </button>
              <button
                className="ghostButton"
                type="button"
                onClick={() => {
                  void handleLogoutForDifferentAccount();
                }}
              >
                다른 계정으로 로그인
              </button>
            </div>
          </form>

          {verificationRequested ? (
            <form onSubmit={handleVerifySellerEmail} style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <label htmlFor="admin-verify-code">이메일 인증번호</label>
                <input
                  id="admin-verify-code"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                />
              </div>
              <div className="actionRow">
                <button className="primaryButton" type="submit" disabled={verificationSubmitting}>
                  {verificationSubmitting ? "인증 처리 중..." : "이메일 인증 완료"}
                </button>
              </div>
            </form>
          ) : null}

          {loginMessage ? <div className="message">{loginMessage}</div> : null}
        </div>
      )}

      {!needsSellerEmailVerification ? (
        <>
          <div
            aria-hidden="true"
            style={{ height: 1, background: "rgba(15, 23, 42, 0.12)", margin: "24px 0" }}
          />

          <form onSubmit={handleRequestCode} style={{ display: "grid", gap: 12 }}>
            <div>
              <p className="eyebrow">Sign Up</p>
              <h2 style={{ margin: "6px 0 0", fontSize: "1.15rem" }}>이메일 인증 후 계정 만들기</h2>
              <p className="muted" style={{ marginTop: 8 }}>
                판매자 사이트 신규 가입은 이메일 인증까지 완료해야 사용할 수 있습니다.
              </p>
            </div>
            <div className="field">
              <label htmlFor="admin-signup-name">이름</label>
              <input
                id="admin-signup-name"
                className="input"
                type="text"
                autoComplete="name"
                value={signupDisplayName}
                onChange={(event) => setSignupDisplayName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="admin-signup-id">아이디</label>
              <input
                id="admin-signup-id"
                className="input"
                type="text"
                autoComplete="username"
                value={signupLoginId}
                onChange={(event) => setSignupLoginId(event.target.value)}
                placeholder="@ 없이 입력"
              />
            </div>
            <div className="field">
              <label htmlFor="admin-signup-email">이메일</label>
              <input
                id="admin-signup-email"
                className="input"
                type="email"
                autoComplete="email"
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="admin-signup-password">비밀번호</label>
              <input
                id="admin-signup-password"
                className="input"
                type="password"
                autoComplete="new-password"
                value={signupPassword}
                onChange={(event) => setSignupPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="admin-signup-password-confirm">비밀번호 확인</label>
              <input
                id="admin-signup-password-confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={signupPasswordConfirm}
                onChange={(event) => setSignupPasswordConfirm(event.target.value)}
              />
            </div>
            <div className="actionRow">
              <button className="secondaryButton" type="submit" disabled={signupSubmitting}>
                {signupSubmitting
                  ? "전송 중..."
                  : signupVerificationRequested
                    ? "인증번호 다시 보내기"
                    : "인증번호 보내기"}
              </button>
            </div>
          </form>

          {signupVerificationRequested ? (
            <form onSubmit={handleVerifySignup} style={{ marginTop: 16, display: "grid", gap: 12 }}>
              <div className="field">
                <label htmlFor="admin-signup-code">이메일 인증번호</label>
                <input
                  id="admin-signup-code"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={signupVerificationCode}
                  onChange={(event) => setSignupVerificationCode(event.target.value)}
                />
              </div>
              <div className="actionRow">
                <button className="primaryButton" type="submit" disabled={signupSubmitting}>
                  {signupSubmitting ? "가입 처리 중..." : "가입 완료"}
                </button>
              </div>
            </form>
          ) : null}

          {signupMessage ? <div className="message" style={{ marginTop: 16 }}>{signupMessage}</div> : null}
        </>
      ) : null}
    </section>
  );
}

export const ThreadsAdminLoginPageContent = AdminLoginPageContent;
