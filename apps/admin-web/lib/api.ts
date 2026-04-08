import { MAX_EVENT_IMAGES, MAX_PRODUCT_IMAGES } from "@jinmarket/shared";
import type {
  EventRegistrationMode,
  ProductStatus,
  PurchaseType,
  SellerAccessOverview,
  SessionUser,
  UploadSignatureResponse,
} from "@jinmarket/shared";

const defaultApiBaseUrl = "/api";

export const apiBaseUrl = defaultApiBaseUrl;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
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

export function isApprovalAdmin(user?: SessionUser | null) {
  return Boolean(user && user.roles.includes("ADMIN"));
}

export function hasSellerAccess(user?: SessionUser | null) {
  return Boolean(
    user && (user.roles.includes("SELLER") || isApprovalAdmin(user)),
  );
}

export async function fetchSellerAccessOverview() {
  return requestJson<SellerAccessOverview>("/admin/seller-access/me");
}

export async function uploadImages(files: File[]) {
  return uploadCloudinaryImages(files, MAX_PRODUCT_IMAGES);
}

export async function uploadEventImages(files: File[]) {
  return uploadCloudinaryImages(files, MAX_EVENT_IMAGES);
}

async function uploadCloudinaryImages(files: File[], maxCount: number) {
  if (files.length > maxCount) {
    throw new Error(`이미지는 최대 ${maxCount}장까지 업로드할 수 있습니다.`);
  }

  const signature = await requestJson<UploadSignatureResponse>("/uploads/sign", {
    method: "POST",
  });
  const uploads = await Promise.all(
    files.map(async (file, index) => {
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
        throw new Error(
          payload.error?.message ?? "Cloudinary 업로드에 실패했습니다.",
        );
      }

      return {
        imageUrl: payload.secure_url as string,
        providerPublicId: payload.public_id as string,
        width: payload.width as number,
        height: payload.height as number,
        bytes: payload.bytes as number,
        sortOrder: index + 1,
        isPrimary: index === 0,
      };
    }),
  );

  return uploads;
}

export function formatPrice(price: number) {
  return price <= 0 ? "무료 나눔" : `${price.toLocaleString("ko-KR")}원`;
}

export function purchaseTypeLabel(value: PurchaseType) {
  return value === "INSTANT_BUY" ? "즉시 구매" : "가위바위보 판매";
}

export function eventRegistrationModeLabel(value: EventRegistrationMode) {
  return value === "SHOP_ENTRY" ? "구매자 사이트 응모" : "직접 등록";
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
