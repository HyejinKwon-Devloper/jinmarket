"use client";

import { create } from "zustand";

import { sampleParticipantNames } from "../data/sampleParticipants";
import { requestDrawSession, DrawRequestError } from "../lib/draw-client";
import {
  requestEventDrawSource,
  EventSourceRequestError,
} from "../lib/event-source-client";
import {
  appendParticipantNames,
  normalizeParticipantName,
  sanitizeWinnerCount,
} from "../lib/participants";
import type {
  EventDrawSourcePayload,
  GameSession,
  ImportReport,
  Participant,
  ParticipantSourceContext,
  ResultRevealMode,
  ScreenStep,
  StatusMessage,
} from "../types";

type RandomGameState = {
  step: ScreenStep;
  participants: Participant[];
  winnerCount: number;
  revealMode: ResultRevealMode;
  currentSession: GameSession | null;
  lastImportReport: ImportReport | null;
  activeMessage: StatusMessage | null;
  participantSource: ParticipantSourceContext | null;
  isSourceLoading: boolean;
  isDrawPending: boolean;
  pendingDrawRequestId: string | null;
  pendingSourceRequestId: string | null;
  goToSetup: () => void;
  clearMessage: () => void;
  addParticipant: (name: string) => ImportReport;
  bulkAddParticipants: (bulkText: string) => ImportReport;
  loadSampleParticipants: () => ImportReport;
  removeParticipant: (participantId: string) => void;
  setWinnerCount: (value: number) => void;
  setRevealMode: (mode: ResultRevealMode) => void;
  setManualEventContext: (eventTitle?: string | null) => void;
  clearParticipantSource: () => void;
  loadEventParticipants: (eventId: string) => Promise<void>;
  prepareGame: () => Promise<boolean>;
  finishGame: () => void;
  reshuffle: () => Promise<boolean>;
  backToSetup: () => void;
  resetAll: () => void;
};

function emptyImportReport(): ImportReport {
  return {
    added: 0,
    skippedDuplicates: [],
    skippedEmpty: 0,
  };
}

function buildImportMessage(report: ImportReport): StatusMessage {
  if (report.added > 0) {
    return {
      tone: "success",
      title: `${report.added}명의 참가자를 추가했어요.`,
      description:
        report.skippedDuplicates.length > 0
          ? `중복 이름 ${report.skippedDuplicates.length}개는 자동으로 제외했어요.`
          : "이제 당첨 인원과 공개 방식을 정하면 바로 추첨을 시작할 수 있어요.",
    };
  }

  if (report.skippedDuplicates.length > 0) {
    return {
      tone: "warning",
      title: "새로 추가된 이름이 없어요.",
      description: "이미 등록된 이름은 한 번만 참가자 목록에 남겨둘게요.",
    };
  }

  return {
    tone: "error",
    title: "비어 있는 이름은 추가할 수 없어요.",
    description: "참가자 이름을 한 줄씩 입력해 주세요.",
  };
}

function buildLaunchMessage(mode: ResultRevealMode): StatusMessage {
  if (mode === "visible") {
    return {
      tone: "success",
      title: "즉시 공개 모드로 결과를 준비했어요.",
      description:
        "중앙 카드에서 당첨자를 차례대로 팝업해 보여줄게요.",
    };
  }

  return {
    tone: "info",
    title: "게임 리빌을 시작할게요.",
    description:
      "오브를 모으면 캐릭터가 행운 캡슐을 꺼내고 당첨 결과가 이어서 공개돼요.",
  };
}

function buildReshuffleMessage(mode: ResultRevealMode): StatusMessage {
  return mode === "visible"
    ? {
        tone: "info",
        title: "즉시 공개용 새 결과를 준비했어요.",
        description:
          "같은 참가자 리스트로 당첨 카드가 다시 중앙에서 순서대로 나타나요.",
      }
    : {
        tone: "info",
        title: "새 게임 세션을 준비했어요.",
        description:
          "같은 참가자 리스트로 다시 플레이해서 새로운 결과를 확인할 수 있어요.",
      };
}

function buildDrawFailureMessage(error: unknown): StatusMessage {
  const description =
    error instanceof DrawRequestError
      ? error.message
      : "서버 상태를 확인한 뒤 다시 시도해 주세요.";

  return {
    tone: "error",
    title: "추첨을 준비하지 못했어요.",
    description,
  };
}

function buildLockedParticipantMessage(
  source: EventDrawSourcePayload,
): StatusMessage {
  return {
    tone: "info",
    title: `${source.eventTitle} 응모자 ${source.participants.length}명을 불러왔어요.`,
    description:
      "구매자 사이트에서 응모한 리스트를 그대로 사용하므로 이 화면에서는 참가자를 수정할 수 없어요.",
  };
}

function buildEventSourceFailureMessage(error: unknown): StatusMessage {
  const description =
    error instanceof EventSourceRequestError
      ? error.message
      : "응모자 정보를 다시 불러와 주세요.";

  return {
    tone: "error",
    title: "이벤트 응모자 리스트를 가져오지 못했어요.",
    description,
  };
}

function createEventParticipants(source: EventDrawSourcePayload) {
  return source.participants.map((participant) => ({
    id: participant.id,
    name: participant.name,
    normalizedName: normalizeParticipantName(participant.name),
  }));
}

function defaultWinnerCount(participantCount: number) {
  return sanitizeWinnerCount(participantCount >= 3 ? 3 : 1, participantCount);
}

function lockedParticipantWarning(): StatusMessage {
  return {
    tone: "warning",
    title: "이 이벤트는 응모자 리스트가 잠겨 있어요.",
    description:
      "구매자 사이트에서 모은 응모자만 사용하므로 참가자 목록을 여기서 편집할 수 없어요.",
  };
}

export const useRandomGameStore = create<RandomGameState>((set, get) => ({
  step: "start",
  participants: [],
  winnerCount: 1,
  revealMode: "hidden",
  currentSession: null,
  lastImportReport: null,
  activeMessage: null,
  participantSource: null,
  isSourceLoading: false,
  isDrawPending: false,
  pendingDrawRequestId: null,
  pendingSourceRequestId: null,
  goToSetup: () => {
    set({ step: "setup", activeMessage: null });
  },
  clearMessage: () => {
    set({ activeMessage: null });
  },
  addParticipant: (name) => {
    const { participants, winnerCount, participantSource } = get();

    if (participantSource?.kind === "event") {
      const report = emptyImportReport();
      set({ activeMessage: lockedParticipantWarning() });
      return report;
    }

    const nextState = appendParticipantNames(participants, [name]);
    const nextWinnerCount = sanitizeWinnerCount(
      winnerCount === 1 && participants.length === 0 ? 2 : winnerCount,
      nextState.participants.length,
    );

    set({
      participants: nextState.participants,
      winnerCount: nextWinnerCount,
      lastImportReport: nextState.report,
      activeMessage: buildImportMessage(nextState.report),
      step: "setup",
    });

    return nextState.report;
  },
  bulkAddParticipants: (bulkText) => {
    const { participants, winnerCount, participantSource } = get();

    if (participantSource?.kind === "event") {
      const report = emptyImportReport();
      set({ activeMessage: lockedParticipantWarning() });
      return report;
    }

    const nextState = appendParticipantNames(
      participants,
      bulkText.split(/\r?\n/g),
    );
    const nextWinnerCount = sanitizeWinnerCount(
      winnerCount === 1 && participants.length === 0 ? 3 : winnerCount,
      nextState.participants.length,
    );

    set({
      participants: nextState.participants,
      winnerCount: nextWinnerCount,
      lastImportReport: nextState.report,
      activeMessage: buildImportMessage(nextState.report),
      step: "setup",
    });

    return nextState.report;
  },
  loadSampleParticipants: () => {
    const { participants, winnerCount, participantSource } = get();

    if (participantSource?.kind === "event") {
      const report = emptyImportReport();
      set({
        activeMessage: {
          tone: "warning",
          title: "이벤트 응모자 추첨에서는 샘플 데이터를 쓸 수 없어요.",
          description:
            "현재 이벤트에 접수된 실제 응모자 리스트만 사용해 추첨할게요.",
        },
      });
      return report;
    }

    const nextState = appendParticipantNames(participants, sampleParticipantNames);
    const nextWinnerCount = sanitizeWinnerCount(
      winnerCount === 1 && participants.length === 0 ? 3 : winnerCount,
      nextState.participants.length,
    );

    set({
      participants: nextState.participants,
      winnerCount: nextWinnerCount,
      lastImportReport: nextState.report,
      activeMessage: {
        tone: "success",
        title: "샘플 참가자를 채웠어요.",
        description:
          "테스트용 이름으로 바로 추첨 설정을 진행할 수 있어요.",
      },
      step: "setup",
    });

    return nextState.report;
  },
  removeParticipant: (participantId) => {
    const { participants, winnerCount, participantSource } = get();

    if (participantSource?.kind === "event") {
      set({ activeMessage: lockedParticipantWarning() });
      return;
    }

    const nextParticipants = participants.filter(
      (participant) => participant.id !== participantId,
    );

    set({
      participants: nextParticipants,
      winnerCount: sanitizeWinnerCount(winnerCount, nextParticipants.length),
      lastImportReport: null,
      activeMessage: null,
    });
  },
  setWinnerCount: (value) => {
    const participantCount = get().participants.length;
    set({
      winnerCount: sanitizeWinnerCount(value, participantCount),
    });
  },
  setRevealMode: (mode) => {
    set({ revealMode: mode });
  },
  setManualEventContext: (eventTitle) => {
    set((state) => ({
      participantSource: eventTitle
        ? {
            kind: "manual",
            eventTitle,
            sellerDisplayName:
              state.participantSource?.kind === "manual"
                ? state.participantSource.sellerDisplayName
                : null,
          }
        : null,
    }));
  },
  clearParticipantSource: () => {
    set({
      participantSource: null,
      isSourceLoading: false,
      pendingSourceRequestId: null,
      participants: [],
      winnerCount: 1,
      revealMode: "hidden",
      currentSession: null,
      lastImportReport: null,
      activeMessage: null,
      step: "start",
    });
  },
  loadEventParticipants: async (eventId) => {
    const currentSource = get().participantSource;

    if (currentSource?.kind === "event" && currentSource.eventId === eventId) {
      return;
    }

    const requestId = crypto.randomUUID();

    set({
      isSourceLoading: true,
      pendingSourceRequestId: requestId,
      activeMessage: null,
    });

    try {
      const source = await requestEventDrawSource(eventId);

      if (get().pendingSourceRequestId !== requestId) {
        return;
      }

      const participants = createEventParticipants(source);

      set({
        participantSource: {
          kind: "event",
          eventId: source.eventId,
          eventTitle: source.eventTitle,
          sellerDisplayName: source.sellerDisplayName,
          registrationMode: source.registrationMode,
          locked: true,
          entryCount: source.participants.length,
        },
        participants,
        winnerCount: defaultWinnerCount(participants.length),
        currentSession: null,
        lastImportReport: null,
        activeMessage: buildLockedParticipantMessage(source),
        isSourceLoading: false,
        pendingSourceRequestId: null,
        step: "setup",
      });
    } catch (error) {
      if (get().pendingSourceRequestId !== requestId) {
        return;
      }

      set({
        participantSource: null,
        isSourceLoading: false,
        pendingSourceRequestId: null,
        participants: [],
        winnerCount: 1,
        currentSession: null,
        lastImportReport: null,
        activeMessage: buildEventSourceFailureMessage(error),
        step: "start",
      });
    }
  },
  prepareGame: async () => {
    const { participants, winnerCount, revealMode, participantSource } = get();

    if (participants.length === 0) {
      set({
        step: "setup",
        activeMessage: {
          tone: "error",
          title: "먼저 참가자를 준비해 주세요.",
          description:
            "직접 입력하거나 이벤트 응모자 리스트를 불러온 뒤 다시 시작해 주세요.",
        },
      });

      return false;
    }

    const requestId = crypto.randomUUID();
    const safeWinnerCount = sanitizeWinnerCount(winnerCount, participants.length);

    set({
      isDrawPending: true,
      pendingDrawRequestId: requestId,
      activeMessage: null,
    });

    try {
      const { session } = await requestDrawSession(
        participantSource?.kind === "event"
          ? {
              eventId: participantSource.eventId,
              winnerCount: safeWinnerCount,
              revealMode,
            }
          : {
              participantNames: participants.map(
                (participant) => participant.name,
              ),
              winnerCount: safeWinnerCount,
              revealMode,
            },
      );

      if (get().pendingDrawRequestId !== requestId) {
        return false;
      }

      set({
        step: revealMode === "hidden" ? "game" : "result",
        currentSession: session,
        winnerCount: session.drawPlan.winners.length,
        activeMessage: buildLaunchMessage(revealMode),
        isDrawPending: false,
        pendingDrawRequestId: null,
      });

      return true;
    } catch (error) {
      if (get().pendingDrawRequestId !== requestId) {
        return false;
      }

      set({
        step: "setup",
        activeMessage: buildDrawFailureMessage(error),
        isDrawPending: false,
        pendingDrawRequestId: null,
      });

      return false;
    }
  },
  finishGame: () => {
    set({ step: "result" });
  },
  reshuffle: async () => {
    const { participants, winnerCount, revealMode, participantSource } = get();

    if (participants.length === 0) {
      set({
        step: "setup",
        activeMessage: {
          tone: "error",
          title: "참가자 목록이 비어 있어요.",
          description:
            "다시 시작하려면 먼저 참가자나 응모자 리스트를 준비해 주세요.",
        },
      });

      return false;
    }

    const requestId = crypto.randomUUID();
    const safeWinnerCount = sanitizeWinnerCount(winnerCount, participants.length);

    set({
      isDrawPending: true,
      pendingDrawRequestId: requestId,
      activeMessage: null,
    });

    try {
      const { session } = await requestDrawSession(
        participantSource?.kind === "event"
          ? {
              eventId: participantSource.eventId,
              winnerCount: safeWinnerCount,
              revealMode,
            }
          : {
              participantNames: participants.map(
                (participant) => participant.name,
              ),
              winnerCount: safeWinnerCount,
              revealMode,
            },
      );

      if (get().pendingDrawRequestId !== requestId) {
        return false;
      }

      set({
        step: revealMode === "hidden" ? "game" : "result",
        currentSession: session,
        winnerCount: session.drawPlan.winners.length,
        activeMessage: buildReshuffleMessage(revealMode),
        isDrawPending: false,
        pendingDrawRequestId: null,
      });

      return true;
    } catch (error) {
      if (get().pendingDrawRequestId !== requestId) {
        return false;
      }

      set({
        activeMessage: buildDrawFailureMessage(error),
        isDrawPending: false,
        pendingDrawRequestId: null,
      });

      return false;
    }
  },
  backToSetup: () => {
    set({
      step: "setup",
      activeMessage: null,
      isDrawPending: false,
      pendingDrawRequestId: null,
    });
  },
  resetAll: () => {
    const { participantSource, participants } = get();

    if (participantSource?.kind === "event") {
      set({
        step: "setup",
        participants,
        winnerCount: defaultWinnerCount(participants.length),
        revealMode: "hidden",
        currentSession: null,
        lastImportReport: null,
        activeMessage: {
          tone: "info",
          title: "응모자 리스트는 그대로 두고 초기화했어요.",
          description:
            "당첨 인원과 공개 방식만 다시 정해서 추첨을 시작할 수 있어요.",
        },
        isDrawPending: false,
        pendingDrawRequestId: null,
      });
      return;
    }

    if (participantSource?.kind === "manual") {
      set({
        step: "setup",
        participants: [],
        winnerCount: 1,
        revealMode: "hidden",
        currentSession: null,
        lastImportReport: null,
        activeMessage: {
          tone: "info",
          title: "수동 등록 이벤트를 다시 준비할게요.",
          description:
            "현장 참가자 이름을 다시 입력하고 추첨 설정을 새로 맞출 수 있어요.",
        },
        isDrawPending: false,
        pendingDrawRequestId: null,
      });
      return;
    }

    set({
      step: "start",
      participants: [],
      winnerCount: 1,
      revealMode: "hidden",
      currentSession: null,
      lastImportReport: null,
      activeMessage: null,
      participantSource: null,
      isSourceLoading: false,
      isDrawPending: false,
      pendingDrawRequestId: null,
      pendingSourceRequestId: null,
    });
  },
}));
