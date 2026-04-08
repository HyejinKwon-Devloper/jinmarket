import type { EventDrawSourcePayload } from "../types";

type ErrorShape = {
  message?: string;
};

export class EventSourceRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventSourceRequestError";
  }
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as ErrorShape;
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Fall through to generic message.
  }

  return "이벤트 응모자 정보를 불러오지 못했어요.";
}

export async function requestEventDrawSource(
  eventId: string,
): Promise<EventDrawSourcePayload> {
  const response = await fetch(`/api/admin/events/${eventId}/draw-source`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new EventSourceRequestError(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as { item: EventDrawSourcePayload };
  return payload.item;
}
