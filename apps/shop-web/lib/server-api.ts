import { headers } from "next/headers";
import type {
  EventCard,
  OrderRecord,
  ProductCard,
  ProductDetail,
  SessionUser,
} from "@jinmarket/shared";

import { apiProxyTarget, sendNodeRequest } from "./proxy-http";

export class ServerApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

async function requestServerJson<T>(
  path: string,
  options: {
    includeCookies?: boolean;
    query?: Record<string, string | number | boolean | null | undefined>;
  } = {},
) {
  const target = new URL(`${apiProxyTarget}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }

    target.searchParams.set(key, String(value));
  }

  const requestHeaders: Record<string, string> = {
    accept: "application/json",
  };

  if (options.includeCookies) {
    const requestHeaderStore = await headers();
    const cookieHeader = requestHeaderStore.get("cookie");

    if (cookieHeader) {
      requestHeaders.cookie = cookieHeader;
    }
  }

  const response = await sendNodeRequest({
    target,
    method: "GET",
    headers: requestHeaders,
  });
  const rawBody = response.body.length > 0 ? response.body.toString("utf8") : "";
  const payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new ServerApiError(
      typeof payload.message === "string" ? payload.message : "요청에 실패했습니다.",
      response.statusCode,
    );
  }

  return payload as T;
}

export async function readCurrentUser() {
  const payload = await requestServerJson<{ user: SessionUser | null }>("/me", {
    includeCookies: true,
  });

  return payload.user;
}

export async function readProducts() {
  const payload = await requestServerJson<{ items: ProductCard[] }>("/products");
  return payload.items;
}

export async function readProductDetail(productId: string) {
  const payload = await requestServerJson<{ item: ProductDetail }>(`/products/${productId}`, {
    includeCookies: true,
  });

  return payload.item;
}

export async function readEvents() {
  const payload = await requestServerJson<{ items: EventCard[] }>("/events");
  return payload.items;
}

export async function readMyOrders() {
  const payload = await requestServerJson<{ items: OrderRecord[] }>("/me/orders", {
    includeCookies: true,
  });

  return payload.items;
}
