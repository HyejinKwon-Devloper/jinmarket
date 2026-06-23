"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { sanitizeProfileImageUrl, type SessionUser } from "@jinmarket/shared";

import {
  ApiError,
  fetchCurrentUser,
  notifyAdminProfileUpdated,
  updatePassword,
  updateProfile,
  uploadProfileImage,
} from "../lib/api";

const maxProfileImageBytes = 5 * 1024 * 1024;
const allowedProfileImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const passwordRuleHint = "8자 이상 200자 이하로 입력해 주세요.";

function getUserInitial(user: SessionUser | null, displayName?: string) {
  const label =
    displayName?.trim() ||
    user?.displayName?.trim() ||
    user?.threadsUsername?.trim() ||
    user?.email?.trim() ||
    "Admin";

  return label.slice(0, 1).toUpperCase();
}

export function AdminProfilePageContent() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isResolved, setIsResolved] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState("");
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
    let isMounted = true;

    void fetchCurrentUser()
      .then((nextUser) => {
        if (!isMounted) {
          return;
        }

        setUser(nextUser);
        setDraftDisplayName(nextUser?.displayName ?? "");
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setUser(null);
        setDraftDisplayName("");
      })
      .finally(() => {
        if (isMounted) {
          setIsResolved(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (draftPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(draftPreviewUrl);
      }
    };
  }, [draftPreviewUrl]);

  const previewDisplayName = useMemo(() => {
    const normalized = draftDisplayName.trim();

    if (normalized) {
      return normalized;
    }

    return user?.displayName ?? "";
  }, [draftDisplayName, user?.displayName]);

  const safeProfileImageUrl = useMemo(() => {
    if (useDefaultAvatar) {
      return null;
    }

    return sanitizeProfileImageUrl(draftPreviewUrl ?? user?.profileImageUrl);
  }, [draftPreviewUrl, useDefaultAvatar, user?.profileImageUrl]);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [safeProfileImageUrl]);

  const hasPendingImageChange =
    user !== null &&
    (draftFile !== null || (useDefaultAvatar && user.profileImageUrl !== null));
  const hasPendingProfileChange =
    user !== null &&
    (hasPendingImageChange || previewDisplayName !== user.displayName);
  const hasPasswordInput =
    currentPassword.length > 0 ||
    newPassword.length > 0 ||
    newPasswordConfirm.length > 0;

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

  async function handleProfileSave() {
    if (!user) {
      return;
    }

    if (!hasPendingProfileChange) {
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
      setDraftDisplayName(result.user.displayName);
      notifyAdminProfileUpdated(result.user);
      resetDraftState();
      setProfileFeedback(result.message);
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

  async function handlePasswordSave() {
    if (!user) {
      return;
    }

    if (user.hasLocalPassword && !currentPassword) {
      setPasswordFeedback("현재 비밀번호를 입력해 주세요.");
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 200) {
      setPasswordFeedback(passwordRuleHint);
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
        ...(user.hasLocalPassword ? { currentPassword } : {}),
        newPassword,
      });

      setUser(result.user);
      notifyAdminProfileUpdated(result.user);
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPasswordFeedback(result.message);
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

  if (!isResolved) {
    return (
      <section className="panel">
        <p className="eyebrow">Profile</p>
        <h1>프로필 관리</h1>
        <div className="message">로그인 상태를 확인하고 있습니다.</div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="panel">
        <p className="eyebrow">Profile</p>
        <h1>프로필 관리</h1>
        <div className="message">
          프로필을 관리하려면 <Link href="/login">로그인</Link>이 필요합니다.
        </div>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="panel">
        <p className="eyebrow">Profile</p>
        <h1>프로필 관리</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          판매자/관리자 사이트에서 보이는 이름, 프로필 사진, 로그인 비밀번호를
          여기에서 함께 관리할 수 있습니다.
        </p>

        <div
          style={{
            display: "grid",
            gap: 16,
            marginTop: 20,
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  background:
                    "linear-gradient(135deg, rgba(31,78,121,0.14), rgba(31,78,121,0.22))",
                  border: "1px solid rgba(31, 78, 121, 0.16)",
                  borderRadius: "999px",
                  boxShadow: "0 18px 36px rgba(31, 78, 121, 0.12)",
                  color: "#1f4e79",
                  display: "flex",
                  fontSize: "2.2rem",
                  fontWeight: 800,
                  height: 132,
                  justifyContent: "center",
                  overflow: "hidden",
                  width: 132,
                }}
              >
                {safeProfileImageUrl && !profileImageFailed ? (
                  <img
                    alt={`${previewDisplayName} 프로필 사진`}
                    src={safeProfileImageUrl}
                    style={{
                      height: "100%",
                      objectFit: "cover",
                      width: "100%",
                    }}
                    onError={() => setProfileImageFailed(true)}
                  />
                ) : (
                  getUserInitial(user, previewDisplayName)
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <label htmlFor="admin-profile-display-name">표시 이름</label>
                <input
                  id="admin-profile-display-name"
                  className="input"
                  type="text"
                  autoComplete="nickname"
                  maxLength={60}
                  value={draftDisplayName}
                  onChange={(event) => {
                    setDraftDisplayName(event.target.value);
                    setProfileFeedback(null);
                  }}
                />
                <p className="muted" style={{ margin: 0, fontSize: "0.9em" }}>
                  주문, 이벤트, 프로필 카드에 보여지는 이름입니다.
                </p>
              </div>

              <div className="field">
                <label>계정 정보</label>
                <div className="message" style={{ margin: 0 }}>
                  {user.email ?? user.threadsUsername ?? "판매자 계정"}
                </div>
              </div>
            </div>
          </div>

          <div className="field">
            <label>프로필 사진</label>
            <p className="muted" style={{ margin: 0 }}>
              JPG, PNG, WEBP, GIF 파일을 올릴 수 있고, 최대 5MB까지
              지원합니다.
            </p>

            <input
              ref={fileInputRef}
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              type="file"
              onChange={handleFileChange}
            />

            <div className="actionRow">
              <button
                className="secondaryButton"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                사진 선택
              </button>

              {(draftFile || safeProfileImageUrl) && (
                <button
                  className="ghostButton"
                  type="button"
                  onClick={() => {
                    resetDraftState();
                    setProfileFeedback(null);
                  }}
                >
                  선택 해제
                </button>
              )}

              {user.profileImageUrl ? (
                <button
                  className="ghostButton"
                  type="button"
                  onClick={() => {
                    resetDraftState();
                    setUseDefaultAvatar(true);
                    setProfileFeedback(null);
                  }}
                >
                  기본 이미지 사용
                </button>
              ) : null}
            </div>

            <p className="muted" style={{ margin: 0, fontSize: "0.9em" }}>
              {draftFile
                ? `선택한 파일: ${draftFile.name}`
                : useDefaultAvatar
                  ? "기본 프로필 이미지로 저장할 예정입니다."
                  : "아직 새 파일을 선택하지 않았습니다."}
            </p>
          </div>

          <div className="actionRow">
            <button
              className="primaryButton"
              disabled={!hasPendingProfileChange || isSavingProfile}
              type="button"
              onClick={() => void handleProfileSave()}
            >
              {isSavingProfile ? "저장 중..." : "프로필 저장"}
            </button>
          </div>

          {profileFeedback ? (
            <div className="message">{profileFeedback}</div>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Security</p>
        <h2>{user.hasLocalPassword ? "비밀번호 변경" : "비밀번호 설정"}</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          {user.hasLocalPassword
            ? "현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다. 변경 후 다른 기기에서는 다시 로그인해야 합니다."
            : "이 계정은 아직 로컬 비밀번호가 없습니다. 새 비밀번호를 저장하면 이후 아이디와 비밀번호로 로그인할 수 있습니다."}
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          {user.hasLocalPassword ? (
            <div className="field">
              <label htmlFor="admin-profile-current-password">현재 비밀번호</label>
              <input
                id="admin-profile-current-password"
                className="input"
                type="password"
                autoComplete="current-password"
                maxLength={200}
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setPasswordFeedback(null);
                }}
              />
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="admin-profile-new-password">새 비밀번호</label>
            <input
              id="admin-profile-new-password"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={200}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setPasswordFeedback(null);
              }}
            />
            <p className="muted" style={{ margin: 0, fontSize: "0.9em" }}>
              {passwordRuleHint}
            </p>
          </div>

          <div className="field">
            <label htmlFor="admin-profile-new-password-confirm">
              새 비밀번호 확인
            </label>
            <input
              id="admin-profile-new-password-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={200}
              value={newPasswordConfirm}
              onChange={(event) => {
                setNewPasswordConfirm(event.target.value);
                setPasswordFeedback(null);
              }}
            />
          </div>

          <div className="actionRow">
            <button
              className="primaryButton"
              disabled={!hasPasswordInput || isSavingPassword}
              type="button"
              onClick={() => void handlePasswordSave()}
            >
              {isSavingPassword
                ? "저장 중..."
                : user.hasLocalPassword
                  ? "비밀번호 변경"
                  : "비밀번호 설정"}
            </button>
          </div>

          {passwordFeedback ? (
            <div className="message">{passwordFeedback}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
