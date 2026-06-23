"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@jinmarket/shared";

import {
  ApiError,
  notifyBuyerProfileUpdated,
  updateProfile,
  updatePassword,
  uploadProfileImage,
} from "../lib/api";
import { cn } from "../lib/ui";
import { useBuyerSession } from "./BuyerSessionProvider";
import { ProfileAvatar } from "./ProfileAvatar";
import { Button } from "./ui/Button";

const maxProfileImageBytes = 5 * 1024 * 1024;
const allowedProfileImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const PASSWORD_RULE_HINT = "8자 이상 200자 이하로 입력해 주세요.";

export function ProfileImagePageClient({
  initialUser,
}: {
  initialUser?: SessionUser;
}) {
  const {
    hasError,
    isResolved,
    refreshUser,
    setUser: setSessionUser,
    user: sessionUser,
  } = useBuyerSession();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedSessionUser =
    isResolved && !hasError ? sessionUser : sessionUser ?? initialUser ?? null;
  const hasSessionError = hasError && !resolvedSessionUser;
  const [user, setUser] = useState<SessionUser | null>(resolvedSessionUser);
  const [draftDisplayName, setDraftDisplayName] = useState(
    () => resolvedSessionUser?.displayName ?? "",
  );
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftPreviewUrl, setDraftPreviewUrl] = useState<string | null>(null);
  const [useDefaultAvatar, setUseDefaultAvatar] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    return () => {
      if (draftPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(draftPreviewUrl);
      }
    };
  }, [draftPreviewUrl]);

  useEffect(() => {
    setUser(resolvedSessionUser);
    setDraftDisplayName(resolvedSessionUser?.displayName ?? "");
  }, [resolvedSessionUser]);

  const previewDisplayName = useMemo(() => {
    const normalized = draftDisplayName.trim();

    if (normalized) {
      return normalized;
    }

    return user?.displayName ?? "";
  }, [draftDisplayName, user?.displayName]);

  const currentPreviewUrl = useMemo(() => {
    if (useDefaultAvatar || !user) {
      return null;
    }

    return draftPreviewUrl ?? user.profileImageUrl;
  }, [draftPreviewUrl, useDefaultAvatar, user]);

  const hasPendingImageChange =
    user !== null &&
    (draftFile !== null || (useDefaultAvatar && user.profileImageUrl !== null));
  const hasPendingChange =
    user !== null &&
    (hasPendingImageChange || previewDisplayName !== user.displayName);

  function clearDraftPreview() {
    setDraftPreviewUrl((previousUrl) => {
      if (previousUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previousUrl);
      }

      return null;
    });
  }

  function resetDraftState() {
    setDraftFile(null);
    setUseDefaultAvatar(false);
    clearDraftPreview();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!selectedFile) {
      return;
    }

    if (!allowedProfileImageTypes.has(selectedFile.type)) {
      setProfileFeedback("JPG, PNG, WEBP, GIF 이미지 파일만 등록할 수 있습니다.");
      return;
    }

    if (selectedFile.size > maxProfileImageBytes) {
      setProfileFeedback("프로필 사진은 5MB 이하 파일만 등록할 수 있습니다.");
      return;
    }

    setProfileFeedback(null);
    setUseDefaultAvatar(false);
    setDraftFile(selectedFile);
    clearDraftPreview();
    setDraftPreviewUrl(URL.createObjectURL(selectedFile));
  }

  async function handleSave() {
    if (!user) {
      return;
    }
    if (!hasPendingChange) {
      setProfileFeedback("저장할 변경 사항이 없습니다.");
      return;
    }

    setIsSavingProfile(true);
    setProfileFeedback(null);

    try {
      const nextDisplayName = draftDisplayName.trim();

      if (nextDisplayName.length < 1 || nextDisplayName.length > 60) {
        setProfileFeedback("이름은 1자 이상 60자 이하로 입력해 주세요.");
        return;
      }

      let nextProfileImageUrl: string | null = useDefaultAvatar
        ? null
        : user.profileImageUrl;

      if (draftFile) {
        const uploaded = await uploadProfileImage(draftFile);
        nextProfileImageUrl = uploaded.imageUrl;
      }

      const result = await updateProfile({
        displayName: nextDisplayName,
        profileImageUrl: nextProfileImageUrl,
      });

      setUser(result.user);
      setSessionUser(result.user);
      setDraftDisplayName(result.user.displayName);
      notifyBuyerProfileUpdated(result.user);
      resetDraftState();
      setProfileFeedback(result.message);
      router.refresh();
    } catch (error) {
      setProfileFeedback(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "프로필 저장에 실패했습니다.",
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  function handleUseDefaultAvatar() {
    resetDraftState();
    setUseDefaultAvatar(true);
    setProfileFeedback(null);
  }

  async function handlePasswordSave() {
    if (!user) {
      return;
    }

    if (user.hasLocalPassword && !currentPassword) {
      setPasswordFeedback("현재 비밀번호를 입력해 주세요.");
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 200) {
      setPasswordFeedback(PASSWORD_RULE_HINT);
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setPasswordFeedback("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSavingPassword(true);
    setPasswordFeedback(null);

    try {
      const result = await updatePassword({
        ...(user.hasLocalPassword
          ? { currentPassword }
          : {}),
        newPassword,
      });

      setUser(result.user);
      setSessionUser(result.user);
      notifyBuyerProfileUpdated(result.user);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordFeedback(result.message);
      router.refresh();
    } catch (error) {
      setPasswordFeedback(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "비밀번호 저장에 실패했습니다.",
      );
    } finally {
      setIsSavingPassword(false);
    }
  }

  if (!isResolved && !resolvedSessionUser && !hasError) {
    return (
      <section className="rounded-[28px] border border-[var(--buyer-border)] bg-white px-4 py-10 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6">
        <div className="grid place-items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--buyer-soft)] border-t-[var(--buyer-primary)]" />
          <p className="text-sm text-[var(--buyer-muted)]">
            로그인 상태를 확인하고 있습니다.
          </p>
        </div>
      </section>
    );
  }

  if (!resolvedSessionUser) {
    return (
      <section className="rounded-[28px] border border-[var(--buyer-border)] bg-white px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--buyer-primary)]">
          Profile
        </p>
        <h1 className="mt-3 text-[24px] font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)] sm:text-[30px]">
          프로필 관리
        </h1>
        <div className="mt-4 rounded-[20px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-4 py-3 text-sm leading-6 text-[var(--buyer-dark)]">
          {hasSessionError ? (
            <>
              로그인 상태를 확인하지 못했습니다.{" "}
              <button
                type="button"
                className="font-semibold underline underline-offset-4"
                onClick={() => void refreshUser()}
              >
                다시 확인
              </button>
              해 주세요.
            </>
          ) : (
            <>
              프로필을 관리하려면{" "}
              <Link
                href="/login"
                className="font-semibold underline underline-offset-4"
              >
                로그인
              </Link>
              이 필요합니다.
            </>
          )}
        </div>
      </section>
    );
  }

  const currentUser = user ?? resolvedSessionUser;
  const hasPasswordInput =
    currentPassword.length > 0 ||
    newPassword.length > 0 ||
    newPasswordConfirm.length > 0;

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-[28px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
            Preview
          </p>
          <div className="mt-4 flex flex-col items-center gap-4 text-center">
            <ProfileAvatar
              className="shadow-[0_18px_36px_rgba(31,78,121,0.12)]"
              displayName={previewDisplayName}
              imageUrl={currentPreviewUrl}
              size="xl"
            />
            <div className="space-y-1">
              <p className="text-lg font-bold text-[var(--buyer-dark)]">
                {previewDisplayName}
              </p>
              <p className="text-sm text-[var(--buyer-muted)]">
                {currentUser.email ?? currentUser.threadsUsername ?? "구매자 계정"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
            Edit
          </p>
          <div className="mt-4 space-y-4">
            <div className="rounded-[22px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] p-4 sm:p-5">
              <div className="space-y-2">
                <label
                  className="text-sm font-semibold text-[var(--buyer-dark)]"
                  htmlFor="profile-display-name"
                >
                  표시 이름
                </label>
                <p className="text-sm leading-6 text-[var(--buyer-muted)]">
                  주문, 이벤트, 프로필에 보여지는 이름입니다. 1자 이상 60자 이하로
                  입력해 주세요.
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <input
                  autoComplete="nickname"
                  className="w-full rounded-[18px] border border-[var(--buyer-border)] bg-white px-4 py-3 text-base text-[var(--buyer-dark)] outline-none transition focus:border-[var(--buyer-primary)] focus:ring-4 focus:ring-[var(--buyer-soft)]"
                  id="profile-display-name"
                  maxLength={60}
                  type="text"
                  value={draftDisplayName}
                  onChange={(event) => {
                    setDraftDisplayName(event.target.value);
                    setProfileFeedback(null);
                  }}
                />
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--buyer-muted)]">
                  <span>앞뒤 공백은 저장 시 자동으로 정리됩니다.</span>
                  <span>{draftDisplayName.length}/60</span>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-dashed border-[var(--buyer-border)] bg-[var(--buyer-softest)] p-4 sm:p-5">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--buyer-dark)]">
                  새 프로필 사진 선택
                </p>
                <p className="text-sm leading-6 text-[var(--buyer-muted)]">
                  JPG, PNG, WEBP, GIF 파일을 올릴 수 있고, 최대 5MB까지
                  지원합니다.
                </p>
              </div>

              <input
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                type="file"
                onChange={handleFileChange}
              />

              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  사진 선택
                </Button>

                {(draftFile || currentPreviewUrl) && (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={() => {
                      resetDraftState();
                      setProfileFeedback(null);
                    }}
                  >
                    선택 해제
                  </Button>
                )}

                {currentUser.profileImageUrl && (
                  <Button
                    type="button"
                    variant="subtle"
                    onClick={handleUseDefaultAvatar}
                  >
                    기본 이미지 사용
                  </Button>
                )}
              </div>

              <p className="mt-4 text-sm text-[var(--buyer-muted)]">
                {draftFile
                  ? `선택한 파일: ${draftFile.name}`
                  : useDefaultAvatar
                    ? "기본 프로필 이미지로 저장할 예정입니다."
                    : "아직 새 파일을 선택하지 않았습니다."}
              </p>
            </div>

            <div className="rounded-[22px] border border-[var(--buyer-border)] bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[var(--buyer-dark)]">
                    변경 사항 저장
                  </p>
                  <p className="text-sm text-[var(--buyer-muted)]">
                    저장 후 메뉴 상단과 프로필 페이지에 바로 반영됩니다.
                  </p>
                </div>
                <Button
                  className={cn(
                    "sm:min-w-[140px]",
                    isSavingProfile && "cursor-wait opacity-80",
                  )}
                  disabled={!hasPendingChange || isSavingProfile}
                  type="button"
                  onClick={() => void handleSave()}
                >
                  {isSavingProfile ? "저장 중..." : "저장하기"}
                </Button>
              </div>
            </div>

            {profileFeedback ? (
              <div
                aria-live="polite"
                className="rounded-[20px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-4 py-3 text-sm leading-6 text-[var(--buyer-dark)]"
              >
                {profileFeedback}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
          Security
        </p>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-[var(--buyer-dark)]">
              {currentUser.hasLocalPassword ? "비밀번호 변경" : "비밀번호 설정"}
            </h2>
            <p className="text-sm leading-6 text-[var(--buyer-muted)]">
              {currentUser.hasLocalPassword
                ? "현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다. 변경 후 다른 기기에서는 다시 로그인해야 합니다."
                : "이 계정은 아직 로컬 비밀번호가 없습니다. 새 비밀번호를 저장하면 이후 아이디와 비밀번호로 로그인할 수 있습니다."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {currentUser.hasLocalPassword ? (
              <div className="space-y-2 md:col-span-2">
                <label
                  className="text-sm font-semibold text-[var(--buyer-dark)]"
                  htmlFor="profile-current-password"
                >
                  현재 비밀번호
                </label>
                <input
                  autoComplete="current-password"
                  className="w-full rounded-[18px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-4 py-3 text-base text-[var(--buyer-dark)] outline-none transition focus:border-[var(--buyer-primary)] focus:ring-4 focus:ring-[var(--buyer-soft)]"
                  id="profile-current-password"
                  maxLength={200}
                  type="password"
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(event.target.value);
                    setPasswordFeedback(null);
                  }}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <label
                className="text-sm font-semibold text-[var(--buyer-dark)]"
                htmlFor="profile-new-password"
              >
                새 비밀번호
              </label>
              <input
                autoComplete="new-password"
                className="w-full rounded-[18px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-4 py-3 text-base text-[var(--buyer-dark)] outline-none transition focus:border-[var(--buyer-primary)] focus:ring-4 focus:ring-[var(--buyer-soft)]"
                id="profile-new-password"
                maxLength={200}
                minLength={8}
                type="password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setPasswordFeedback(null);
                }}
              />
              <p className="text-xs text-[var(--buyer-muted)]">
                {PASSWORD_RULE_HINT}
              </p>
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-semibold text-[var(--buyer-dark)]"
                htmlFor="profile-new-password-confirm"
              >
                새 비밀번호 확인
              </label>
              <input
                autoComplete="new-password"
                className="w-full rounded-[18px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-4 py-3 text-base text-[var(--buyer-dark)] outline-none transition focus:border-[var(--buyer-primary)] focus:ring-4 focus:ring-[var(--buyer-soft)]"
                id="profile-new-password-confirm"
                maxLength={200}
                minLength={8}
                type="password"
                value={newPasswordConfirm}
                onChange={(event) => {
                  setNewPasswordConfirm(event.target.value);
                  setPasswordFeedback(null);
                }}
              />
            </div>
          </div>

          <div className="rounded-[22px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--buyer-dark)]">
                  계정 보안 저장
                </p>
                <p className="text-sm text-[var(--buyer-muted)]">
                  저장 후 현재 기기는 새 세션으로 유지되고, 다른 로그인 세션은 정리됩니다.
                </p>
              </div>
              <Button
                className={cn(
                  "sm:min-w-[160px]",
                  isSavingPassword && "cursor-wait opacity-80",
                )}
                disabled={!hasPasswordInput || isSavingPassword}
                type="button"
                onClick={() => void handlePasswordSave()}
              >
                {isSavingPassword
                  ? "저장 중..."
                  : currentUser.hasLocalPassword
                    ? "비밀번호 변경"
                    : "비밀번호 설정"}
              </Button>
            </div>
          </div>

          {passwordFeedback ? (
            <div
              aria-live="polite"
              className="rounded-[20px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-4 py-3 text-sm leading-6 text-[var(--buyer-dark)]"
            >
              {passwordFeedback}
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}
