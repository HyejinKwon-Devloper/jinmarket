"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  LUCKY_RPS_TARGET_WINS,
  buildLoginHref,
  type GameChoice,
  type LuckyRpsPlayResult,
  type LuckyRpsRoundRecord,
  type LuckyRpsSessionRecord,
  type LuckyRpsStatusResponse,
  type SessionUser,
} from "@jinmarket/shared";

import { ApiError, requestJson } from "../lib/api";
import { cn } from "../lib/ui";
import { Badge } from "./ui/Badge";
import { LinkButton } from "./ui/Button";

const choiceOrder: GameChoice[] = ["SCISSORS", "ROCK", "PAPER"];

const choiceMeta: Record<GameChoice, { label: string; image: string }> = {
  SCISSORS: {
    label: "가위",
    image: "/scissor.png",
  },
  ROCK: {
    label: "바위",
    image: "/rock.png",
  },
  PAPER: {
    label: "보",
    image: "/paper.jpg",
  },
};

const announcerThemes = [
  {
    image: "/rock_usui.png",
    name: "우즈이",
    intro: "감 좋게 붙어 보자.",
  },
  {
    image: "/scissor_obanai.png",
    name: "이구로",
    intro: "짧고 굵게 끝내자.",
  },
  {
    image: "/paper_kyo.png",
    name: "쿄쥬로",
    intro: "호쾌하게 승부해 보자!",
  },
] as const;

function hashSeed(input: string) {
  return Array.from(input).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function formatRoundResult(result: LuckyRpsRoundRecord["result"]) {
  switch (result) {
    case "WIN":
      return "승리";
    case "LOSE":
      return "패배";
    default:
      return "무승부";
  }
}

function getLatestRound(session: LuckyRpsSessionRecord | null) {
  return session?.rounds[session.rounds.length - 1] ?? null;
}

function getHeroMessage(
  session: LuckyRpsSessionRecord | null,
  user: SessionUser | null,
) {
  if (!user) {
    return "로그인하면 3연승 결과와 당첨 여부가 계정에 저장돼요.";
  }

  if (!session) {
    return "가위, 바위, 보 중 하나를 골라.";
  }

  if (session.status === "WON") {
    return session.reward?.isGifticon
      ? "완벽한 3연승! 기프티콘 당첨까지 이어졌어요."
      : "완벽한 3연승! 오늘의 행운을 받아 가세요.";
  }

  if (session.status === "LOST") {
    return "이번 도전은 여기까지예요. 숨 고르고 다시 3연승에 도전해 보세요.";
  }

  const remainingWins = session.targetWins - session.wins;

  return remainingWins === 1
    ? "지금 2연승 중이에요. 마지막 한 판만 더 이기면 돼요."
    : "첫 승리를 챙겼어요. 남은 두 판도 이어서 승리해 보세요.";
}

function getProgressLabel(session: LuckyRpsSessionRecord | null) {
  if (!session) {
    return `0승 / ${LUCKY_RPS_TARGET_WINS}승`;
  }

  return `${session.wins}승 / ${session.targetWins}승`;
}

function getStatusBannerVariant(round: LuckyRpsRoundRecord["result"] | null) {
  if (round === "WIN") {
    return "win";
  }

  if (round === "LOSE") {
    return "lose";
  }

  if (round === "DRAW") {
    return "draw";
  }

  return "draw";
}

export function LuckyRpsGame({
  initialUser,
}: {
  initialUser: SessionUser | null;
}) {
  const [session, setSession] = useState<LuckyRpsSessionRecord | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<GameChoice | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(initialUser));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const theme = useMemo(
    () =>
      announcerThemes[
        hashSeed(initialUser?.id ?? initialUser?.displayName ?? "guest") %
          announcerThemes.length
      ],
    [initialUser?.displayName, initialUser?.id],
  );

  useEffect(() => {
    if (!initialUser) {
      setSession(null);
      setStatusMessage(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void requestJson<LuckyRpsStatusResponse>("/me/minigames/lucky-rps")
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setSession(payload.session);
        setStatusMessage(null);
        setError(null);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "행운의 가위바위보 상태를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  const latestRound = getLatestRound(session);
  const canPlay = !session || session.status === "IN_PROGRESS";
  const resultBannerVariant = getStatusBannerVariant(
    latestRound?.result ?? null,
  );
  const loginHref = buildLoginHref("/game");

  async function handlePlay() {
    if (!selectedChoice || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await requestJson<LuckyRpsPlayResult>(
        "/me/minigames/lucky-rps/play",
        {
          method: "POST",
          body: JSON.stringify({ playerChoice: selectedChoice }),
        },
      );

      setSession(result.session);
      setStatusMessage(result.message);
      setSelectedChoice(null);
    } catch (playError) {
      setError(
        playError instanceof ApiError || playError instanceof Error
          ? playError.message
          : "가위바위보 진행에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRestart() {
    setSession(null);
    setSelectedChoice(null);
    setStatusMessage("새로운 3연승 도전을 시작해 보세요.");
    setError(null);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
        <div className="rpsHeroCard !mt-0">
          <div className="rpsHostImageWrap">
            <Image
              src={theme.image}
              alt={theme.name}
              width={180}
              height={180}
              className="rpsHostImage"
            />
          </div>
          <div className="rpsSpeechBubble">
            <strong>{theme.name}</strong>
            <p>{`${theme.intro} ${getHeroMessage(session, initialUser)}`}</p>
          </div>
        </div>
      </section>

      {!initialUser ? (
        <section className="rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
          <div className="space-y-3">
            <Badge variant="warning">로그인 필요</Badge>
            <h2 className="text-xl font-extrabold tracking-[-0.03em] text-[var(--buyer-dark)] sm:text-2xl">
              행운의 가위바위보는 계정 기록형 게임이에요
            </h2>
            <div className="actionRow pt-1">
              <LinkButton href={loginHref}>로그인하고 도전하기</LinkButton>
            </div>
          </div>
        </section>
      ) : null}

      {session?.status === "WON" && session.reward ? (
        <section
          className={cn(
            "rounded-[26px] border p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6",
            session.reward.isGifticon
              ? "border-[var(--buyer-warning)] bg-[linear-gradient(180deg,rgba(255,247,214,0.96),rgba(255,255,255,1))]"
              : "border-[var(--buyer-success)] bg-[linear-gradient(180deg,rgba(235,255,242,0.92),rgba(255,255,255,1))]",
          )}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={session.reward.isGifticon ? "warning" : "success"}
              >
                {session.reward.isGifticon
                  ? "Gifticon Winner"
                  : "Today's Fortune"}
              </Badge>
              <Badge>{session.reward.code}</Badge>
            </div>
            <h2 className="text-[22px] font-extrabold tracking-[-0.03em] text-[var(--buyer-dark)] sm:text-3xl">
              {session.reward.title}
            </h2>
            <p className="max-w-[54ch] text-sm leading-7 text-[var(--buyer-ink)] sm:text-base">
              {session.reward.message}
            </p>
            {session.reward.isGifticon ? (
              <p className="text-sm font-semibold text-[var(--buyer-warning)]">
                축하합니다! 기프티콘 교환권에 당첨되셨어요. 이 화면을 캡처하셔서
                _nav.jin에게 연락주세요!
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      {canPlay ? (
        <section className="rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
                  Round Action
                </p>
                <h2 className="text-lg font-bold tracking-[-0.03em] text-[var(--buyer-ink)] sm:text-2xl">
                  {session?.wins
                    ? "다음 한 판을 고르세요"
                    : "첫 판을 시작해 보세요"}
                </h2>
              </div>
              <Badge variant="warning">무승부도 도전 종료</Badge>
            </div>

            {isLoading ? (
              <div className="grid place-items-center py-8">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--buyer-soft)] border-t-[var(--buyer-primary)]" />
              </div>
            ) : (
              <>
                <div className="rpsChoiceGrid">
                  {choiceOrder.map((choice) => {
                    const meta = choiceMeta[choice];

                    return (
                      <button
                        key={choice}
                        type="button"
                        className={cn(
                          "rpsChoiceCard",
                          selectedChoice === choice && "selected",
                        )}
                        disabled={isSubmitting}
                        onClick={() => setSelectedChoice(choice)}
                      >
                        <Image
                          src={meta.image}
                          alt={meta.label}
                          width={84}
                          height={84}
                          className="rpsChoiceImage"
                        />
                        <strong>{meta.label}</strong>
                      </button>
                    );
                  })}
                </div>

                <div className="actionRow">
                  <button
                    type="button"
                    className="primaryButton"
                    disabled={!selectedChoice || isSubmitting}
                    onClick={() => void handlePlay()}
                  >
                    {isSubmitting
                      ? "승부 보는 중..."
                      : selectedChoice
                        ? `${choiceMeta[selectedChoice].label}로 승부하기`
                        : "손 모양을 하나 골라 주세요"}
                  </button>
                </div>
              </>
            )}

            {error ? <div className="message">{error}</div> : null}
          </div>
        </section>
      ) : (
        <section className="rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
          <div className="space-y-3">
            <h2 className="text-lg font-bold tracking-[-0.03em] text-[var(--buyer-ink)] sm:text-2xl">
              {session?.status === "WON"
                ? "행운 문구를 확인했어요"
                : "이번 도전은 종료됐어요"}
            </h2>
            <p className="text-sm leading-6 text-[var(--buyer-muted)]">
              새로운 도전을 시작하면 새 세션으로 다시 3연승을 노릴 수 있어요.
            </p>
            <div className="actionRow">
              <button
                type="button"
                className="primaryButton"
                onClick={handleRestart}
              >
                새로 다시 도전하기
              </button>
            </div>
          </div>
        </section>
      )}

      {initialUser ? (
        <>
          <section className="rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
                  Progress
                </p>
                <h2 className="text-lg font-bold tracking-[-0.03em] text-[var(--buyer-ink)] sm:text-2xl">
                  {session?.status === "WON"
                    ? "오늘의 행운 오픈"
                    : session?.status === "LOST"
                      ? "도전 종료"
                      : "3연승 진행 중"}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={session?.status === "WON" ? "success" : "default"}
                >
                  {getProgressLabel(session)}
                </Badge>
                {session?.status === "LOST" ? (
                  <Badge variant="danger">다시 도전 가능</Badge>
                ) : null}
                {session?.reward?.isGifticon ? (
                  <Badge variant="warning">기프티콘 당첨</Badge>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: LUCKY_RPS_TARGET_WINS }, (_, index) => {
                const round = session?.rounds[index] ?? null;
                const roundVariant =
                  round?.result === "WIN"
                    ? "success"
                    : round?.result === "LOSE"
                      ? "danger"
                      : round?.result === "DRAW"
                        ? "warning"
                        : "default";

                return (
                  <div
                    key={`round-slot-${index + 1}`}
                    className={cn(
                      "h-full rounded-[22px] border p-4 shadow-sm",
                      round
                        ? round.result === "WIN"
                          ? "border-[var(--buyer-success)] bg-[var(--buyer-success-soft)]"
                          : round.result === "LOSE"
                            ? "border-[var(--buyer-danger)] bg-[var(--buyer-danger-soft)]"
                            : "border-[var(--buyer-warning)] bg-[var(--buyer-warning-soft)]"
                        : "border-[var(--buyer-border)] bg-[var(--buyer-softest)]",
                    )}
                  >
                    <div className="flex flex-wrap items-start gap-2 min-[420px]:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--buyer-primary)]">
                          Round {index + 1}
                        </p>
                        <p className="mt-1 text-base font-bold text-[var(--buyer-dark)]">
                          {round ? formatRoundResult(round.result) : "대기"}
                        </p>
                      </div>
                      <Badge
                        className="shrink-0 self-start"
                        variant={roundVariant}
                      >
                        {round ? choiceMeta[round.playerChoice].label : "준비"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-[12px] leading-5 text-[var(--buyer-muted)]">
                      {round
                        ? `${choiceMeta[round.playerChoice].label} vs ${choiceMeta[round.systemChoice].label}`
                        : "아직 선택하지 않은 라운드예요."}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {latestRound ? (
            <section className="rounded-[26px] border border-[var(--buyer-border)] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:rounded-[32px] sm:p-6">
              <div className="rpsVersusBoard">
                <div className="rpsVersusCard">
                  <span className="rpsVersusLabel">내 선택</span>
                  <Image
                    src={choiceMeta[latestRound.playerChoice].image}
                    alt={choiceMeta[latestRound.playerChoice].label}
                    width={88}
                    height={88}
                    className="rpsChoiceImage"
                  />
                  <strong>{choiceMeta[latestRound.playerChoice].label}</strong>
                </div>
                <div className="rpsVersusCenter">VS</div>
                <div className="rpsVersusCard opponent">
                  <span className="rpsVersusLabel">상대 선택</span>
                  <Image
                    src={choiceMeta[latestRound.systemChoice].image}
                    alt={choiceMeta[latestRound.systemChoice].label}
                    width={88}
                    height={88}
                    className="rpsChoiceImage"
                  />
                  <strong>{choiceMeta[latestRound.systemChoice].label}</strong>
                </div>
              </div>

              <div className={`rpsResultBanner ${resultBannerVariant}`}>
                <span className="badge">
                  {formatRoundResult(latestRound.result)}
                </span>
                <strong>
                  {statusMessage ??
                    (session?.status === "WON"
                      ? "행운 문구를 확인해 보세요."
                      : session?.status === "LOST"
                        ? "이번 도전은 종료됐어요. 다시 시작할 수 있어요."
                        : "다음 판을 이어서 진행해 보세요.")}
                </strong>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
