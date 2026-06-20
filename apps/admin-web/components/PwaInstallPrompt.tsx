"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
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
      <button className="ghostButton" type="button" onClick={() => void handleInstall()}>
        {isIosInstallFlow ? "홈 화면에 추가" : "앱 설치"}
      </button>

      {showIosSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-[var(--buyer-border)] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <p className="eyebrow">iPhone Install</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)]">
              판매자 센터를 홈 화면에 추가할 수 있어요.
            </h2>
            <ol className="mt-4 space-y-3 pl-5 text-sm leading-7 text-[var(--buyer-dark)]">
              <li>브라우저의 공유 버튼을 누르세요.</li>
              <li>메뉴에서 홈 화면에 추가를 선택하세요.</li>
              <li>추가 후 홈 화면의 JINMARKET Admin 아이콘으로 바로 열 수 있어요.</li>
            </ol>
            <p className="mt-4 text-sm leading-6 text-[var(--buyer-muted)]">
              iPhone과 iPad에서는 설치 후에만 웹 푸시 알림을 받을 수 있습니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="primaryButton" type="button" onClick={() => setShowIosSheet(false)}>
                확인했어요
              </button>
              <button
                className="ghostButton"
                type="button"
                onClick={() => {
                  setShowIosSheet(false);
                  setIsVisible(false);
                }}
              >
                나중에
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
