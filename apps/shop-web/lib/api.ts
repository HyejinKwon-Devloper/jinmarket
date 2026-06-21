import type {
  ProductStatus,
  PurchaseType,
  SessionUser,
  UploadSignatureResponse,
} from "@jinmarket/shared";

const defaultApiBaseUrl = "/api";
const buyerProfileUpdatedEventName = "jinmarket:buyer-profile-updated";
const csrfHeaderName = "x-jinmarket-csrf";
const csrfHeaderValue = "1";

export const apiBaseUrl = defaultApiBaseUrl;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const includeCsrfHeader = !["GET", "HEAD", "OPTIONS"].includes(method);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(includeCsrfHeader ? { [csrfHeaderName]: csrfHeaderValue } : {}),
      ...(init?.headers ?? {}),
    },
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
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({ user: null }))) as {
    user: SessionUser | null;
  };
  return payload.user;
}

export function notifyBuyerProfileUpdated(user: SessionUser) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<{ user: SessionUser }>(buyerProfileUpdatedEventName, {
      detail: { user },
    }),
  );
}

export function subscribeBuyerProfileUpdated(
  onUpdate: (user: SessionUser) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleUpdate = (event: Event) => {
    const customEvent = event as CustomEvent<{ user: SessionUser }>;

    if (customEvent.detail?.user) {
      onUpdate(customEvent.detail.user);
    }
  };

  window.addEventListener(buyerProfileUpdatedEventName, handleUpdate);
  return () =>
    window.removeEventListener(buyerProfileUpdatedEventName, handleUpdate);
}

type UploadedAsset = {
  bytes: number;
  height: number;
  imageUrl: string;
  providerPublicId: string;
  width: number;
};

export async function uploadProfileImage(file: File): Promise<UploadedAsset> {
  const signature = await requestJson<UploadSignatureResponse>(
    "/me/profile-image/sign",
    {
      method: "POST",
    },
  );
  const formData = new FormData();

  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("signature", signature.signature);
  formData.append("folder", signature.folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
    {
      method: "POST",
      body: formData,
    },
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new ApiError(
      payload.error?.message ?? "프로필 사진 업로드에 실패했습니다.",
    );
  }

  return {
    bytes: payload.bytes as number,
    height: payload.height as number,
    imageUrl: payload.secure_url as string,
    providerPublicId: payload.public_id as string,
    width: payload.width as number,
  };
}

export async function updateProfileImage(profileImageUrl: string | null) {
  return requestJson<{ message: string; user: SessionUser }>(
    "/me/profile-image",
    {
      method: "PATCH",
      body: JSON.stringify({ profileImageUrl }),
    },
  );
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
