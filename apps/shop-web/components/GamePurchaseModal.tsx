"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  GAME_PURCHASE_REQUIRED_WINS,
  type GameChoice,
  type GamePlayResult,
  type GamePurchaseProgress
} from "@jinmarket/shared";

const choiceOrder: GameChoice[] = ["SCISSORS", "ROCK", "PAPER"];

const choiceMeta: Record<GameChoice, { label: string; image: string; caption: string }> = {
  SCISSORS: {
    label: "가위",
    image: "/scissor.png",
    caption: "빠르게 먼저 끊어내기"
  },
  ROCK: {
    label: "바위",
    image: "/rock.png",
    caption: "단단하게 밀어붙이기"
  },
  PAPER: {
    label: "보",
    image: "/paper.jpg",
    caption: "부드럽게 감싸기"
  }
};

const announcerThemes = [
  {
    image: "/rock_usui.png",
    name: "우즈이",
    intro: "화려하게 한 판 붙어보자."
  },
  {
    image: "/scissor_obanai.png",
    name: "오바나이",
    intro: "집중해서 골라. 기회는 잘 써야 해."
  },
  {
    image: "/paper_kyo.png",
    name: "쿄쥬로",
    intro: "정정당당하게 시작해보자!"
  }
] as const;

type ModalPhase = "intro" | "select" | "loading" | "result";

function hashSeed(input: string) {
  return Array.from(input).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function formatProgressLabel(progress: GamePurchaseProgress) {
  const parts = [`${progress.wins}승`, `${progress.losses}패`];

  if (progress.draws > 0) {
    parts.push(`무승부 ${progress.draws}회`);
  }

  return parts.join(" / ");
}

function formatResultLabel(result: GamePlayResult["attempt"]["result"]) {
  switch (result) {
    case "WIN":
      return "승리";
    case "LOSE":
      return "패배";
    default:
      return "무승부";
  }
}

export function GamePurchaseModal({
  isOpen,
  seed,
  productTitle,
  isFreeShare,
  currentProgress,
  onClose,
  onPlay
}: {
  isOpen: boolean;
  seed: string;
  productTitle: string;
  isFreeShare: boolean;
  currentProgress: GamePurchaseProgress | null;
  onClose: () => void;
  onPlay: (choice: GameChoice) => Promise<GamePlayResult>;
}) {
  const [phase, setPhase] = useState<ModalPhase>("intro");
  const [selectedChoice, setSelectedChoice] = useState<GameChoice | null>(null);
  const [result, setResult] = useState<GamePlayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const theme = useMemo(
    () => announcerThemes[hashSeed(seed) % announcerThemes.length],
    [seed]
  );

  const activeProgress = result?.progress ?? currentProgress;
  const progressLabel = activeProgress ? formatProgressLabel(activeProgress) : "0승 / 0패";
  const completionLabel = isFreeShare ? "나눔 신청" : "구매";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setPhase("intro");
    setSelectedChoice(null);
    setResult(null);
    setError(null);
    setIsSubmitting(false);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && phase !== "loading") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, phase]);

  if (!isOpen) {
    return null;
  }

  async function handleConfirm() {
    if (!selectedChoice || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setPhase("loading");
    setError(null);

    try {
      const startedAt = Date.now();
      const nextResult = await onPlay(selectedChoice);
      const elapsed = Date.now() - startedAt;

      if (elapsed < 900) {
        await new Promise((resolve) => setTimeout(resolve, 900 - elapsed));
      }

      setResult(nextResult);
      setPhase("result");
    } catch (playError) {
      setError(playError instanceof Error ? playError.message : "가위바위보 진행에 실패했습니다.");
      setPhase("select");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startNextRound() {
    setSelectedChoice(null);
    setResult(null);
    setError(null);
    setPhase("select");
  }

  const speechMessage =
    phase === "intro"
      ? activeProgress?.totalRounds
        ? `현재 전적은 ${progressLabel}예요. 비기면 다시 하고, 먼저 ${GAME_PURCHASE_REQUIRED_WINS}승하면 ${completionLabel}이 확정됩니다.`
        : `비기면 다시 하고, 먼저 ${GAME_PURCHASE_REQUIRED_WINS}승하면 ${completionLabel}이 확정됩니다. 승패가 갈린 판 기준으로 최대 3판이에요.`
      : phase === "select"
        ? "가위, 바위, 보 중 하나를 골라 주세요."
        : phase === "loading"
          ? "상대 선택을 정하고 있어요. 잠깐만 기다려 주세요."
          : result?.message ?? "";

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onClick={() => {
        if (phase !== "loading") {
          onClose();
        }
      }}
    >
      <div
        className="rpsModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rps-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rpsModalHeader">
          <div>
            <p className="eyebrow">Rock Paper Scissors</p>
            <h2 id="rps-modal-title">
              {isFreeShare ? "무료 나눔 도전" : "가위바위보 구매 도전"}
            </h2>
          </div>
          <button
            type="button"
            className="rpsCloseButton"
            onClick={onClose}
            disabled={phase === "loading"}
            aria-label="가위바위보 팝업 닫기"
          >
            x
          </button>
        </div>

        <div className="rpsHeroCard">
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
            <p>{`${theme.intro} ${speechMessage}`}</p>
          </div>
        </div>

        <div className="rpsMetaBar">
          <span className="badge">상품 {productTitle}</span>
          <span className="badge">{GAME_PURCHASE_REQUIRED_WINS}승 선착</span>
          <span className="badge">비기면 재경기</span>
          {activeProgress ? <span className="badge">현재 {progressLabel}</span> : null}
        </div>

        {phase === "intro" ? (
          <div className="rpsActionArea">
            <p className="muted">
              결과는 서버에서 바로 확정됩니다. 먼저 {GAME_PURCHASE_REQUIRED_WINS}승하면{" "}
              {completionLabel} 성공, {GAME_PURCHASE_REQUIRED_WINS}패면 도전 종료입니다.
            </p>
            <div className="actionRow">
              <button
                type="button"
                className="primaryButton"
                onClick={() => setPhase("select")}
              >
                {activeProgress?.totalRounds ? "다음 판 시작" : "게임 시작하기"}
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={onClose}
              >
                나중에 하기
              </button>
            </div>
          </div>
        ) : null}

        {phase === "select" ? (
          <div className="rpsActionArea">
            <div className="rpsChoiceGrid">
              {choiceOrder.map((choice) => {
                const meta = choiceMeta[choice];

                return (
                  <button
                    key={choice}
                    type="button"
                    className={`rpsChoiceCard ${selectedChoice === choice ? "selected" : ""}`}
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
                    <span>{meta.caption}</span>
                  </button>
                );
              })}
            </div>

            <div className="actionRow">
              <button
                type="button"
                className="primaryButton"
                disabled={!selectedChoice || isSubmitting}
                onClick={handleConfirm}
              >
                {selectedChoice ? `${choiceMeta[selectedChoice].label}로 확정` : "먼저 하나를 골라 주세요"}
              </button>
              <button
                type="button"
                className="ghostButton"
                disabled={isSubmitting}
                onClick={() => setPhase("intro")}
              >
                규칙 다시 보기
              </button>
            </div>
            {error ? <div className="message">{error}</div> : null}
          </div>
        ) : null}

        {phase === "loading" ? (
          <div className="rpsActionArea">
            <div className="rpsVersusBoard loading">
              <div className="rpsVersusCard">
                <span className="rpsVersusLabel">내 선택</span>
                {selectedChoice ? (
                  <Image
                    src={choiceMeta[selectedChoice].image}
                    alt={choiceMeta[selectedChoice].label}
                    width={88}
                    height={88}
                    className="rpsChoiceImage"
                  />
                ) : null}
                <strong>{selectedChoice ? choiceMeta[selectedChoice].label : ""}</strong>
              </div>
              <div className="rpsVersusCenter">VS</div>
              <div className="rpsVersusCard opponent">
                <span className="rpsVersusLabel">상대 선택</span>
                <div className="rpsOpponentPlaceholder">?</div>
                <strong>정하는 중...</strong>
              </div>
            </div>
          </div>
        ) : null}

        {phase === "result" && result ? (
          <div className="rpsActionArea">
            <div className="rpsVersusBoard">
              <div className="rpsVersusCard">
                <span className="rpsVersusLabel">내 선택</span>
                <Image
                  src={choiceMeta[result.attempt.playerChoice].image}
                  alt={choiceMeta[result.attempt.playerChoice].label}
                  width={88}
                  height={88}
                  className="rpsChoiceImage"
                />
                <strong>{choiceMeta[result.attempt.playerChoice].label}</strong>
              </div>
              <div className="rpsVersusCenter">VS</div>
              <div className="rpsVersusCard opponent">
                <span className="rpsVersusLabel">상대 선택</span>
                <Image
                  src={choiceMeta[result.attempt.systemChoice].image}
                  alt={choiceMeta[result.attempt.systemChoice].label}
                  width={88}
                  height={88}
                  className="rpsChoiceImage"
                />
                <strong>{choiceMeta[result.attempt.systemChoice].label}</strong>
              </div>
            </div>

            <div className={`rpsResultBanner ${result.attempt.result.toLowerCase()}`}>
              <span className="badge">{formatResultLabel(result.attempt.result)}</span>
              <strong>{result.message}</strong>
            </div>

            <p className="muted">현재 전적: {formatProgressLabel(result.progress)}</p>

            <div className="actionRow">
              {result.purchased ? (
                <button
                  type="button"
                  className="primaryButton"
                  onClick={onClose}
                >
                  {isFreeShare ? "나눔 신청 완료" : "구매 완료"}
                </button>
              ) : result.progress.canContinue ? (
                <>
                  <button
                    type="button"
                    className="primaryButton"
                    onClick={startNextRound}
                  >
                    {result.attempt.result === "DRAW" ? "다시 하기" : "다음 판 하기"}
                  </button>
                  <button
                    type="button"
                    className="ghostButton"
                    onClick={onClose}
                  >
                    여기까지 보기
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primaryButton"
                  onClick={onClose}
                >
                  확인
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
