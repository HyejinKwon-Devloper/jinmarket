import { randomInt, randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { drawWinners } from "../../../../features/random-game/lib/draw";
import { createGameSession } from "../../../../features/random-game/lib/game-board";
import { normalizeParticipantName } from "../../../../features/random-game/lib/participants";
import type {
  DrawSessionRequest,
  DrawSessionResponse,
  EventDrawSourcePayload,
  Participant,
} from "../../../../features/random-game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DrawRouteError = {
  status: number;
  message: string;
};

function isRevealMode(value: unknown): value is DrawSessionRequest["revealMode"] {
  return value === "hidden" || value === "visible";
}

function createManualParticipant(name: string): Participant {
  return {
    id: randomUUID(),
    name,
    normalizedName: normalizeParticipantName(name),
  };
}

function parseRequestBody(payload: unknown): DrawSessionRequest {
  if (typeof payload !== "object" || payload === null) {
    throw {
      status: 400,
      message: "추첨 요청 형식이 올바르지 않습니다.",
    } satisfies DrawRouteError;
  }

  const candidate = payload as Partial<DrawSessionRequest>;

  if (!isRevealMode(candidate.revealMode)) {
    throw {
      status: 400,
      message: "결과 공개 방식이 올바르지 않습니다.",
    } satisfies DrawRouteError;
  }

  if (
    typeof candidate.winnerCount !== "number" ||
    !Number.isInteger(candidate.winnerCount)
  ) {
    throw {
      status: 400,
      message: "당첨 인원은 정수여야 합니다.",
    } satisfies DrawRouteError;
  }

  if (
    typeof candidate.eventId !== "string" &&
    !Array.isArray(candidate.participantNames)
  ) {
    throw {
      status: 400,
      message: "participantNames 또는 eventId 중 하나가 필요합니다.",
    } satisfies DrawRouteError;
  }

  return {
    participantNames: Array.isArray(candidate.participantNames)
      ? candidate.participantNames
      : undefined,
    eventId: typeof candidate.eventId === "string" ? candidate.eventId : undefined,
    winnerCount: candidate.winnerCount,
    revealMode: candidate.revealMode,
  };
}

function sanitizeManualParticipants(participantNames: string[]) {
  const normalizedNames = new Set<string>();
  const participants: Participant[] = [];

  for (const rawName of participantNames) {
    if (typeof rawName !== "string") {
      throw {
        status: 400,
        message: "참가자 이름 형식이 올바르지 않습니다.",
      } satisfies DrawRouteError;
    }

    const name = rawName.trim().replace(/\s+/g, " ");

    if (!name) {
      throw {
        status: 400,
        message: "빈 참가자 이름은 사용할 수 없습니다.",
      } satisfies DrawRouteError;
    }

    const normalizedName = normalizeParticipantName(name);

    if (normalizedNames.has(normalizedName)) {
      throw {
        status: 400,
        message: "중복된 참가자 이름이 포함되어 있습니다.",
      } satisfies DrawRouteError;
    }

    normalizedNames.add(normalizedName);
    participants.push(createManualParticipant(name));
  }

  if (participants.length === 0) {
    throw {
      status: 400,
      message: "최소 한 명 이상의 참가자가 필요합니다.",
    } satisfies DrawRouteError;
  }

  return participants;
}

function sanitizeEventParticipants(source: EventDrawSourcePayload) {
  const seenIds = new Set<string>();
  const participants: Participant[] = [];

  for (const candidate of source.participants) {
    if (
      typeof candidate?.id !== "string" ||
      typeof candidate?.name !== "string"
    ) {
      throw {
        status: 400,
        message: "이벤트 응모자 데이터 형식이 올바르지 않습니다.",
      } satisfies DrawRouteError;
    }

    const id = candidate.id.trim();
    const name = candidate.name.trim().replace(/\s+/g, " ");

    if (!id || !name) {
      throw {
        status: 400,
        message: "비어 있는 응모자 정보는 사용할 수 없습니다.",
      } satisfies DrawRouteError;
    }

    if (seenIds.has(id)) {
      throw {
        status: 400,
        message: "이벤트 응모자 목록에 중복 ID가 포함되어 있습니다.",
      } satisfies DrawRouteError;
    }

    seenIds.add(id);
    participants.push({
      id,
      name,
      normalizedName: normalizeParticipantName(name),
    });
  }

  if (participants.length === 0) {
    throw {
      status: 400,
      message: "이벤트 응모자가 아직 없습니다.",
    } satisfies DrawRouteError;
  }

  return participants;
}

async function loadEventDrawSource(request: NextRequest, eventId: string) {
  const target = new URL(`/api/admin/events/${eventId}/draw-source`, request.url);
  const response = await fetch(target, {
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw {
      status: response.status,
      message: payload.message ?? "이벤트 응모자 정보를 불러오지 못했습니다.",
    } satisfies DrawRouteError;
  }

  const payload = (await response.json()) as { item: EventDrawSourcePayload };
  return payload.item;
}

export async function POST(request: NextRequest) {
  try {
    let payload: DrawSessionRequest;

    try {
      payload = parseRequestBody(await request.json());
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          {
            message: "추첨 요청 본문을 읽지 못했습니다.",
          },
          {
            status: 400,
            headers: {
              "Cache-Control": "no-store",
            },
          },
        );
      }

      throw error;
    }

    const participants = payload.eventId
      ? sanitizeEventParticipants(
          await loadEventDrawSource(request, payload.eventId),
        )
      : sanitizeManualParticipants(payload.participantNames ?? []);

    if (payload.winnerCount < 1 || payload.winnerCount > participants.length) {
      return NextResponse.json(
        {
          message: "당첨 인원은 참가자 수를 초과할 수 없습니다.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const drawPlan = drawWinners(participants, payload.winnerCount, randomInt);
    const session = createGameSession(
      drawPlan,
      participants.length,
      payload.winnerCount,
      payload.revealMode,
    );

    return NextResponse.json<DrawSessionResponse>(
      { session },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const routeError = error as Partial<DrawRouteError>;

    return NextResponse.json(
      {
        message: routeError.message ?? "서버에서 추첨을 준비하지 못했습니다.",
      },
      {
        status: routeError.status ?? 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
