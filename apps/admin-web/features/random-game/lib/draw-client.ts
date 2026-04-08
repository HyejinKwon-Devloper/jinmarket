import type { DrawSessionRequest, DrawSessionResponse } from "../types";

type DrawRequestErrorShape = {
  message?: string;
};

export class DrawRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawRequestError";
  }
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as DrawRequestErrorShape;
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Fall through to the generic message below.
  }

  return "추첨 요청을 처리하지 못했어요.";
}

export async function requestDrawSession(
  payload: DrawSessionRequest,
): Promise<DrawSessionResponse> {
  const response = await fetch("/api/random-game/draw", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new DrawRequestError(await parseErrorMessage(response));
  }

  return (await response.json()) as DrawSessionResponse;
}
