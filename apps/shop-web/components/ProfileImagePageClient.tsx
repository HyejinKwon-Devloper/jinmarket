"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@jinmarket/shared";

import {
  ApiError,
  notifyBuyerProfileUpdated,
  updateProfileImage,
  uploadProfileImage,
} from "../lib/api";
import { cn } from "../lib/ui";
import { ProfileAvatar } from "./ProfileAvatar";
import { Button, LinkButton } from "./ui/Button";

const maxProfileImageBytes = 5 * 1024 * 1024;
const allowedProfileImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function ProfileImagePageClient({
  initialUser,
}: {
  initialUser: SessionUser;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState(initialUser);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftPreviewUrl, setDraftPreviewUrl] = useState<string | null>(null);
  const [useDefaultAvatar, setUseDefaultAvatar] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (draftPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(draftPreviewUrl);
      }
    };
  }, [draftPreviewUrl]);

  const currentPreviewUrl = useMemo(() => {
    if (useDefaultAvatar) {
      return null;
    }

    return draftPreviewUrl ?? user.profileImageUrl;
  }, [draftPreviewUrl, useDefaultAvatar, user.profileImageUrl]);

  const hasPendingChange =
    draftFile !== null || (useDefaultAvatar && user.profileImageUrl !== null);

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
      setFeedback("JPG, PNG, WEBP, GIF 이미지 파일만 등록할 수 있습니다.");
      return;
    }

    if (selectedFile.size > maxProfileImageBytes) {
      setFeedback("프로필 사진은 5MB 이하 파일만 등록할 수 있습니다.");
      return;
    }

    setFeedback(null);
    setUseDefaultAvatar(false);
    setDraftFile(selectedFile);
    clearDraftPreview();
    setDraftPreviewUrl(URL.createObjectURL(selectedFile));
  }

  async function handleSave() {
    if (!hasPendingChange) {
      setFeedback("저장할 변경 사항이 없습니다.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      let nextProfileImageUrl: string | null = useDefaultAvatar
        ? null
        : user.profileImageUrl;

      if (draftFile) {
        const uploaded = await uploadProfileImage(draftFile);
        nextProfileImageUrl = uploaded.imageUrl;
      }

      const result = await updateProfileImage(nextProfileImageUrl);

      setUser(result.user);
      notifyBuyerProfileUpdated(result.user);
      resetDraftState();
      setFeedback(result.message);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "프로필 사진 저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleUseDefaultAvatar() {
    resetDraftState();
    setUseDefaultAvatar(true);
    setFeedback(null);
  }

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
              displayName={user.displayName}
              imageUrl={currentPreviewUrl}
              size="xl"
            />
            <div className="space-y-1">
              <p className="text-lg font-bold text-[var(--buyer-dark)]">
                {user.displayName}
              </p>
              <p className="text-sm text-[var(--buyer-muted)]">
                {user.email ?? user.threadsUsername ?? "구매자 계정"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
            Edit
          </p>
          <div className="mt-4 space-y-4">
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
                      setFeedback(null);
                    }}
                  >
                    선택 해제
                  </Button>
                )}

                {user.profileImageUrl && (
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
                    isSaving && "cursor-wait opacity-80",
                  )}
                  disabled={!hasPendingChange || isSaving}
                  type="button"
                  onClick={() => void handleSave()}
                >
                  {isSaving ? "저장 중..." : "저장하기"}
                </Button>
              </div>
            </div>

            {feedback ? (
              <div
                aria-live="polite"
                className="rounded-[20px] border border-[var(--buyer-border)] bg-[var(--buyer-softest)] px-4 py-3 text-sm leading-6 text-[var(--buyer-dark)]"
              >
                {feedback}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
