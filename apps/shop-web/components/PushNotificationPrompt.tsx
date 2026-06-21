"use client";

import { useEffect, useState } from "react";
import type { PushApp, WebPushSubscriptionPayload } from "@jinmarket/shared";

import { ApiError, requestJson } from "../lib/api";
import { Button } from "./ui/Button";

type PushConfigResponse = {
  configured: boolean;
  publicKey: string | null;
};

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

function toUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(normalized);

  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function PushNotificationPrompt({
  app,
  isLoggedIn,
}: {
  app: PushApp;
  isLoggedIn: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn || process.env.NODE_ENV !== "production") {
      return;
    }

    let cancelled = false;

    async function load() {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        return;
      }

      const config = await requestJson<PushConfigResponse>("/push/config");

      if (!config.configured || !config.publicKey || cancelled) {
        return;
      }

      setPublicKey(config.publicKey);
      setSupported(true);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (cancelled) {
        return;
      }

      setEnabled(Boolean(subscription));

      if (subscription) {
        await requestJson("/me/push-subscriptions", {
          method: "POST",
          body: JSON.stringify({
            app,
            subscription: subscription.toJSON() as WebPushSubscriptionPayload,
          }),
        });
      }
    }

    void load().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [app, isLoggedIn]);

  if (!isLoggedIn || process.env.NODE_ENV !== "production") {
    return null;
  }

  if (!supported) {
    return null;
  }

  async function handleEnable() {
    if (!publicKey) {
      setMessage("웹 푸시 공개 키가 아직 설정되지 않았습니다.");
      return;
    }

    if (isIosDevice() && !isStandaloneMode()) {
      setMessage("아이폰과 아이패드는 홈 화면에 추가한 뒤 알림을 켤 수 있어요.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setMessage(
          permission === "denied"
            ? "브라우저 알림 권한이 차단되어 있어요. 설정에서 다시 허용해 주세요."
            : "알림 권한 허용이 필요합니다.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toUint8Array(publicKey),
        }));

      await requestJson<{ message: string }>("/me/push-subscriptions", {
        method: "POST",
        body: JSON.stringify({
          app,
          subscription: subscription.toJSON() as WebPushSubscriptionPayload,
        }),
      });

      setEnabled(true);

      const result = await requestJson<{ message: string }>("/me/push-subscriptions/test", {
        method: "POST",
        body: JSON.stringify({ app }),
      });

      setMessage(result.message);
    } catch (error) {
      setMessage(getErrorMessage(error, "푸시 알림을 활성화하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setMessage(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await requestJson("/me/push-subscriptions", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setEnabled(false);
      setMessage("푸시 알림을 해제했습니다.");
    } catch (error) {
      setMessage(getErrorMessage(error, "푸시 알림을 해제하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setMessage(null);

    try {
      const result = await requestJson<{ message: string }>("/me/push-subscriptions/test", {
        method: "POST",
        body: JSON.stringify({ app }),
      });
      setMessage(result.message);
    } catch (error) {
      setMessage(getErrorMessage(error, "테스트 알림을 보내지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--buyer-border)] bg-white/90 p-1 shadow-sm">
        <Button
          className="min-h-10 px-3"
          type="button"
          variant={enabled ? "subtle" : "outline"}
          onClick={() => void (enabled ? handleDisable() : handleEnable())}
        >
          {busy ? "처리 중..." : enabled ? "알림 끄기" : "알림 켜기"}
        </Button>
        {enabled ? (
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold text-[var(--buyer-muted)] transition hover:bg-[var(--buyer-soft)] hover:text-[var(--buyer-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--buyer-accent)] focus-visible:ring-offset-2"
            type="button"
            onClick={() => void handleTest()}
          >
            테스트
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="px-2 text-xs leading-5 text-[var(--buyer-muted)]">{message}</p>
      ) : null}
    </div>
  );
}
