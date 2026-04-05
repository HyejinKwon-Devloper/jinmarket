export const MAX_PRODUCT_IMAGES = 3;

export const purchaseTypes = ["INSTANT_BUY", "GAME_CHANCE"] as const;
export type PurchaseType = (typeof purchaseTypes)[number];

export const productStatuses = ["DRAFT", "OPEN", "SOLD_OUT", "CANCELLED"] as const;
export type ProductStatus = (typeof productStatuses)[number];

export const gameChoices = ["ROCK", "PAPER", "SCISSORS"] as const;
export type GameChoice = (typeof gameChoices)[number];

export const gameResults = ["WIN", "LOSE", "DRAW"] as const;
export type GameResult = (typeof gameResults)[number];

export const orderStatuses = [
  "PENDING_CONTACT",
  "CONTACTED",
  "TRANSFER_PENDING",
  "COMPLETED",
  "CANCELLED"
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const orderSources = ["INSTANT_BUY", "GAME_CHANCE_WIN", "PRICE_OFFER_ACCEPTED"] as const;
export type OrderSource = (typeof orderSources)[number];

export const sellerAccessRequestStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export type SellerAccessRequestStatus = (typeof sellerAccessRequestStatuses)[number];

export interface SessionUser {
  id: string;
  displayName: string;
  email: string | null;
  threadsUsername: string | null;
  roles: string[];
}

export interface ProductImage {
  id?: string;
  imageUrl: string;
  providerPublicId: string;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductCard {
  id: string;
  title: string;
  description: string | null;
  priceKrw: number;
  isFreeShare: boolean;
  isAnonymous: boolean;
  allowPriceOffer: boolean;
  purchaseType: PurchaseType;
  status: ProductStatus;
  sellerDisplayName: string | null;
  primaryImageUrl: string | null;
  saleStartsAt: string;
  saleEndsAt: string | null;
  isSaleActive: boolean;
  createdAt: string;
}

export interface ProductDetail extends ProductCard {
  sellerId: string | null;
  images: ProductImage[];
  myGameAttempt?: GameAttemptRecord | null;
  soldOrder?: OrderRecord | null;
}

export interface GameAttemptRecord {
  id: string;
  productId: string;
  userId: string;
  userDisplayName?: string;
  playerChoice: GameChoice;
  systemChoice: GameChoice;
  result: GameResult;
  playedAt: string;
}

export interface OrderRecord {
  id: string;
  productId: string;
  productTitle: string;
  sellerId: string;
  sellerDisplayName?: string;
  sellerThreadsUsername?: string | null;
  buyerId: string;
  buyerDisplayName?: string;
  buyerThreadsUsername?: string | null;
  source: OrderSource;
  status: OrderStatus;
  orderedAt: string;
}

export interface PriceOfferRecord {
  id: string;
  productId: string;
  buyerId: string;
  buyerDisplayName?: string;
  buyerThreadsUsername?: string | null;
  offeredPriceKrw: number;
  note?: string | null;
  createdAt: string;
}

export interface SellerProductRecord extends ProductCard {
  soldOrderId?: string | null;
  soldBuyerDisplayName?: string | null;
  soldBuyerThreadsUsername?: string | null;
}

export interface CreateProductInput {
  title: string;
  description?: string;
  priceKrw: number;
  isFreeShare?: boolean;
  isAnonymous?: boolean;
  allowPriceOffer?: boolean;
  purchaseType: PurchaseType;
  saleStartsAt?: string;
  saleEndsAt?: string | null;
  images: ProductImage[];
}

export interface UpdateProductInput {
  title?: string;
  description?: string;
  priceKrw?: number;
  isFreeShare?: boolean;
  isAnonymous?: boolean;
  allowPriceOffer?: boolean;
  purchaseType?: PurchaseType;
  status?: ProductStatus;
  saleStartsAt?: string;
  saleEndsAt?: string | null;
  images?: ProductImage[];
}

export function resolveSafeReturnTo(rawTarget: string | null, fallbackPath: string, origin: string) {
  const fallback = new URL(fallbackPath, origin);

  if (!rawTarget) {
    return fallback.toString();
  }

  try {
    const parsed = new URL(rawTarget, origin);
    return parsed.origin === fallback.origin ? parsed.toString() : fallback.toString();
  } catch {
    return fallback.toString();
  }
}

export function buildThreadsLoginHref(targetUrl: string, apiBaseUrl = "/api") {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  return `${normalizedBaseUrl}/auth/threads/login?return_to=${encodeURIComponent(targetUrl)}`;
}

export interface GamePlayResult {
  attempt: GameAttemptRecord;
  purchased: boolean;
  order?: OrderRecord;
  message: string;
}

export interface CreatePriceOfferInput {
  offeredPriceKrw: number;
  note?: string;
}

export interface UploadSignatureResponse {
  cloudName: string;
  apiKey: string;
  folder: string;
  timestamp: number;
  signature: string;
}

export interface SellerAccessRequestRecord {
  id: string;
  userId: string;
  applicantDisplayName: string;
  applicantThreadsUsername?: string | null;
  status: SellerAccessRequestStatus;
  requestedAt: string;
  reviewedAt?: string | null;
  reviewerDisplayName?: string | null;
}

export interface SellerAccessOverview {
  canSell: boolean;
  isAdmin: boolean;
  latestRequest?: SellerAccessRequestRecord | null;
}
