"use client";

import { useEffect, useMemo, useState } from "react";

import { CloseIcon } from "./ui/Icons";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

type InstallMode =
  | "prompt"
  | "ios"
  | "android-manual"
  | "desktop-safari"
  | "desktop-manual";

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

type PwaInstallPromptProps = {
  className?: string;
  showDismissButton?: boolean;
  variant?: ButtonVariant;
};

const baseButtonClasses =
  "inline-flex min-h-10 items-center justify-center rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-55 sm:min-h-11 sm:px-4 sm:text-sm";

const variantClasses = {
  primary:
    "border-[var(--buyer-primary)] bg-[var(--buyer-primary)] text-white shadow-[0_14px_30px_rgba(31,78,121,0.18)] hover:bg-[var(--buyer-primary-strong)] hover:border-[var(--buyer-primary-strong)]",
  outline:
    "border-[var(--buyer-primary)] bg-white text-[var(--buyer-primary)] hover:bg-[var(--buyer-soft)]",
  subtle:
    "border-transparent bg-[var(--buyer-soft)] text-[var(--buyer-dark)] hover:bg-[var(--buyer-soft-strong)]",
} as const;

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function detectPlatformInfo(): PlatformInfo {
  const platform = String(window.navigator?.platform ?? "").toLowerCase();
  const userAgent = String(window.navigator?.userAgent ?? "").toLowerCase();
  const maxTouchPoints = Number(window.navigator?.maxTouchPoints ?? 0);
  const isIos =
    /iphone|ipad|ipod/.test(userAgent) ||
    (platform === "macintel" && maxTouchPoints > 1);
  const isAndroid = /android/.test(userAgent);
  const isSafari =
    /safari/.test(userAgent) &&
    !/chrome|chromium|android|edg|opr/.test(userAgent);
  const isMac = /mac/.test(platform) && !isIos;

  return {
    isAndroid,
    isDesktop: !isIos && !isAndroid,
    isIos,
    isMacSafari: isMac && isSafari,
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
  if (hasPrompt) {
    return "앱 설치";
  }

  switch (mode) {
    case "ios":
      return "앱 설치";
    case "android-manual":
      return "앱 설치";
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
      title: "설치 창이 열리면 바로 관리자 앱을 추가할 수 있어요.",
      description:
        "브라우저 공식 설치 창에서 JINMARKET Admin을 홈 화면이나 바탕화면에 등록할 수 있어요.",
      steps: [
        "열리는 설치 창에서 JINMARKET Admin 추가를 확인해 주세요.",
        "설치가 끝나면 홈 화면, 바탕화면, Dock에서 바로 실행할 수 있어요.",
        "설치 후에는 관리자 화면도 일반 탭이 아닌 앱 창처럼 더 깔끔하게 열립니다.",
      ],
      tip: "Chrome, Edge, Android 브라우저에서 가장 자연스럽게 설치할 수 있어요.",
    };
  }

  switch (mode) {
    case "ios":
      return {
        eyebrow: "iPhone / iPad",
        title: "공유 메뉴에서 관리자 앱을 설치하세요.",
        description:
          "iOS에서는 보안 정책상 웹페이지가 직접 설치를 실행하지 못해서 공유 메뉴에서 한 번 더 확인해 주셔야 해요.",
        steps: [
          "Safari, Chrome, Edge에서 공유 버튼을 눌러 주세요.",
          "메뉴에서 `앱 설치`를 선택해 주세요.",
          "추가를 누르면 관리자 앱 아이콘이 홈 화면에 생깁니다.",
        ],
        tip: "한 번 추가해 두면 일반 탭보다 앱처럼 더 안정적으로 열 수 있어요.",
      };
    case "android-manual":
      return {
        eyebrow: "Android",
        title: "브라우저 메뉴에서 관리자 앱을 홈 화면에 추가할 수 있어요.",
        description:
          "설치 팝업이 바로 뜨지 않아도 브라우저 메뉴에서 홈 화면 추가를 진행할 수 있어요.",
        steps: [
          "Chrome 또는 Edge의 오른쪽 상단 메뉴를 열어 주세요.",
          "`앱 설치`를 선택해 주세요.",
          "확인하면 관리자 앱 아이콘이 홈 화면에 생성됩니다.",
        ],
        tip: "주소창 쪽 설치 아이콘이 보이면 그 버튼으로 더 빠르게 설치할 수 있어요.",
      };
    case "desktop-safari":
      return {
        eyebrow: "Safari on macOS",
        title: "Mac Dock에 관리자 앱을 추가할 수 있어요.",
        description:
          "Safari에서는 자체 설치 팝업 대신 메뉴의 Dock 추가 기능을 사용할 수 있어요.",
        steps: [
          "Safari 상단 메뉴에서 `파일`을 열어 주세요.",
          "`Dock에 추가`를 선택해 주세요.",
          "추가 후에는 Dock 또는 Launchpad에서 관리자 앱을 바로 실행할 수 있어요.",
        ],
        tip: "Mac에서는 Safari와 Chromium 계열 브라우저가 가장 안정적으로 설치를 지원해요.",
      };
    default:
      return {
        eyebrow: "Desktop Web",
        title: "브라우저 설치 메뉴에서 관리자 앱을 추가할 수 있어요.",
        description:
          "브라우저가 직접 설치 창을 주지 않을 때도 메뉴에서 수동 설치가 가능해요.",
        steps: [
          "주소창 오른쪽 설치 아이콘이 보이면 먼저 눌러 보세요.",
          "없다면 브라우저 메뉴에서 `앱 설치`, `Install app`를 선택해 주세요.",
          "설치 후에는 바탕화면, 작업 표시줄, Dock 중 한 곳에서 바로 실행할 수 있어요.",
        ],
        tip: "데스크톱에서는 Chrome과 Edge가 가장 잘 지원되고, macOS Safari는 `파일 > Dock에 추가`를 사용하면 돼요.",
      };
  }
}

export function PwaInstallPromptUnified({
  className,
  showDismissButton = true,
  variant = "outline",
}: PwaInstallPromptProps) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
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
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const hasPrompt = Boolean(deferredPrompt);
  const guide = useMemo(
    () => getInstallGuide(installMode, hasPrompt),
    [hasPrompt, installMode],
  );

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
    <button
      className={classNames(
        baseButtonClasses,
        variantClasses[variant],
        className,
      )}
      type="button"
      onClick={() => void handleInstall()}
    >
      {getButtonLabel(installMode, hasPrompt)}
    </button>
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
            <p className="eyebrow">{guide.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.04em] text-[var(--buyer-dark)]">
              {guide.title}
            </h2>
            <p className="mt-4 text-sm leading-6 text-[var(--buyer-dark)]">
              {guide.description}
            </p>
            <ol className="mt-4 space-y-3 pl-5 text-sm leading-7 text-[var(--buyer-dark)]">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="mt-4 text-sm leading-6 text-[var(--buyer-muted)]">
              {guide.tip}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="primaryButton"
                type="button"
                onClick={() => setShowGuide(false)}
              >
                확인했어요
              </button>
              <button
                className="ghostButton"
                type="button"
                onClick={() => {
                  setShowGuide(false);
                  setIsVisible(false);
                }}
              >
                지금은 닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
