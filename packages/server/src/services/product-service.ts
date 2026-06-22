import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";

import {
  query,
  runWithSystemDbContext,
  withTransaction,
  type DbClient,
} from "@jinmarket/db";
import { MAX_PRODUCT_IMAGES } from "../../../shared/src/index.js";
import type {
  CreateProductInput,
  CreatePriceOfferInput,
  OrderRecord,
  ProductCard,
  ProductDetail,
  ProductImage,
  PriceOfferRecord,
  SessionUser,
  SellerProductRecord,
  UpdateProductInput,
  UploadSignatureResponse,
} from "../../../shared/src/index.js";

import { AppError, isPgUniqueError } from "../errors.js";
import { env } from "../env.js";
import { summarizeGamePurchaseSeries } from "../utils/rps.js";

import { safeUserLoginIdSql } from "./account-sql.js";
import { sendPushNotificationToUser } from "./push-service.js";
import { loadUserIdentityMap } from "./user-identity-service.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

const productImageSchema = z.object({
  imageUrl: z.string().url(),
  providerPublicId: z.string().min(1),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  bytes: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(1),
  isPrimary: z.boolean(),
});

const productImagesSchema = z
  .array(productImageSchema)
  .min(1)
  .max(MAX_PRODUCT_IMAGES);
const isoDateTimeSchema = z.string().datetime({ offset: true });

const createProductSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(5000).optional(),
  priceKrw: z.number().int().min(0),
  isFreeShare: z.boolean().default(false),
  isAnonymous: z.boolean().default(false),
  allowPriceOffer: z.boolean().default(false),
  purchaseType: z.enum(["INSTANT_BUY", "GAME_CHANCE"]),
  saleStartsAt: isoDateTimeSchema.optional(),
  saleEndsAt: isoDateTimeSchema.nullable().optional(),
  images: productImagesSchema,
});

const updateProductSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(5000).optional(),
  priceKrw: z.number().int().min(0).optional(),
  isFreeShare: z.boolean().optional(),
  isAnonymous: z.boolean().optional(),
  allowPriceOffer: z.boolean().optional(),
  purchaseType: z.enum(["INSTANT_BUY", "GAME_CHANCE"]).optional(),
  status: z.enum(["DRAFT", "OPEN", "SOLD_OUT", "CANCELLED"]).optional(),
  saleStartsAt: isoDateTimeSchema.optional(),
  saleEndsAt: isoDateTimeSchema.nullable().optional(),
  images: productImagesSchema.optional(),
});

const createPriceOfferSchema = z.object({
  offeredPriceKrw: z.number().int().positive(),
  note: z.string().trim().max(1000).optional(),
});

type ProductCardRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price_krw: number;
  is_free_share: boolean;
  is_anonymous: boolean;
  allow_price_offer: boolean;
  purchase_type: "INSTANT_BUY" | "GAME_CHANCE";
  status: "DRAFT" | "OPEN" | "SOLD_OUT" | "CANCELLED";
  seller_display_name: string | null;
  primary_image_url: string | null;
  sale_started_at: Date;
  sale_ends_at: Date | null;
  sale_active: boolean;
  created_at: Date;
  sold_order_id?: string | null;
  sold_buyer_display_name?: string | null;
  sold_buyer_threads_username?: string | null;
};

type ProductCardQueryRow = Omit<
  ProductCardRow,
  "seller_display_name" | "sold_buyer_display_name"
> & {
  sold_buyer_id?: string | null;
};

type ProductImageRow = {
  id: string;
  image_url: string;
  provider_public_id: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  sort_order: number;
  is_primary: boolean;
};

type GameAttemptRow = {
  id: string;
  product_id: string;
  user_id: string;
  user_display_name: string;
  player_choice: "ROCK" | "PAPER" | "SCISSORS";
  system_choice: "ROCK" | "PAPER" | "SCISSORS";
  result: "WIN" | "LOSE" | "DRAW";
  played_at: Date;
};

type GameAttemptQueryRow = Omit<GameAttemptRow, "user_display_name">;

type PriceOfferRow = {
  id: string;
  product_id: string;
  buyer_id: string;
  buyer_display_name: string;
  buyer_threads_username: string | null;
  offered_price_krw: number;
  note: string | null;
  created_at: Date;
};

type PriceOfferQueryRow = Omit<PriceOfferRow, "buyer_display_name">;

type OrderRow = {
  id: string;
  product_id: string;
  product_title: string;
  product_price_krw: number;
  seller_id: string;
  seller_display_name: string | null;
  seller_threads_username: string | null;
  buyer_id: string;
  buyer_display_name: string;
  buyer_threads_username: string | null;
  source: "INSTANT_BUY" | "GAME_CHANCE_WIN" | "PRICE_OFFER_ACCEPTED";
  status:
    | "PENDING_CONTACT"
    | "CONTACTED"
    | "TRANSFER_PENDING"
    | "COMPLETED"
    | "CANCELLED";
  ordered_at: Date;
};

type OrderQueryRow = Omit<
  OrderRow,
  "seller_display_name" | "buyer_display_name"
> & {
  seller_is_anonymous?: boolean;
};

function mapProductCard(row: ProductCardRow): ProductCard {
  const isAnonymousGroup = row.is_anonymous;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceKrw: row.price_krw,
    isFreeShare: row.is_free_share,
    isAnonymous: row.is_anonymous,
    allowPriceOffer: row.allow_price_offer,
    purchaseType: row.purchase_type,
    status: row.status,
    catalogGroupKey: isAnonymousGroup ? "anonymous" : `seller:${row.seller_id}`,
    catalogGroupLabel: isAnonymousGroup
      ? "익명 셀렉션"
      : (row.seller_display_name ?? "판매자 셀렉션"),
    sellerDisplayName: row.seller_display_name,
    primaryImageUrl: row.primary_image_url,
    saleStartsAt: row.sale_started_at.toISOString(),
    saleEndsAt: row.sale_ends_at ? row.sale_ends_at.toISOString() : null,
    isSaleActive: row.sale_active,
    createdAt: row.created_at.toISOString(),
  };
}

function mapProductImage(row: ProductImageRow): ProductImage {
  return {
    id: row.id,
    imageUrl: row.image_url,
    providerPublicId: row.provider_public_id,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
  };
}

function mapOrder(row: OrderRow) {
  return {
    id: row.id,
    productId: row.product_id,
    productTitle: row.product_title,
    productPriceKrw: row.product_price_krw,
    sellerId: row.seller_id,
    sellerDisplayName: row.seller_display_name ?? undefined,
    sellerThreadsUsername: row.seller_threads_username ?? undefined,
    buyerId: row.buyer_id,
    buyerDisplayName: row.buyer_display_name,
    buyerThreadsUsername: row.buyer_threads_username,
    source: row.source,
    status: row.status,
    orderedAt: row.ordered_at.toISOString(),
  };
}

function mapAttempt(row: GameAttemptRow) {
  return {
    id: row.id,
    productId: row.product_id,
    userId: row.user_id,
    userDisplayName: row.user_display_name,
    playerChoice: row.player_choice,
    systemChoice: row.system_choice,
    result: row.result,
    playedAt: row.played_at.toISOString(),
  };
}

function mapPriceOffer(row: PriceOfferRow): PriceOfferRecord {
  return {
    id: row.id,
    productId: row.product_id,
    buyerId: row.buyer_id,
    buyerDisplayName: row.buyer_display_name,
    buyerThreadsUsername: row.buyer_threads_username,
    offeredPriceKrw: row.offered_price_krw,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

async function hydrateProductCardRows(
  rows: ProductCardQueryRow[],
  client?: DbClient,
) {
  const identities = await loadUserIdentityMap(
    rows.flatMap((row) => [row.seller_id, row.sold_buyer_id]),
    client,
  );

  return rows.map((row) => ({
    ...row,
    seller_display_name: row.is_anonymous
      ? null
      : (identities.get(row.seller_id)?.displayName ?? null),
    sold_buyer_display_name: row.sold_buyer_id
      ? (identities.get(row.sold_buyer_id)?.displayName ?? null)
      : null,
  })) as ProductCardRow[];
}

async function hydrateAttemptRows(
  rows: GameAttemptQueryRow[],
  client?: DbClient,
) {
  const identities = await loadUserIdentityMap(
    rows.map((row) => row.user_id),
    client,
  );

  return rows.map((row) => {
    const user = identities.get(row.user_id);

    if (!user) {
      throw new Error("Failed to load game attempt user identity.");
    }

    return {
      ...row,
      user_display_name: user.displayName,
    } satisfies GameAttemptRow;
  });
}

async function hydratePriceOfferRows(
  rows: PriceOfferQueryRow[],
  client?: DbClient,
) {
  const identities = await loadUserIdentityMap(
    rows.map((row) => row.buyer_id),
    client,
  );

  return rows.map((row) => {
    const buyer = identities.get(row.buyer_id);

    if (!buyer) {
      throw new Error("Failed to load price offer buyer identity.");
    }

    return {
      ...row,
      buyer_display_name: buyer.displayName,
    } satisfies PriceOfferRow;
  });
}

async function hydrateOrderRows(rows: OrderQueryRow[], client?: DbClient) {
  const identities = await loadUserIdentityMap(
    rows.flatMap((row) => [row.seller_id, row.buyer_id]),
    client,
  );

  return rows.map((row) => {
    const seller = identities.get(row.seller_id);
    const buyer = identities.get(row.buyer_id);

    if (!buyer) {
      throw new Error("Failed to load order buyer identity.");
    }

    if (!row.seller_is_anonymous && !seller) {
      throw new Error("Failed to load order seller identity.");
    }

    return {
      ...row,
      seller_display_name: row.seller_is_anonymous
        ? null
        : (seller?.displayName ?? null),
      buyer_display_name: buyer.displayName,
    } satisfies OrderRow;
  });
}

async function resetProductSale(client: DbClient, productId: string) {
  await client.query(
    `
      UPDATE orders
      SET status = 'CANCELLED',
          cancelled_at = NOW(),
          updated_at = NOW()
      WHERE product_id = $1
        AND status <> 'CANCELLED'
    `,
    [productId],
  );

  await client.query(
    `
      UPDATE products
      SET sold_out_at = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [productId],
  );
}

function normalizeCreateProductInput(
  input: CreateProductInput,
): CreateProductInput {
  const normalizedInput: CreateProductInput = {
    ...input,
    saleStartsAt: input.saleStartsAt ?? new Date().toISOString(),
    saleEndsAt: input.saleEndsAt ?? null,
  };

  if (!normalizedInput.isFreeShare) {
    return normalizedInput;
  }

  return {
    ...normalizedInput,
    priceKrw: 0,
    allowPriceOffer: false,
  };
}

function normalizeUpdateProductInput(
  input: UpdateProductInput,
): UpdateProductInput {
  if (input.isFreeShare !== true) {
    return input;
  }

  return {
    ...input,
    priceKrw: 0,
    allowPriceOffer: false,
  };
}

function assertValidProductPricing(input: {
  isFreeShare?: boolean;
  priceKrw?: number;
}) {
  if (input.isFreeShare) {
    return;
  }

  if (input.priceKrw !== undefined && input.priceKrw <= 0) {
    throw new AppError(
      "무료 나눔이 아닌 상품 가격은 1원 이상이어야 합니다.",
      400,
    );
  }
}

function assertValidSalePeriod(input: {
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}) {
  if (!input.saleStartsAt || !input.saleEndsAt) {
    return;
  }

  if (
    new Date(input.saleEndsAt).getTime() <=
    new Date(input.saleStartsAt).getTime()
  ) {
    throw new AppError(
      "판매 종료 일시는 판매 시작 일시보다 뒤여야 합니다.",
      400,
    );
  }
}

function buildSaleActiveSql(tableAlias: string) {
  return `(
    COALESCE(${tableAlias}.published_at, ${tableAlias}.created_at) <= NOW()
    AND (${tableAlias}.sale_ends_at IS NULL OR ${tableAlias}.sale_ends_at >= NOW())
  )`;
}

function getSalePeriodSnapshot(input: {
  published_at: Date | null;
  created_at: Date;
  sale_ends_at: Date | null;
}) {
  return {
    saleStartsAt: (input.published_at ?? input.created_at).toISOString(),
    saleEndsAt: input.sale_ends_at ? input.sale_ends_at.toISOString() : null,
  };
}

function buildProductUpdateStatement(parsed: UpdateProductInput) {
  const assignments: string[] = [];
  const values: Array<string | number | boolean | null> = [];

  if (parsed.title !== undefined) {
    values.push(parsed.title);
    assignments.push(`title = $${values.length + 2}`);
  }

  if (parsed.description !== undefined) {
    values.push(parsed.description || null);
    assignments.push(`description = $${values.length + 2}`);
  }

  if (parsed.priceKrw !== undefined) {
    values.push(parsed.priceKrw);
    assignments.push(`price_krw = $${values.length + 2}`);
  }

  if (parsed.isFreeShare !== undefined) {
    values.push(parsed.isFreeShare);
    assignments.push(`is_free_share = $${values.length + 2}`);
  }

  if (parsed.isAnonymous !== undefined) {
    values.push(parsed.isAnonymous);
    assignments.push(`is_anonymous = $${values.length + 2}`);
  }

  if (parsed.allowPriceOffer !== undefined) {
    values.push(parsed.allowPriceOffer);
    assignments.push(`allow_price_offer = $${values.length + 2}`);
  }

  if (parsed.saleStartsAt !== undefined) {
    values.push(parsed.saleStartsAt);
    assignments.push(`published_at = $${values.length + 2}`);
  }

  if (parsed.saleEndsAt !== undefined) {
    values.push(parsed.saleEndsAt);
    assignments.push(`sale_ends_at = $${values.length + 2}`);
  }

  if (parsed.purchaseType !== undefined) {
    const purchaseTypeSql =
      parsed.purchaseType === "GAME_CHANCE"
        ? `'GAME_CHANCE'::product_purchase_type`
        : `'INSTANT_BUY'::product_purchase_type`;
    const gameTypeSql =
      parsed.purchaseType === "GAME_CHANCE"
        ? `'ROCK_PAPER_SCISSORS'::game_type`
        : "NULL";

    assignments.push(`purchase_type = ${purchaseTypeSql}`);
    assignments.push(`game_type = ${gameTypeSql}`);
  }

  if (parsed.status !== undefined) {
    values.push(parsed.status);
    assignments.push(`status = $${values.length + 2}`);
  }

  return { assignments, values };
}

function sanitizeCloudinaryPathSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getCloudinaryProductFolder(identity: {
  userId: string;
  threadsUsername?: string | null;
}) {
  const trimmed = env.CLOUDINARY_UPLOAD_FOLDER.replace(/\/+$/, "");
  const baseFolder = trimmed.endsWith("/products")
    ? trimmed.slice(0, Math.max(0, trimmed.length - "/products".length))
    : trimmed;
  const folderOwner = sanitizeCloudinaryPathSegment(
    identity.threadsUsername || identity.userId,
  );

  return `${baseFolder || "jinmarket"}/products/${folderOwner}`;
}

function getCloudinaryProfileFolder(identity: {
  userId: string;
  threadsUsername?: string | null;
}) {
  const trimmed = env.CLOUDINARY_UPLOAD_FOLDER.replace(/\/+$/, "");
  const baseFolder = trimmed.endsWith("/products")
    ? trimmed.slice(0, Math.max(0, trimmed.length - "/products".length))
    : trimmed;
  const folderOwner = sanitizeCloudinaryPathSegment(
    identity.threadsUsername || identity.userId,
  );

  return `${baseFolder || "jinmarket"}/profiles/${folderOwner}`;
}

function signCloudinaryFolderUpload(folder: string): UploadSignatureResponse {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    throw new AppError("Cloudinary 환경 변수가 아직 설정되지 않았습니다.", 500);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { folder, timestamp },
    env.CLOUDINARY_API_SECRET,
  );

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    folder,
    timestamp,
    signature,
  };
}

function assertValidProductImages(images: ProductImage[]) {
  if (images.length > MAX_PRODUCT_IMAGES) {
    throw new AppError(
      `상품 이미지는 최대 ${MAX_PRODUCT_IMAGES}개까지만 업로드할 수 있습니다.`,
      400,
    );
  }

  const primaryImages = images.filter((image) => image.isPrimary);
  if (primaryImages.length !== 1) {
    throw new AppError("상품 이미지는 하나만 설정할 수 있습니다.", 400);
  }
}

async function replaceProductImages(
  client: DbClient,
  productId: string,
  images: ProductImage[],
) {
  await client.query("DELETE FROM product_images WHERE product_id = $1", [
    productId,
  ]);

  for (const image of images) {
    await client.query(
      `
        INSERT INTO product_images (
          product_id,
          provider,
          provider_public_id,
          image_url,
          width,
          height,
          bytes,
          sort_order,
          is_primary
        )
        VALUES ($1, 'CLOUDINARY', $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        productId,
        image.providerPublicId,
        image.imageUrl,
        image.width ?? null,
        image.height ?? null,
        image.bytes ?? null,
        image.sortOrder,
        image.isPrimary,
      ],
    );
  }
}

async function destroyCloudinaryImages(publicIds: string[]) {
  if (publicIds.length === 0) {
    return;
  }

  await Promise.allSettled(
    publicIds.map((publicId) =>
      cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
      }),
    ),
  );
}

export async function listProducts() {
  const result = await query<ProductCardQueryRow>(
    `
      SELECT
        p.id,
        p.seller_id,
        p.title,
        p.description,
        p.price_krw,
        p.is_free_share,
        p.is_anonymous,
        p.allow_price_offer,
        p.purchase_type,
        p.status,
        COALESCE(p.published_at, p.created_at) AS sale_started_at,
        p.sale_ends_at,
        ${buildSaleActiveSql("p")} AS sale_active,
        p.created_at,
        pi.image_url AS primary_image_url
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
      WHERE p.status = 'OPEN'
        AND ${buildSaleActiveSql("p")}
      ORDER BY p.created_at DESC
    `,
  );

  return (await hydrateProductCardRows(result.rows)).map(mapProductCard);
}

export async function getProductDetail(
  productId: string,
  viewerId?: string | null,
): Promise<ProductDetail> {
  const productResult = await query<ProductCardQueryRow>(
    `
      SELECT
        p.id,
        p.seller_id,
        p.title,
        p.description,
        p.price_krw,
        p.is_free_share,
        p.is_anonymous,
        p.allow_price_offer,
        p.purchase_type,
        p.status,
        COALESCE(p.published_at, p.created_at) AS sale_started_at,
        p.sale_ends_at,
        ${buildSaleActiveSql("p")} AS sale_active,
        p.created_at,
        pi.image_url AS primary_image_url
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
      WHERE p.id = $1
    `,
    [productId],
  );

  const product = (await hydrateProductCardRows(productResult.rows))[0];

  if (!product) {
    throw new AppError("?곹뭹??李얠쓣 ???놁뒿?덈떎.", 404);
  }

  const imagesResult = await query<ProductImageRow>(
    `
      SELECT id, image_url, provider_public_id, width, height, bytes, sort_order, is_primary
      FROM product_images
      WHERE product_id = $1
      ORDER BY sort_order ASC
    `,
    [productId],
  );

  const attemptResult = viewerId
    ? await query<GameAttemptQueryRow>(
        `
          SELECT
            gpa.id,
            gpa.product_id,
            gpa.user_id,
            gpa.player_choice,
            gpa.system_choice,
            gpa.result,
            gpa.played_at
          FROM game_purchase_attempts gpa
          WHERE gpa.product_id = $1 AND gpa.user_id = $2
          ORDER BY gpa.played_at DESC, gpa.created_at DESC
        `,
        [productId, viewerId],
      )
    : { rows: [] as GameAttemptQueryRow[] };

  const myAttempts = (await hydrateAttemptRows(attemptResult.rows)).map(
    mapAttempt,
  );
  const myGameProgress = viewerId
    ? summarizeGamePurchaseSeries(myAttempts)
    : null;

  const orderResult = await query<OrderQueryRow>(
    `
      SELECT
        o.id,
        o.product_id,
        p.title AS product_title,
        p.price_krw AS product_price_krw,
        o.seller_id,
        CASE WHEN p.is_anonymous THEN NULL ELSE ${safeUserLoginIdSql("o.seller_id")} END AS seller_threads_username,
        o.buyer_id,
        ${safeUserLoginIdSql("o.buyer_id")} AS buyer_threads_username,
        p.is_anonymous AS seller_is_anonymous,
        o.source,
        o.status,
        o.ordered_at
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.product_id = $1
        AND o.status <> 'CANCELLED'
    `,
    [productId],
  );

  const hydratedOrders = await hydrateOrderRows(orderResult.rows);
  const soldOrder = hydratedOrders[0]
    ? hydratedOrders[0].buyer_id === viewerId || product.seller_id === viewerId
      ? mapOrder(hydratedOrders[0])
      : null
    : null;

  return {
    ...mapProductCard(product),
    sellerId:
      product.is_anonymous && product.seller_id !== viewerId
        ? null
        : product.seller_id,
    images: imagesResult.rows.map(mapProductImage),
    myGameAttempt: myAttempts[0] ?? null,
    myGameProgress,
    soldOrder,
  };
}

export async function createProduct(
  sellerId: string,
  input: CreateProductInput,
) {
  const parsed = normalizeCreateProductInput(
    createProductSchema.parse(input) as CreateProductInput,
  );
  assertValidProductPricing(parsed);
  assertValidSalePeriod(parsed);
  assertValidProductImages(parsed.images);

  if (!parsed.images.some((image) => image.isPrimary)) {
    throw new AppError("????대?吏瑜??섎굹 ?좏깮?댁빞 ?⑸땲??");
  }

  const productId = await withTransaction(async (client) => {
    const productResult = await client.query<{ id: string }>(
      `
        INSERT INTO products (
          seller_id,
          title,
          description,
          price_krw,
          is_free_share,
          is_anonymous,
          allow_price_offer,
          purchase_type,
          game_type,
          status,
          published_at,
          sale_ends_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::product_purchase_type,
          CASE
            WHEN $8::product_purchase_type = 'GAME_CHANCE'::product_purchase_type
              THEN 'ROCK_PAPER_SCISSORS'::game_type
            ELSE NULL
          END,
          'OPEN',
          $9,
          $10
        )
        RETURNING id
      `,
      [
        sellerId,
        parsed.title,
        parsed.description || null,
        parsed.priceKrw,
        parsed.isFreeShare ?? false,
        parsed.isAnonymous ?? false,
        parsed.allowPriceOffer,
        parsed.purchaseType,
        parsed.saleStartsAt,
        parsed.saleEndsAt,
      ],
    );

    const insertedProductId = productResult.rows[0].id;

    for (const image of parsed.images) {
      await client.query(
        `
          INSERT INTO product_images (
            product_id,
            provider,
            provider_public_id,
            image_url,
            width,
            height,
            bytes,
            sort_order,
            is_primary
          )
          VALUES ($1, 'CLOUDINARY', $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          insertedProductId,
          image.providerPublicId,
          image.imageUrl,
          image.width ?? null,
          image.height ?? null,
          image.bytes ?? null,
          image.sortOrder,
          image.isPrimary,
        ],
      );
    }

    return insertedProductId;
  });

  return getSellerProductDetail(sellerId, productId);
}

export async function updateProduct(
  sellerId: string,
  productId: string,
  input: UpdateProductInput,
) {
  const parsed = normalizeUpdateProductInput(
    updateProductSchema.parse(input) as UpdateProductInput,
  );
  assertValidProductPricing(parsed);
  if (parsed.saleStartsAt !== undefined || parsed.saleEndsAt !== undefined) {
    const currentProduct = await query<{
      published_at: Date | null;
      created_at: Date;
      sale_ends_at: Date | null;
    }>(
      `
        SELECT published_at, created_at, sale_ends_at
        FROM products
        WHERE id = $1 AND seller_id = $2
      `,
      [productId, sellerId],
    );

    const row = currentProduct.rows[0];

    if (!row) {
      throw new AppError("상품을 찾을 수 없습니다.", 404);
    }

    const currentSalePeriod = getSalePeriodSnapshot(row);
    assertValidSalePeriod({
      saleStartsAt: parsed.saleStartsAt ?? currentSalePeriod.saleStartsAt,
      saleEndsAt:
        parsed.saleEndsAt !== undefined
          ? parsed.saleEndsAt
          : currentSalePeriod.saleEndsAt,
    });
  }

  const { assignments, values } = buildProductUpdateStatement(parsed);

  if (assignments.length === 0) {
    throw new AppError("업데이트할 값이 없습니다.");
  }

  await query(
    `
      UPDATE products
      SET ${assignments.join(", ")}, updated_at = NOW()
      WHERE id = $1 AND seller_id = $2
    `,
    [productId, sellerId, ...values],
  );

  return getSellerProductDetail(sellerId, productId);
}

export async function updateSellerProduct(
  sellerId: string,
  productId: string,
  input: UpdateProductInput,
) {
  const parsed = normalizeUpdateProductInput(
    updateProductSchema.parse(input) as UpdateProductInput,
  );
  assertValidProductPricing(parsed);
  const nextImages = parsed.images;
  const isReopeningProduct = parsed.status === "OPEN";

  if (nextImages) {
    assertValidProductImages(nextImages);
  }

  const { assignments, values } = buildProductUpdateStatement(parsed);

  if (assignments.length === 0 && !nextImages) {
    throw new AppError("업데이트할 값이 없습니다.", 400);
  }

  let previousImagePublicIds: string[] = [];

  await withTransaction(async (client) => {
    const ownershipResult = await client.query<{
      seller_id: string;
      published_at: Date | null;
      created_at: Date;
      sale_ends_at: Date | null;
    }>(
      `
        SELECT seller_id, published_at, created_at, sale_ends_at
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
      [productId],
    );

    const ownerRow = ownershipResult.rows[0];

    if (!ownerRow) {
      throw new AppError("상품을 찾을 수 없습니다.", 404);
    }

    if (ownerRow.seller_id !== sellerId) {
      throw new AppError("해당 상품을 수정할 권한이 없습니다.", 403);
    }

    const currentSalePeriod = getSalePeriodSnapshot(ownerRow);
    assertValidSalePeriod({
      saleStartsAt: parsed.saleStartsAt ?? currentSalePeriod.saleStartsAt,
      saleEndsAt:
        parsed.saleEndsAt !== undefined
          ? parsed.saleEndsAt
          : currentSalePeriod.saleEndsAt,
    });

    if (assignments.length > 0) {
      await client.query(
        `
          UPDATE products
          SET ${assignments.join(", ")}, updated_at = NOW()
          WHERE id = $1 AND seller_id = $2
        `,
        [productId, sellerId, ...values],
      );
    }

    if (isReopeningProduct) {
      await resetProductSale(client, productId);
    }

    if (nextImages) {
      const imageResult = await client.query<{ provider_public_id: string }>(
        `
          SELECT provider_public_id
          FROM product_images
          WHERE product_id = $1
        `,
        [productId],
      );

      previousImagePublicIds = imageResult.rows.map(
        (row) => row.provider_public_id,
      );
      await replaceProductImages(client, productId, nextImages);
    }
  });

  if (previousImagePublicIds.length > 0) {
    await destroyCloudinaryImages(previousImagePublicIds);
  }

  return getSellerProductDetail(sellerId, productId);
}

export async function deleteProduct(sellerId: string, productId: string) {
  let imagePublicIds: string[] = [];

  await withTransaction(async (client) => {
    const productResult = await client.query<{ seller_id: string }>(
      `
        SELECT seller_id
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
      [productId],
    );

    const product = productResult.rows[0];

    if (!product) {
      throw new AppError("상품을 찾을 수 없습니다.", 404);
    }

    if (product.seller_id !== sellerId) {
      throw new AppError(
        "해당 상품의 판매자만 게임 시도를 조회할 수 있습니다.",
        403,
      );
    }

    const orderResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM orders
        WHERE product_id = $1
      `,
      [productId],
    );

    if (orderResult.rows[0]) {
      throw new AppError("이미 주문된 상품은 삭제할 수 없습니다.", 409);
    }

    const imageResult = await client.query<{ provider_public_id: string }>(
      `
        SELECT provider_public_id
        FROM product_images
        WHERE product_id = $1
      `,
      [productId],
    );

    imagePublicIds = imageResult.rows.map((row) => row.provider_public_id);

    await client.query(
      "DELETE FROM products WHERE id = $1 AND seller_id = $2",
      [productId, sellerId],
    );
  });

  if (imagePublicIds.length > 0) {
    await destroyCloudinaryImages(imagePublicIds);
  }
}

export async function listSellerProducts(
  sellerId: string,
): Promise<SellerProductRecord[]> {
  const result = await query<ProductCardQueryRow>(
    `
      SELECT
        p.id,
        p.seller_id,
        p.title,
        p.description,
        p.price_krw,
        p.is_free_share,
        p.is_anonymous,
        p.allow_price_offer,
        p.purchase_type,
        p.status,
        COALESCE(p.published_at, p.created_at) AS sale_started_at,
        p.sale_ends_at,
        ${buildSaleActiveSql("p")} AS sale_active,
        p.created_at,
        pi.image_url AS primary_image_url,
        o.id AS sold_order_id,
        o.buyer_id AS sold_buyer_id,
        ${safeUserLoginIdSql("o.buyer_id")} AS sold_buyer_threads_username
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
      LEFT JOIN orders o ON o.product_id = p.id AND o.status <> 'CANCELLED'
      WHERE p.seller_id = $1
      ORDER BY p.created_at DESC
    `,
    [sellerId],
  );

  const hydratedRows = await hydrateProductCardRows(result.rows);

  return hydratedRows.map((row) => ({
    ...mapProductCard(row),
    soldOrderId: row.sold_order_id ?? null,
    soldBuyerDisplayName: row.sold_buyer_display_name ?? null,
    soldBuyerThreadsUsername: row.sold_buyer_threads_username ?? null,
  }));
}

export async function getSellerProductDetail(
  sellerId: string,
  productId: string,
) {
  const product = await getProductDetail(productId, sellerId);

  if (product.sellerId !== sellerId) {
    throw new AppError("?대떦 ?곹뭹??蹂?沅뚰븳???놁뒿?덈떎.", 403);
  }

  return product;
}

export async function listProductGameAttempts(
  sellerId: string,
  productId: string,
) {
  const ownershipResult = await query<{ seller_id: string }>(
    "SELECT seller_id FROM products WHERE id = $1",
    [productId],
  );

  if (!ownershipResult.rows[0]) {
    throw new AppError("가격 제안을 찾을 수 없습니다.", 404);
  }

  if (ownershipResult.rows[0].seller_id !== sellerId) {
    throw new AppError(
      "해당 상품의 판매자만 게임 시도를 조회할 수 있습니다.",
      403,
    );
  }

  const result = await query<GameAttemptQueryRow>(
    `
      SELECT
        gpa.id,
        gpa.product_id,
        gpa.user_id,
        gpa.player_choice,
        gpa.system_choice,
        gpa.result,
        gpa.played_at
      FROM game_purchase_attempts gpa
      WHERE gpa.product_id = $1
      ORDER BY gpa.played_at DESC
    `,
    [productId],
  );

  return (await hydrateAttemptRows(result.rows)).map(mapAttempt);
}

export async function createPriceOffer(
  userId: string,
  productId: string,
  input: CreatePriceOfferInput,
) {
  const parsed = createPriceOfferSchema.parse(input);

  const result = await runWithSystemDbContext(() =>
    withTransaction(async (client) => {
      const productResult = await client.query<{
        title: string;
        seller_id: string;
        status: "DRAFT" | "OPEN" | "SOLD_OUT" | "CANCELLED";
        allow_price_offer: boolean;
        published_at: Date | null;
        created_at: Date;
        sale_ends_at: Date | null;
      }>(
        `
        SELECT title, seller_id, status, allow_price_offer, published_at, created_at, sale_ends_at
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
        [productId],
      );

      const product = productResult.rows[0];

      if (!product) {
        throw new AppError("가격 제안을 찾을 수 없습니다.", 404);
      }

      if (product.seller_id === userId) {
        throw new AppError("자신의 가격 제안은 수락할 수 없습니다.", 400);
      }

      if (product.status !== "OPEN") {
        throw new AppError(
          "판매 중이 아닌 상품의 가격 제안은 수락할 수 없습니다.",
          409,
        );
      }

      const now = Date.now();
      const saleStartsAt = (
        product.published_at ?? product.created_at
      ).getTime();
      const saleEndsAt = product.sale_ends_at?.getTime() ?? null;

      if (saleStartsAt > now) {
        throw new AppError("아직 판매 시작 전인 상품입니다.", 409);
      }

      if (saleEndsAt !== null && saleEndsAt < now) {
        throw new AppError("판매 기간이 종료된 상품입니다.", 409);
      }

      if (!product.allow_price_offer) {
        throw new AppError("???곹뭹? 媛寃??쒖븞??諛쏆? ?딆뒿?덈떎.", 400);
      }

      const inserted = await client.query<PriceOfferQueryRow>(
        `
        WITH inserted AS (
          INSERT INTO price_offers (product_id, buyer_id, offered_price_krw, note)
          VALUES ($1, $2, $3, $4)
          RETURNING id, product_id, buyer_id, offered_price_krw, note, created_at
        )
        SELECT
          inserted.id,
          inserted.product_id,
          inserted.buyer_id,
          ${safeUserLoginIdSql("inserted.buyer_id")} AS buyer_threads_username,
          inserted.offered_price_krw,
          inserted.note,
          inserted.created_at
        FROM inserted
      `,
        [productId, userId, parsed.offeredPriceKrw, parsed.note || null],
      );

      const hydratedOffer = (
        await hydratePriceOfferRows(inserted.rows, client)
      )[0];

      return {
        item: mapPriceOffer(hydratedOffer),
        sellerId: product.seller_id,
        productTitle: product.title,
        buyerDisplayName: hydratedOffer.buyer_display_name,
      };
    }),
  );

  try {
    await runWithSystemDbContext(() =>
      sendPushNotificationToUser({
        userId: result.sellerId,
        app: "ADMIN",
        title: "새 가격 제안이 도착했어요",
        body: `${result.buyerDisplayName}님이 ${result.productTitle}에 새 가격을 제안했어요.`,
        url: `/products/${productId}`,
        tag: `price-offer:${result.item.id}`,
      }),
    );
  } catch (error) {
    console.error("Failed to send seller price-offer push notification", error);
  }

  return result.item;
}

export async function listProductPriceOffers(
  sellerId: string,
  productId: string,
) {
  const ownershipResult = await query<{ seller_id: string }>(
    "SELECT seller_id FROM products WHERE id = $1",
    [productId],
  );

  if (!ownershipResult.rows[0]) {
    throw new AppError("가격 제안을 찾을 수 없습니다.", 404);
  }

  if (ownershipResult.rows[0].seller_id !== sellerId) {
    throw new AppError(
      "해당 상품의 판매자만 가격 제안을 조회할 수 있습니다.",
      403,
    );
  }

  const result = await query<PriceOfferQueryRow>(
    `
      SELECT
        po.id,
        po.product_id,
        po.buyer_id,
        ${safeUserLoginIdSql("po.buyer_id")} AS buyer_threads_username,
        po.offered_price_krw,
        po.note,
        po.created_at
      FROM price_offers po
      WHERE po.product_id = $1
      ORDER BY po.created_at DESC
    `,
    [productId],
  );

  return (await hydratePriceOfferRows(result.rows)).map(mapPriceOffer);
}

export async function acceptPriceOffer(
  sellerId: string,
  productId: string,
  offerId: string,
) {
  let acceptedOrder: OrderRecord | null = null;
  let acceptedBuyerId: string | null = null;
  let acceptedProductTitle: string | null = null;

  await runWithSystemDbContext(() =>
    withTransaction(async (client) => {
      const productResult = await client.query<{
        id: string;
        title: string;
        price_krw: number;
        seller_id: string;
        status: "DRAFT" | "OPEN" | "SOLD_OUT" | "CANCELLED";
        published_at: Date | null;
        created_at: Date;
        sale_ends_at: Date | null;
      }>(
        `
        SELECT id, title, price_krw, seller_id, status, published_at, created_at, sale_ends_at
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
        [productId],
      );

      const product = productResult.rows[0];

      if (!product) {
        throw new AppError("가격 제안을 찾을 수 없습니다.", 404);
      }

      if (product.seller_id !== sellerId) {
        throw new AppError("?대떦 ?곹뭹???먮ℓ 泥섎━??沅뚰븳???놁뒿?덈떎.", 403);
      }

      if (product.status !== "OPEN") {
        throw new AppError(
          "판매 중이 아닌 상품의 가격 제안은 수락할 수 없습니다.",
          409,
        );
      }

      const now = Date.now();
      const saleStartsAt = (
        product.published_at ?? product.created_at
      ).getTime();
      const saleEndsAt = product.sale_ends_at?.getTime() ?? null;

      if (saleStartsAt > now) {
        throw new AppError(
          "아직 판매 시작 전인 상품의 제안은 수락할 수 없습니다.",
          409,
        );
      }

      if (saleEndsAt !== null && saleEndsAt < now) {
        throw new AppError(
          "판매 기간이 종료된 상품의 제안은 수락할 수 없습니다.",
          409,
        );
      }

      const offerResult = await client.query<PriceOfferQueryRow>(
        `
        SELECT
          po.id,
          po.product_id,
          po.buyer_id,
          ${safeUserLoginIdSql("po.buyer_id")} AS buyer_threads_username,
          po.offered_price_krw,
          po.note,
          po.created_at
        FROM price_offers po
        WHERE po.id = $1 AND po.product_id = $2
        FOR UPDATE OF po
      `,
        [offerId, productId],
      );

      const offer = offerResult.rows[0]
        ? (await hydratePriceOfferRows(offerResult.rows, client))[0]
        : null;

      if (!offer) {
        throw new AppError("가격 제안을 찾을 수 없습니다.", 404);
      }

      if (offer.buyer_id === sellerId) {
        throw new AppError("자신의 가격 제안은 수락할 수 없습니다.", 400);
      }

      try {
        const orderResult = await client.query<OrderQueryRow>(
          `
          WITH inserted AS (
            INSERT INTO orders (product_id, seller_id, buyer_id, source, buyer_note)
            VALUES ($1, $2, $3, 'PRICE_OFFER_ACCEPTED', $4)
            RETURNING id, product_id, seller_id, buyer_id, source, status, ordered_at
          )
          SELECT
            inserted.id,
            inserted.product_id,
            $5::text AS product_title,
            $6::integer AS product_price_krw,
            inserted.seller_id,
            ${safeUserLoginIdSql("inserted.seller_id")} AS seller_threads_username,
            inserted.buyer_id,
            ${safeUserLoginIdSql("inserted.buyer_id")} AS buyer_threads_username,
            FALSE AS seller_is_anonymous,
            inserted.source,
            inserted.status,
            inserted.ordered_at
          FROM inserted
        `,
          [
            product.id,
            sellerId,
            offer.buyer_id,
            offer.note ?? null,
            product.title,
            product.price_krw,
          ],
        );

        const hydratedOrder = (
          await hydrateOrderRows(orderResult.rows, client)
        )[0];

        await client.query(
          `
          UPDATE products
          SET status = 'SOLD_OUT',
              sold_out_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
          [product.id],
        );

        acceptedOrder = mapOrder(hydratedOrder);
        acceptedBuyerId = hydratedOrder.buyer_id;
        acceptedProductTitle = hydratedOrder.product_title;
      } catch (error) {
        if (isPgUniqueError(error)) {
          throw new AppError("이미 처리된 가격 제안입니다.", 409);
        }

        throw error;
      }
    }),
  );

  if (!acceptedOrder) {
    throw new AppError("주문 생성에 실패했습니다.", 500);
  }

  const finalizedOrder = acceptedOrder as OrderRecord;

  if (acceptedBuyerId && acceptedProductTitle) {
    const buyerId = acceptedBuyerId;
    const productTitle = acceptedProductTitle;

    try {
      await runWithSystemDbContext(() =>
        sendPushNotificationToUser({
          userId: buyerId,
          app: "SHOP",
          title: "가격 제안이 수락되었어요",
          body: `${productTitle} 상품의 가격 제안이 수락되어 주문이 생성되었어요.`,
          url: "/my/orders",
          tag: `price-offer-accepted:${finalizedOrder.id}`,
        }),
      );
    } catch (error) {
      console.error(
        "Failed to send buyer price-offer acceptance push notification",
        error,
      );
    }
  }

  return {
    order: finalizedOrder,
    item: await getSellerProductDetail(sellerId, productId),
  };
}

export async function listSellerOrders(sellerId: string) {
  const result = await query<OrderQueryRow>(
    `
      SELECT
        o.id,
        o.product_id,
        p.title AS product_title,
        p.price_krw AS product_price_krw,
        o.seller_id,
        CASE WHEN p.is_anonymous THEN NULL ELSE ${safeUserLoginIdSql("o.seller_id")} END AS seller_threads_username,
        o.buyer_id,
        ${safeUserLoginIdSql("o.buyer_id")} AS buyer_threads_username,
        p.is_anonymous AS seller_is_anonymous,
        o.source,
        o.status,
        o.ordered_at
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.seller_id = $1
      ORDER BY o.ordered_at DESC
    `,
    [sellerId],
  );

  return (await hydrateOrderRows(result.rows)).map(mapOrder);
}

export async function listMyOrders(userId: string) {
  const result = await query<OrderQueryRow>(
    `
      SELECT
        o.id,
        o.product_id,
        p.title AS product_title,
        p.price_krw AS product_price_krw,
        o.seller_id,
        CASE WHEN p.is_anonymous THEN NULL ELSE ${safeUserLoginIdSql("o.seller_id")} END AS seller_threads_username,
        o.buyer_id,
        ${safeUserLoginIdSql("o.buyer_id")} AS buyer_threads_username,
        p.is_anonymous AS seller_is_anonymous,
        o.source,
        o.status,
        o.ordered_at
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.buyer_id = $1
      ORDER BY o.ordered_at DESC
    `,
    [userId],
  );

  return (await hydrateOrderRows(result.rows)).map(mapOrder);
}

export function signCloudinaryUpload(
  user: SessionUser,
): UploadSignatureResponse {
  const folder = getCloudinaryProductFolder({
    userId: user.id,
    threadsUsername: user.threadsUsername,
  });
  return signCloudinaryFolderUpload(folder);
}

export function signProfileImageUpload(
  user: SessionUser,
): UploadSignatureResponse {
  const folder = getCloudinaryProfileFolder({
    userId: user.id,
    threadsUsername: user.threadsUsername,
  });

  return signCloudinaryFolderUpload(folder);
}
