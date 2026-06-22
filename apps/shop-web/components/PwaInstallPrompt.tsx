"use client";

import { useEffect, useMemo, useState } from "react";

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

type InstallMode = "prompt" | "ios" | "android-manual" | "desktop-safari" | "desktop-manual";
type ButtonVariant = "primary" | "outline" | "subtle";

type PlatformInfo = {
  isAndroid: boolean;
  isDesktop: boolean;
  isIos: boolean;
  isMacSafari: boolean;
};

type InstallGuide = {
  eyebrow: string;
  title: string;
  description: string;
  steps: string[];
  tip: string;
};

function detectPlatformInfo(): PlatformInfo {
  const platform = String(window.navigator?.platform ?? "").toLowerCase();
  const userAgent = String(window.navigator?.userAgent ?? "").toLowerCase();
  const maxTouchPoints = Number(window.navigator?.maxTouchPoints ?? 0);
  const isIos =
    /iphone|ipad|ipod/.test(userAgent) ||
    (platform === "macintel" && maxTouchPoints > 1);
  const isAndroid = /android/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome|chromium|android|edg|opr/.test(userAgent);
  const isMac = /mac/.test(platform) && !isIos;

  return {
    isAndroid,
    isDesktop: !isIos && !isAndroid,
    isIos,
    isMacSafari: isMac && isSafari
  };
}

function isStandaloneMode() {
  const navigatorWithStandalone = (window.navigator ?? {}) as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function getFallbackInstallMode(platformInfo: PlatformInfo): InstallMode {
  if (platformInfo.isIos) {
    return "ios";
  }

  if (platformInfo.isAndroid) {
    return "android-manual";
  }

  if (platformInfo.isMacSafari) {
    return "desktop-safari";
  }

  return "desktop-manual";
}

function getButtonLabel(mode: InstallMode, hasPrompt: boolean) {
  void mode;
  void hasPrompt;
  return "앱설치";
  if (hasPrompt) {
    return "앱 설치";
  }

  switch (mode) {
    case "ios":
      return "홈 화면에 추가";
    case "android-manual":
      return "홈 화면에 추가";
    case "desktop-safari":
      return "Dock에 추가";
    default:
      return "설치 방법 보기";
  }
}

function getInstallGuide(mode: InstallMode, hasPrompt: boolean): InstallGuide {
  if (hasPrompt) {
    return {
      eyebrow: "Install App",
      title: "설치 창이 열리면 바로 추가할 수 있어요",
      description: "버튼을 누르면 브라우저의 공식 설치 창이 열립니다.",
      steps: [
        "열리는 설치 창에서 JINMARKET 앱 추가를 확인하세요.",
        "설치가 끝나면 홈 화면이나 바탕화면에서 바로 실행할 수 있어요.",
        "설치 후에는 일반 웹 탭이 아니라 앱처럼 독립 창으로 열립니다."
      ],
      tip: "Chrome, Edge, Android 브라우저에서는 이 방식이 가장 빠릅니다."
    };
  }

  switch (mode) {
    case "ios":
      return {
        eyebrow: "iPhone / iPad",
        title: "공유 메뉴에서 홈 화면에 추가하세요",
        description: "iOS는 보안 정책상 웹페이지가 직접 설치를 실행할 수 없어서 한 번만 수동 확인이 필요합니다.",
        steps: [
          "Safari, Chrome, Edge에서 공유 버튼을 누르세요.",
          "메뉴에서 `홈 화면에 추가`를 선택하세요.",
          "추가를 누르면 JINMARKET 아이콘이 홈 화면에 생깁니다."
        ],
        tip: "한 번 추가하면 일반 앱처럼 전체 화면으로 열리고, 이후에는 푸시도 받을 수 있습니다."
      };
    case "android-manual":
      return {
        eyebrow: "Android",
        title: "브라우저 메뉴에서 앱으로 추가할 수 있어요",
        description: "설치 팝업이 아직 안 뜨더라도 브라우저 메뉴에서 바로 홈 화면 추가를 진행할 수 있습니다.",
        steps: [
          "Chrome 또는 Edge의 우상단 메뉴를 여세요.",
          "`앱 설치` 또는 `홈 화면에 추가`를 선택하세요.",
          "확인하면 홈 화면에 JINMARKET 아이콘이 생성됩니다."
        ],
        tip: "주소창 오른쪽 설치 아이콘이 보이면 그 버튼으로 더 빠르게 설치할 수 있습니다."
      };
    case "desktop-safari":
      return {
        eyebrow: "Safari on macOS",
        title: "Mac Dock에 앱처럼 추가할 수 있어요",
        description: "Safari는 자체 설치 창 대신 메뉴에서 Dock 추가를 제공합니다.",
        steps: [
          "Safari 상단 메뉴의 `파일`을 여세요.",
          "`Dock에 추가`를 선택하세요.",
          "추가 후 Dock 또는 Launchpad에서 JINMARKET을 바로 열 수 있습니다."
        ],
        tip: "Mac에서는 Safari와 Chromium 계열 브라우저가 가장 안정적으로 설치를 지원합니다."
      };
    default:
      return {
        eyebrow: "Desktop Web",
        title: "브라우저 설치 메뉴로 추가할 수 있어요",
        description: "브라우저가 직접 설치 창을 주지 않을 때는 메뉴에서 수동 설치가 가능합니다.",
        steps: [
          "주소창 오른쪽의 설치 아이콘이 보이면 먼저 눌러 보세요.",
          "없다면 브라우저 메뉴에서 `앱 설치`, `Install app`, 또는 `홈 화면에 추가`를 선택하세요.",
          "설치 후에는 바탕화면, 작업 표시줄, Dock 중 하나에서 바로 실행할 수 있습니다."
        ],
        tip: "데스크탑에서는 Chrome과 Edge가 가장 잘 지원하고, macOS Safari는 `파일 > Dock에 추가`를 사용합니다."
      };
  }
}

type PwaInstallPromptProps = {
  className?: string;
  showDismissButton?: boolean;
  variant?: ButtonVariant;
};

export function PwaInstallPrompt({
  className,
  showDismissButton = true,
  variant = "outline"
}: PwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMode, setInstallMode] = useState<InstallMode>("desktop-manual");
  const [isVisible, setIsVisible] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) {
      setIsVisible(false);
      return undefined;
    }

    const nextPlatformInfo = detectPlatformInfo();
    setPlatformInfo(nextPlatformInfo);
    setInstallMode(getFallbackInstallMode(nextPlatformInfo));
    setIsVisible(true);

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;

      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
      setInstallMode("prompt");
      setIsVisible(true);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setShowGuide(false);
      setIsVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const hasPrompt = Boolean(deferredPrompt);
  const guide = useMemo(() => getInstallGuide(installMode, hasPrompt), [hasPrompt, installMode]);

  if (!isVisible || !platformInfo) {
    return null;
  }

  async function handleInstall() {
    const activePlatformInfo = platformInfo ?? detectPlatformInfo();

    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
        setShowGuide(false);
        setIsVisible(false);
        return;
      }

      setDeferredPrompt(null);
      setInstallMode(getFallbackInstallMode(activePlatformInfo));
    }

    setShowGuide(true);
  }

  const button = (
    <Button className={className} type="button" variant={variant} onClick={() => void handleInstall()}>
      {getButtonLabel(installMode, hasPrompt)}
    </Button>
  );

  return (
    <>
      {showDismissButton ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--buyer-border)] bg-white/90 p-1 shadow-sm">
          {button}
          <button
            aria-label="설치 안내 닫기"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--buyer-muted)] transition hover:bg-[var(--buyer-soft)] hover:text-[var(--buyer-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
            type="button"
            onClick={() => {
              setIsVisible(false);
              setShowGuide(false);
            }}
          >
            <CloseIcon className="h-4 w-4" />
            <span className="sr-only">설치 안내 닫기</span>
          </button>
        </div>
      ) : (
        button
      )}

      {showGuide ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] border border-[var(--buyer-border)] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--buyer-primary)]">
              {guide.eyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)]">
              {guide.title}
            </h2>
            <p className="mt-4 text-sm leading-6 text-[var(--buyer-dark)]">{guide.description}</p>
            <ol className="mt-4 space-y-3 pl-5 text-sm leading-7 text-[var(--buyer-dark)]">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-4 text-sm leading-6 text-[var(--buyer-muted)]">{guide.tip}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" variant="primary" onClick={() => setShowGuide(false)}>
                확인했어요
              </Button>
              <Button
                type="button"
                variant="subtle"
                onClick={() => {
                  setShowGuide(false);
                  setIsVisible(false);
                }}
              >
                지금은 닫기
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
