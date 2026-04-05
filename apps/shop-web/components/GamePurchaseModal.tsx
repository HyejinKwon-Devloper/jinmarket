"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { GameChoice, GamePlayResult } from "@jinmarket/shared";

const choiceOrder: GameChoice[] = ["SCISSORS", "ROCK", "PAPER"];

const choiceMeta: Record<
  GameChoice,
  { label: string; image: string; caption: string }
> = {
  SCISSORS: {
    label: "가위",
    image: "/scissor.png",
    caption: "빠르게 베는 한 수"
  },
  ROCK: {
    label: "바위",
    image: "/rock.png",
    caption: "단단하게 밀어붙이기"
  },
  PAPER: {
    label: "보",
    image: "/paper.jpg",
    caption: "부드럽게 덮어 승리"
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
    intro: "신중하게 골라. 기회는 한 번뿐이야."
  },
  {
    image: "/paper_kyo.png",
    name: "렌고쿠",
    intro: "열정적으로 승부를 시작하자!"
  }
] as const;

function hashSeed(input: string) {
  return Array.from(input).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

type ModalPhase = "intro" | "select" | "loading" | "result";

export function GamePurchaseModal({
  isOpen,
  seed,
  productTitle,
  isFreeShare,
  onClose,
  onPlay
}: {
  isOpen: boolean;
  seed: string;
  productTitle: string;
  isFreeShare: boolean;
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

  const resultLabel =
    result?.attempt.result === "WIN"
      ? "승리"
      : result?.attempt.result === "LOSE"
        ? "패배"
        : "무승부";

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
      setError(
        playError instanceof Error
          ? playError.message
          : "가위바위보 진행에 실패했습니다."
      );
      setPhase("select");
    } finally {
      setIsSubmitting(false);
    }
  }

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
            ×
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
            <p>
              {phase === "intro"
                ? `${theme.intro} ${isFreeShare ? "이기면 바로 나눔 신청이 완료돼." : "이기면 바로 구매가 확정돼."}`
                : phase === "select"
                  ? "가위를 낼지, 바위를 낼지, 보를 낼지 정하고 확정해."
                  : phase === "loading"
                    ? "상대가 손을 고르고 있어. 잠깐만 기다려."
                    : result?.message}
            </p>
          </div>
        </div>

        <div className="rpsMetaBar">
          <span className="badge">상품 {productTitle}</span>
          <span className="badge">
            {isFreeShare ? "승리 시 무료 나눔 신청" : "승리 시 즉시 구매 확정"}
          </span>
          <span className="badge">무승부도 이번 기회 종료</span>
        </div>

        {phase === "intro" ? (
          <div className="rpsActionArea">
            <p className="muted">
              선택은 한 번만 가능하며, 결과는 서버에서 바로 판정됩니다.
            </p>
            <div className="actionRow">
              <button
                type="button"
                className="primaryButton"
                onClick={() => setPhase("select")}
              >
                승부 시작하기
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={onClose}
              >
                나중에 도전
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
                {selectedChoice
                  ? `${choiceMeta[selectedChoice].label}로 확정`
                  : "손을 먼저 골라주세요"}
              </button>
              <button
                type="button"
                className="ghostButton"
                disabled={isSubmitting}
                onClick={() => setPhase("intro")}
              >
                다시 보기
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
                <strong>판정 중...</strong>
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
              <span className="badge">{resultLabel}</span>
              <strong>{result.message}</strong>
            </div>

            <div className="actionRow">
              <button
                type="button"
                className="primaryButton"
                onClick={onClose}
              >
                {result.purchased
                  ? isFreeShare
                    ? "나눔 신청 완료"
                    : "구매 완료"
                  : "확인"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
