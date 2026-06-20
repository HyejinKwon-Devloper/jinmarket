"use client";

import { useEffect, useState } from "react";

import { Button } from "./ui/Button";
import { CloseIcon } from "./ui/Icons";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

function isIosDevice() {
  const platform = window.navigator.platform.toLowerCase();
  const userAgent = window.navigator.userAgent.toLowerCase();

  return (
    /iphone|ipad|ipod/.test(userAgent) ||
    (platform === "macintel" && window.navigator.maxTouchPoints > 1)
  );
}

function isStandaloneMode() {
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isIosInstallFlow, setIsIosInstallFlow] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) {
      setIsVisible(false);
      return undefined;
    }

    if (isIosDevice()) {
      setIsIosInstallFlow(true);
      setIsVisible(true);
      return undefined;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;

      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      setIsVisible(true);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsVisible(false);
      setShowIosSheet(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  async function handleInstall() {
    if (isIosInstallFlow) {
      setShowIosSheet(true);
      return;
    }

    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setIsVisible(false);
    setDeferredPrompt(null);
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--buyer-border)] bg-white/90 p-1 shadow-sm">
        <Button
          className="min-h-10 px-3"
          type="button"
          variant="outline"
          onClick={() => void handleInstall()}
        >
          {isIosInstallFlow ? "홈 화면에 추가" : "앱 설치"}
        </Button>
        <button
          aria-label="설치 안내 닫기"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--buyer-muted)] transition hover:bg-[var(--buyer-soft)] hover:text-[var(--buyer-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
          type="button"
          onClick={() => {
            setIsVisible(false);
            setShowIosSheet(false);
          }}
        >
          <CloseIcon className="h-4 w-4" />
          <span className="sr-only">설치 안내 닫기</span>
        </button>
      </div>

      {showIosSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-[var(--buyer-border)] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--buyer-primary)]">
              iPhone Install
            </p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)]">
              홈 화면에 추가하면 앱처럼 열려요.
            </h2>
            <ol className="mt-4 space-y-3 pl-5 text-sm leading-7 text-[var(--buyer-dark)]">
              <li>브라우저의 공유 버튼을 누르세요.</li>
              <li>메뉴에서 홈 화면에 추가를 선택하세요.</li>
              <li>추가 후 홈 화면의 JINMARKET 아이콘으로 바로 열 수 있어요.</li>
            </ol>
            <p className="mt-4 text-sm leading-6 text-[var(--buyer-muted)]">
              Safari, Chrome, Edge 모두 같은 방식으로 설치할 수 있습니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" variant="primary" onClick={() => setShowIosSheet(false)}>
                확인했어요
              </Button>
              <Button
                type="button"
                variant="subtle"
                onClick={() => {
                  setShowIosSheet(false);
                  setIsVisible(false);
                }}
              >
                나중에
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
