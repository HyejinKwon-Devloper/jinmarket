import type { ProductStatus, PurchaseType, SessionUser } from "@jinmarket/shared";

const defaultApiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api").replace(/\/+$/, "");

export const apiBaseUrl = defaultApiBaseUrl;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(payload.message ?? "요청에 실패했습니다.", payload.code);
  }

  return payload as T;
}

export async function fetchCurrentUser() {
  const response = await fetch(`${apiBaseUrl}/me`, {
    credentials: "include",
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({ user: null }))) as { user: SessionUser | null };
  return payload.user;
}

export function formatPrice(price: number) {
  return price <= 0 ? "무료 나눔" : `${price.toLocaleString("ko-KR")}원`;
}

export function purchaseTypeLabel(value: PurchaseType) {
  return value === "INSTANT_BUY" ? "즉시 구매" : "가위바위보";
}

export function statusLabel(value: ProductStatus) {
  switch (value) {
    case "OPEN":
      return "판매중";
    case "SOLD_OUT":
      return "품절";
    case "CANCELLED":
      return "취소";
    default:
      return "임시저장";
  }
}
