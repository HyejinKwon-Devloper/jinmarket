"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useRandomGameStore } from "../store/useRandomGameStore";
import { ProgressPills } from "./ProgressPills";
import { GameScreen } from "./screens/GameScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { StartScreen } from "./screens/StartScreen";

const messageClasses = {
  info: "border-cyan-200/50 bg-cyan-100/90 text-cyan-950",
  success: "border-emerald-200/50 bg-emerald-100/90 text-emerald-950",
  warning: "border-amber-200/50 bg-amber-100/90 text-amber-950",
  error: "border-rose-200/50 bg-rose-100/90 text-rose-950",
};

function LoadingScreen({ title, description }: { title: string; description: string }) {
  return (
    <section className="grid h-full place-items-center rounded-[36px] border border-white/12 bg-white/10 p-6 text-white backdrop-blur">
      <div className="max-w-md text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/18 border-t-cyan-300" />
        <h2 className="mt-5 text-xl font-black tracking-tight sm:text-2xl">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/72">{description}</p>
      </div>
    </section>
  );
}

export function RandomGameApp() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");
  const eventTitle = searchParams.get("eventTitle");

  const step = useRandomGameStore((state) => state.step);
  const activeMessage = useRandomGameStore((state) => state.activeMessage);
  const clearMessage = useRandomGameStore((state) => state.clearMessage);
  const participantSource = useRandomGameStore(
    (state) => state.participantSource,
  );
  const isSourceLoading = useRandomGameStore((state) => state.isSourceLoading);
  const loadEventParticipants = useRandomGameStore(
    (state) => state.loadEventParticipants,
  );
  const setManualEventContext = useRandomGameStore(
    (state) => state.setManualEventContext,
  );
  const goToSetup = useRandomGameStore((state) => state.goToSetup);

  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  const shouldRenderHeader = step !== "game";
  const topPadding =
    step === "game"
      ? "calc(env(safe-area-inset-top, 0px) + 0.35rem)"
      : "calc(env(safe-area-inset-top, 0px) + 0.75rem)";

  useBodyScrollLock(true);

  useEffect(() => {
    if (!activeMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      clearMessage();
    }, 3600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeMessage, clearMessage]);

  useEffect(() => {
    if (eventId) {
      void loadEventParticipants(eventId);
      return;
    }

    if (eventTitle) {
      setManualEventContext(eventTitle);
      goToSetup();
    }
  }, [
    eventId,
    eventTitle,
    goToSetup,
    loadEventParticipants,
    setManualEventContext,
  ]);

  useEffect(() => {
    setHeaderCollapsed(step === "game" || step === "result");
  }, [step]);

  const handleScreenScroll = useCallback(
    (scrollTop: number) => {
      if (step === "game" || step === "result") {
        setHeaderCollapsed(true);
        return;
      }

      setHeaderCollapsed((previous) => {
        if (scrollTop <= 4) {
          return false;
        }

        if (scrollTop >= 24) {
          return true;
        }

        return previous;
      });
    },
    [step],
  );

  const currentScreen = useMemo(() => {
    if (isSourceLoading && eventId) {
      return (
        <LoadingScreen
          title="응모자 리스트를 불러오는 중이에요."
          description="판매자가 등록한 이벤트 응모 기록을 확인한 뒤, 랜덤 게임에 사용할 참가자 풀을 잠금 상태로 준비하고 있어요."
        />
      );
    }

    if (step === "start") {
      return <StartScreen onScrollTopChange={handleScreenScroll} />;
    }

    if (step === "setup") {
      return <SetupScreen onScrollTopChange={handleScreenScroll} />;
    }

    if (step === "game") {
      return <GameScreen />;
    }

    return <ResultScreen />;
  }, [eventId, handleScreenScroll, isSourceLoading, step]);

  const headerDescription =
    participantSource?.kind === "event"
      ? `${participantSource.eventTitle} 이벤트 응모자를 기준으로 추첨을 진행하고 있어요.`
      : participantSource?.kind === "manual" && participantSource.eventTitle
        ? `${participantSource.eventTitle} 이벤트용 현장 참가자를 수동으로 등록하고 있어요.`
        : "이벤트 응모자 추첨과 현장 추첨을 모두 처리할 수 있는 관리자 전용 랜덤 게임 화면이에요.";

  return (
    <div
      data-testid="random-game-shell"
      className="relative h-[100svh] overflow-hidden bg-[#071127] text-white"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(251,146,60,0.24),transparent_24%),linear-gradient(180deg,#09122d_0%,#061024_100%)]" />
      <div className="pointer-events-none absolute left-[-4rem] top-[8rem] h-64 w-64 rounded-full bg-cyan-300/16 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-6rem] right-[-2rem] h-72 w-72 rounded-full bg-pink-400/16 blur-3xl" />

      <div
        className="relative mx-auto flex h-[100svh] w-full max-w-6xl flex-col px-4 sm:px-6 lg:px-8"
        style={{
          paddingTop: topPadding,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
        }}
      >
        {shouldRenderHeader ? (
          <motion.header
            className="shrink-0 overflow-hidden"
            initial={false}
            animate={{
              opacity: headerCollapsed ? 0 : 1,
              y: headerCollapsed ? -18 : 0,
              height: headerCollapsed ? 0 : "auto",
              marginBottom: headerCollapsed ? 0 : 12,
            }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{ pointerEvents: headerCollapsed ? "none" : "auto" }}
          >
            <div className="flex flex-col gap-3 rounded-[24px] border border-white/12 bg-white/6 px-4 py-3 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-200/80 sm:text-xs">
                  Jinmarket Admin Lab
                </p>
                <h1 className="mt-1.5 text-base font-black tracking-tight text-white sm:text-2xl">
                  Arcade Winner Game
                </h1>
                <p className="mt-1.5 max-w-2xl text-xs leading-5 text-white/70 sm:text-sm sm:leading-6">
                  {headerDescription}
                </p>
              </div>

              <Link
                href="/events"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/14 bg-white/8 px-4 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/12"
              >
                이벤트 목록으로
              </Link>
            </div>
          </motion.header>
        ) : null}

        <div
          data-testid="random-game-progress"
          className={`shrink-0 ${step === "game" ? "mb-2" : "mb-3"}`}
        >
          <ProgressPills currentStep={step} />
        </div>

        {activeMessage ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 shrink-0 rounded-[20px] border px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.15)] ${messageClasses[activeMessage.tone]}`}
          >
            <p className="text-sm font-black">{activeMessage.title}</p>
            <p className="mt-1 text-sm leading-6 opacity-90">
              {activeMessage.description}
            </p>
          </motion.div>
        ) : null}

        <div
          data-testid={`random-game-step-${step}`}
          className="min-h-0 flex-1 overflow-hidden"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={
                isSourceLoading && eventId ? "loading" : `${step}-${eventId ?? eventTitle ?? "default"}`
              }
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18 }}
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="h-full"
            >
              {currentScreen}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
