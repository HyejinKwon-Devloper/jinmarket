import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";

import { query, withTransaction, type DbClient } from "../../../db/src/index.js";
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
  UploadSignatureResponse
} from "../../../shared/src/index.js";

import { AppError, isPgUniqueError } from "../errors.js";
import { env } from "../env.js";

import { accountIdentityJoins, accountLoginIdSql } from "./account-sql.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET
});

const productImageSchema = z.object({
  imageUrl: z.string().url(),
  providerPublicId: z.string().min(1),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  bytes: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(1),
  isPrimary: z.boolean()
});

const productImagesSchema = z.array(productImageSchema).min(1).max(MAX_PRODUCT_IMAGES);
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
  images: productImagesSchema
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
  images: productImagesSchema.optional()
});

const createPriceOfferSchema = z.object({
  offeredPriceKrw: z.number().int().positive(),
  note: z.string().trim().max(1000).optional()
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

type OrderRow = {
  id: string;
  product_id: string;
  product_title: string;
  seller_id: string;
  seller_display_name: string | null;
  seller_threads_username: string | null;
  buyer_id: string;
  buyer_display_name: string;
  buyer_threads_username: string | null;
  source: "INSTANT_BUY" | "GAME_CHANCE_WIN" | "PRICE_OFFER_ACCEPTED";
  status: "PENDING_CONTACT" | "CONTACTED" | "TRANSFER_PENDING" | "COMPLETED" | "CANCELLED";
  ordered_at: Date;
};

function mapProductCard(row: ProductCardRow): ProductCard {
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
    sellerDisplayName: row.seller_display_name,
    primaryImageUrl: row.primary_image_url,
    saleStartsAt: row.sale_started_at.toISOString(),
    saleEndsAt: row.sale_ends_at ? row.sale_ends_at.toISOString() : null,
    isSaleActive: row.sale_active,
    createdAt: row.created_at.toISOString()
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
    isPrimary: row.is_primary
  };
}

function mapOrder(row: OrderRow) {
  return {
    id: row.id,
    productId: row.product_id,
    productTitle: row.product_title,
    sellerId: row.seller_id,
    sellerDisplayName: row.seller_display_name ?? undefined,
    sellerThreadsUsername: row.seller_threads_username ?? undefined,
    buyerId: row.buyer_id,
    buyerDisplayName: row.buyer_display_name,
    buyerThreadsUsername: row.buyer_threads_username,
    source: row.source,
    status: row.status,
    orderedAt: row.ordered_at.toISOString()
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
    playedAt: row.played_at.toISOString()
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
    createdAt: row.created_at.toISOString()
  };
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
    [productId]
  );

  await client.query(
    `
      UPDATE products
      SET sold_out_at = NULL,
          updated_at = NOW()
      WHERE id = $1
    `,
    [productId]
  );
}

function normalizeCreateProductInput(input: CreateProductInput): CreateProductInput {
  const normalizedInput: CreateProductInput = {
    ...input,
    saleStartsAt: input.saleStartsAt ?? new Date().toISOString(),
    saleEndsAt: input.saleEndsAt ?? null
  };

  if (!normalizedInput.isFreeShare) {
    return normalizedInput;
  }

  return {
    ...normalizedInput,
    priceKrw: 0,
    allowPriceOffer: false
  };
}

function normalizeUpdateProductInput(input: UpdateProductInput): UpdateProductInput {
  if (input.isFreeShare !== true) {
    return input;
  }

  return {
    ...input,
    priceKrw: 0,
    allowPriceOffer: false
  };
}

function assertValidProductPricing(input: { isFreeShare?: boolean; priceKrw?: number }) {
  if (input.isFreeShare) {
    return;
  }

  if (input.priceKrw !== undefined && input.priceKrw <= 0) {
    throw new AppError("무료 나눔이 아닌 상품 가격은 1원 이상이어야 합니다.", 400);
  }
}

function assertValidSalePeriod(input: { saleStartsAt?: string | null; saleEndsAt?: string | null }) {
  if (!input.saleStartsAt || !input.saleEndsAt) {
    return;
  }

  if (new Date(input.saleEndsAt).getTime() <= new Date(input.saleStartsAt).getTime()) {
    throw new AppError("판매 종료 일시는 판매 시작 일시보다 뒤여야 합니다.", 400);
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
    saleEndsAt: input.sale_ends_at ? input.sale_ends_at.toISOString() : null
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
      parsed.purchaseType === "GAME_CHANCE" ? `'ROCK_PAPER_SCISSORS'::game_type` : "NULL";

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

function getCloudinaryProductFolder(identity: { userId: string; threadsUsername?: string | null }) {
  const trimmed = env.CLOUDINARY_UPLOAD_FOLDER.replace(/\/+$/, "");
  const baseFolder = trimmed.endsWith("/products")
    ? trimmed.slice(0, Math.max(0, trimmed.length - "/products".length))
    : trimmed;
  const folderOwner = sanitizeCloudinaryPathSegment(identity.threadsUsername || identity.userId);

  return `${baseFolder || "jinmarket"}/products/${folderOwner}`;
}

function assertValidProductImages(images: ProductImage[]) {
  if (images.length > MAX_PRODUCT_IMAGES) {
    throw new AppError(`?곹뭹 ?대?吏??理쒕? ${MAX_PRODUCT_IMAGES}?κ퉴吏 ?깅줉?????덉뒿?덈떎.`, 400);
  }

  const primaryImages = images.filter((image) => image.isPrimary);
  if (primaryImages.length !== 1) {
    throw new AppError("????대?吏???뺥솗?????μ씠?댁빞 ?⑸땲??", 400);
  }
}

async function replaceProductImages(
  client: DbClient,
  productId: string,
  images: ProductImage[]
) {
  await client.query("DELETE FROM product_images WHERE product_id = $1", [productId]);

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
        image.isPrimary
      ]
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
        resource_type: "image"
      })
    )
  );
}

export async function listProducts() {
  const result = await query<ProductCardRow>(
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
        CASE
          WHEN p.is_anonymous THEN NULL
          ELSE u.display_name
        END AS seller_display_name,
        pi.image_url AS primary_image_url
      FROM products p
      JOIN users u ON u.id = p.seller_id
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
      WHERE p.status = 'OPEN'
        AND ${buildSaleActiveSql("p")}
      ORDER BY p.created_at DESC
    `
  );

  return result.rows.map(mapProductCard);
}

export async function getProductDetail(productId: string, viewerId?: string | null): Promise<ProductDetail> {
  const productResult = await query<ProductCardRow>(
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
        CASE
          WHEN p.is_anonymous THEN NULL
          ELSE u.display_name
        END AS seller_display_name,
        pi.image_url AS primary_image_url
      FROM products p
      JOIN users u ON u.id = p.seller_id
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
      WHERE p.id = $1
    `,
    [productId]
  );

  const product = productResult.rows[0];

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
    [productId]
  );

  const attemptResult = viewerId
    ? await query<GameAttemptRow>(
        `
          SELECT
            gpa.id,
            gpa.product_id,
            gpa.user_id,
            u.display_name AS user_display_name,
            gpa.player_choice,
            gpa.system_choice,
            gpa.result,
            gpa.played_at
          FROM game_purchase_attempts gpa
          JOIN users u ON u.id = gpa.user_id
          WHERE gpa.product_id = $1 AND gpa.user_id = $2
        `,
        [productId, viewerId]
      )
    : { rows: [] as GameAttemptRow[] };

  const orderResult = await query<OrderRow>(
    `
      SELECT
        o.id,
        o.product_id,
        p.title AS product_title,
        o.seller_id,
        CASE WHEN p.is_anonymous THEN NULL ELSE seller.display_name END AS seller_display_name,
        CASE WHEN p.is_anonymous THEN NULL ELSE ${accountLoginIdSql("seller")} END AS seller_threads_username,
        o.buyer_id,
        buyer.display_name AS buyer_display_name,
        ${accountLoginIdSql("buyer")} AS buyer_threads_username,
        o.source,
        o.status,
        o.ordered_at
      FROM orders o
      JOIN products p ON p.id = o.product_id
      JOIN users seller ON seller.id = o.seller_id
      JOIN users buyer ON buyer.id = o.buyer_id
      ${accountIdentityJoins("seller")}
      ${accountIdentityJoins("buyer")}
      WHERE o.product_id = $1
        AND o.status <> 'CANCELLED'
    `,
    [productId]
  );

  const soldOrder = orderResult.rows[0]
    ? orderResult.rows[0].buyer_id === viewerId || product.seller_id === viewerId
      ? mapOrder(orderResult.rows[0])
      : null
    : null;

  return {
    ...mapProductCard(product),
    sellerId: product.is_anonymous && product.seller_id !== viewerId ? null : product.seller_id,
    images: imagesResult.rows.map(mapProductImage),
    myGameAttempt: attemptResult.rows[0] ? mapAttempt(attemptResult.rows[0]) : null,
    soldOrder
  };
}

export async function createProduct(sellerId: string, input: CreateProductInput) {
  const parsed = normalizeCreateProductInput(createProductSchema.parse(input) as CreateProductInput);
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
        parsed.saleEndsAt
      ]
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
          image.isPrimary
        ]
      );
    }

    return insertedProductId;
  });

  return getSellerProductDetail(sellerId, productId);
}

export async function updateProduct(sellerId: string, productId: string, input: UpdateProductInput) {
  const parsed = normalizeUpdateProductInput(updateProductSchema.parse(input) as UpdateProductInput);
  assertValidProductPricing(parsed);
  if (parsed.saleStartsAt !== undefined || parsed.saleEndsAt !== undefined) {
    const currentProduct = await query<{ published_at: Date | null; created_at: Date; sale_ends_at: Date | null }>(
      `
        SELECT published_at, created_at, sale_ends_at
        FROM products
        WHERE id = $1 AND seller_id = $2
      `,
      [productId, sellerId]
    );

    const row = currentProduct.rows[0];

    if (!row) {
      throw new AppError("상품을 찾을 수 없습니다.", 404);
    }

    const currentSalePeriod = getSalePeriodSnapshot(row);
    assertValidSalePeriod({
      saleStartsAt: parsed.saleStartsAt ?? currentSalePeriod.saleStartsAt,
      saleEndsAt: parsed.saleEndsAt !== undefined ? parsed.saleEndsAt : currentSalePeriod.saleEndsAt
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
    [productId, sellerId, ...values]
  );

  return getSellerProductDetail(sellerId, productId);
}

export async function updateSellerProduct(sellerId: string, productId: string, input: UpdateProductInput) {
  const parsed = normalizeUpdateProductInput(updateProductSchema.parse(input) as UpdateProductInput);
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
      [productId]
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
      saleEndsAt: parsed.saleEndsAt !== undefined ? parsed.saleEndsAt : currentSalePeriod.saleEndsAt
    });

    if (assignments.length > 0) {
      await client.query(
        `
          UPDATE products
          SET ${assignments.join(", ")}, updated_at = NOW()
          WHERE id = $1 AND seller_id = $2
        `,
        [productId, sellerId, ...values]
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
        [productId]
      );

      previousImagePublicIds = imageResult.rows.map((row) => row.provider_public_id);
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
      [productId]
    );

    const product = productResult.rows[0];

    if (!product) {
      throw new AppError("?곹뭹??李얠쓣 ???놁뒿?덈떎.", 404);
    }

    if (product.seller_id !== sellerId) {
      throw new AppError("?대떦 ?곹뭹????젣??沅뚰븳???놁뒿?덈떎.", 403);
    }

    const orderResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM orders
        WHERE product_id = $1
      `,
      [productId]
    );

    if (orderResult.rows[0]) {
      throw new AppError("援щℓ ?대젰???덈뒗 ?곹뭹? ??젣?????놁뒿?덈떎.", 409);
    }

    const imageResult = await client.query<{ provider_public_id: string }>(
      `
        SELECT provider_public_id
        FROM product_images
        WHERE product_id = $1
      `,
      [productId]
    );

    imagePublicIds = imageResult.rows.map((row) => row.provider_public_id);

    await client.query("DELETE FROM products WHERE id = $1 AND seller_id = $2", [productId, sellerId]);
  });

  if (imagePublicIds.length > 0) {
    await destroyCloudinaryImages(imagePublicIds);
  }
}

export async function listSellerProducts(sellerId: string): Promise<SellerProductRecord[]> {
  const result = await query<ProductCardRow>(
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
        u.display_name AS seller_display_name,
        pi.image_url AS primary_image_url,
        o.id AS sold_order_id,
        buyer.display_name AS sold_buyer_display_name,
        ${accountLoginIdSql("buyer")} AS sold_buyer_threads_username
      FROM products p
      JOIN users u ON u.id = p.seller_id
      LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
      LEFT JOIN orders o ON o.product_id = p.id AND o.status <> 'CANCELLED'
      LEFT JOIN users buyer ON buyer.id = o.buyer_id
      ${accountIdentityJoins("buyer")}
      WHERE p.seller_id = $1
      ORDER BY p.created_at DESC
    `,
    [sellerId]
  );

  return result.rows.map((row) => ({
    ...mapProductCard(row),
    soldOrderId: row.sold_order_id ?? null,
    soldBuyerDisplayName: row.sold_buyer_display_name ?? null,
    soldBuyerThreadsUsername: row.sold_buyer_threads_username ?? null
  }));
}

export async function getSellerProductDetail(sellerId: string, productId: string) {
  const product = await getProductDetail(productId, sellerId);

  if (product.sellerId !== sellerId) {
    throw new AppError("?대떦 ?곹뭹??蹂?沅뚰븳???놁뒿?덈떎.", 403);
  }

  return product;
}

export async function listProductGameAttempts(sellerId: string, productId: string) {
  const ownershipResult = await query<{ seller_id: string }>(
    "SELECT seller_id FROM products WHERE id = $1",
    [productId]
  );

  if (!ownershipResult.rows[0]) {
    throw new AppError("?곹뭹??李얠쓣 ???놁뒿?덈떎.", 404);
  }

  if (ownershipResult.rows[0].seller_id !== sellerId) {
    throw new AppError("?대떦 ?곹뭹 湲곕줉??蹂?沅뚰븳???놁뒿?덈떎.", 403);
  }

  const result = await query<GameAttemptRow>(
    `
      SELECT
        gpa.id,
        gpa.product_id,
        gpa.user_id,
        u.display_name AS user_display_name,
        gpa.player_choice,
        gpa.system_choice,
        gpa.result,
        gpa.played_at
      FROM game_purchase_attempts gpa
      JOIN users u ON u.id = gpa.user_id
      WHERE gpa.product_id = $1
      ORDER BY gpa.played_at DESC
    `,
    [productId]
  );

  return result.rows.map(mapAttempt);
}

export async function createPriceOffer(userId: string, productId: string, input: CreatePriceOfferInput) {
  const parsed = createPriceOfferSchema.parse(input);

  return withTransaction(async (client) => {
    const productResult = await client.query<{
      seller_id: string;
      status: "DRAFT" | "OPEN" | "SOLD_OUT" | "CANCELLED";
      allow_price_offer: boolean;
      published_at: Date | null;
      created_at: Date;
      sale_ends_at: Date | null;
    }>(
      `
        SELECT seller_id, status, allow_price_offer, published_at, created_at, sale_ends_at
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
      [productId]
    );

    const product = productResult.rows[0];

    if (!product) {
      throw new AppError("?곹뭹??李얠쓣 ???놁뒿?덈떎.", 404);
    }

    if (product.seller_id === userId) {
      throw new AppError("蹂몄씤 ?곹뭹?먮뒗 媛寃??쒖븞??蹂대궪 ???놁뒿?덈떎.", 400);
    }

    if (product.status !== "OPEN") {
      throw new AppError("?먮ℓ以묒씤 ?곹뭹?먮쭔 媛寃??쒖븞??蹂대궪 ???덉뒿?덈떎.", 409);
    }

    const now = Date.now();
    const saleStartsAt = (product.published_at ?? product.created_at).getTime();
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

    const inserted = await client.query<PriceOfferRow>(
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
          u.display_name AS buyer_display_name,
          ${accountLoginIdSql("buyer")} AS buyer_threads_username,
          inserted.offered_price_krw,
          inserted.note,
          inserted.created_at
        FROM inserted
        JOIN users u ON u.id = inserted.buyer_id
        ${accountIdentityJoins("buyer", "u")}
      `,
      [productId, userId, parsed.offeredPriceKrw, parsed.note || null]
    );

    return mapPriceOffer(inserted.rows[0]);
  });
}

export async function listProductPriceOffers(sellerId: string, productId: string) {
  const ownershipResult = await query<{ seller_id: string }>(
    "SELECT seller_id FROM products WHERE id = $1",
    [productId]
  );

  if (!ownershipResult.rows[0]) {
    throw new AppError("?곹뭹??李얠쓣 ???놁뒿?덈떎.", 404);
  }

  if (ownershipResult.rows[0].seller_id !== sellerId) {
    throw new AppError("?대떦 ?곹뭹 湲곕줉??蹂?沅뚰븳???놁뒿?덈떎.", 403);
  }

  const result = await query<PriceOfferRow>(
    `
      SELECT
        po.id,
        po.product_id,
        po.buyer_id,
        u.display_name AS buyer_display_name,
        ${accountLoginIdSql("buyer")} AS buyer_threads_username,
        po.offered_price_krw,
        po.note,
        po.created_at
      FROM price_offers po
      JOIN users u ON u.id = po.buyer_id
      ${accountIdentityJoins("buyer", "u")}
      WHERE po.product_id = $1
      ORDER BY po.created_at DESC
    `,
    [productId]
  );

  return result.rows.map(mapPriceOffer);
}

export async function acceptPriceOffer(sellerId: string, productId: string, offerId: string) {
  let acceptedOrder: OrderRecord | null = null;

  await withTransaction(async (client) => {
    const productResult = await client.query<{
      id: string;
      title: string;
      seller_id: string;
      status: "DRAFT" | "OPEN" | "SOLD_OUT" | "CANCELLED";
      published_at: Date | null;
      created_at: Date;
      sale_ends_at: Date | null;
    }>(
      `
        SELECT id, title, seller_id, status, published_at, created_at, sale_ends_at
        FROM products
        WHERE id = $1
        FOR UPDATE
      `,
      [productId]
    );

    const product = productResult.rows[0];

    if (!product) {
      throw new AppError("?곹뭹??李얠쓣 ???놁뒿?덈떎.", 404);
    }

    if (product.seller_id !== sellerId) {
      throw new AppError("?대떦 ?곹뭹???먮ℓ 泥섎━??沅뚰븳???놁뒿?덈떎.", 403);
    }

    if (product.status !== "OPEN") {
      throw new AppError("?먮ℓ 以묒씤 ?곹뭹留?媛寃??쒖븞???섎씫?????덉뒿?덈떎.", 409);
    }

    const now = Date.now();
    const saleStartsAt = (product.published_at ?? product.created_at).getTime();
    const saleEndsAt = product.sale_ends_at?.getTime() ?? null;

    if (saleStartsAt > now) {
      throw new AppError("아직 판매 시작 전인 상품의 제안은 수락할 수 없습니다.", 409);
    }

    if (saleEndsAt !== null && saleEndsAt < now) {
      throw new AppError("판매 기간이 종료된 상품의 제안은 수락할 수 없습니다.", 409);
    }

    const offerResult = await client.query<PriceOfferRow>(
      `
        SELECT
          po.id,
          po.product_id,
          po.buyer_id,
          u.display_name AS buyer_display_name,
          ${accountLoginIdSql("buyer")} AS buyer_threads_username,
          po.offered_price_krw,
          po.note,
          po.created_at
        FROM price_offers po
        JOIN users u ON u.id = po.buyer_id
        ${accountIdentityJoins("buyer", "u")}
        WHERE po.id = $1 AND po.product_id = $2
        FOR UPDATE OF po
      `,
      [offerId, productId]
    );

    const offer = offerResult.rows[0];

    if (!offer) {
      throw new AppError("媛寃??쒖븞??李얠쓣 ???놁뒿?덈떎.", 404);
    }

    if (offer.buyer_id === sellerId) {
      throw new AppError("蹂몄씤 媛寃??쒖븞? ?섎씫?????놁뒿?덈떎.", 400);
    }

    try {
      const orderResult = await client.query<OrderRow>(
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
            inserted.seller_id,
            seller.display_name AS seller_display_name,
            ${accountLoginIdSql("seller")} AS seller_threads_username,
            inserted.buyer_id,
            buyer.display_name AS buyer_display_name,
            ${accountLoginIdSql("buyer")} AS buyer_threads_username,
            inserted.source,
            inserted.status,
            inserted.ordered_at
          FROM inserted
          JOIN users seller ON seller.id = inserted.seller_id
          JOIN users buyer ON buyer.id = inserted.buyer_id
          ${accountIdentityJoins("seller")}
          ${accountIdentityJoins("buyer")}
        `,
        [product.id, sellerId, offer.buyer_id, offer.note ?? null, product.title]
      );

      await client.query(
        `
          UPDATE products
          SET status = 'SOLD_OUT',
              sold_out_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [product.id]
      );

      acceptedOrder = mapOrder(orderResult.rows[0]);
    } catch (error) {
      if (isPgUniqueError(error)) {
        throw new AppError("?대? ?ㅻⅨ 援щℓ媛 ?꾨즺???곹뭹?낅땲??", 409);
      }

      throw error;
    }
  });

  if (!acceptedOrder) {
    throw new AppError("媛寃??쒖븞???섎씫?섏? 紐삵뻽?듬땲??", 500);
  }

  return {
    order: acceptedOrder,
    item: await getSellerProductDetail(sellerId, productId)
  };
}

export async function listSellerOrders(sellerId: string) {
  const result = await query<OrderRow>(
    `
      SELECT
        o.id,
        o.product_id,
        p.title AS product_title,
        o.seller_id,
        CASE WHEN p.is_anonymous THEN NULL ELSE seller.display_name END AS seller_display_name,
        CASE WHEN p.is_anonymous THEN NULL ELSE ${accountLoginIdSql("seller")} END AS seller_threads_username,
        o.buyer_id,
        buyer.display_name AS buyer_display_name,
        ${accountLoginIdSql("buyer")} AS buyer_threads_username,
        o.source,
        o.status,
        o.ordered_at
      FROM orders o
      JOIN products p ON p.id = o.product_id
      JOIN users seller ON seller.id = o.seller_id
      JOIN users buyer ON buyer.id = o.buyer_id
      ${accountIdentityJoins("seller")}
      ${accountIdentityJoins("buyer")}
      WHERE o.seller_id = $1
      ORDER BY o.ordered_at DESC
    `,
    [sellerId]
  );

  return result.rows.map(mapOrder);
}

export async function listMyOrders(userId: string) {
  const result = await query<OrderRow>(
    `
      SELECT
        o.id,
        o.product_id,
        p.title AS product_title,
        o.seller_id,
        CASE WHEN p.is_anonymous THEN NULL ELSE seller.display_name END AS seller_display_name,
        CASE WHEN p.is_anonymous THEN NULL ELSE ${accountLoginIdSql("seller")} END AS seller_threads_username,
        o.buyer_id,
        buyer.display_name AS buyer_display_name,
        ${accountLoginIdSql("buyer")} AS buyer_threads_username,
        o.source,
        o.status,
        o.ordered_at
      FROM orders o
      JOIN products p ON p.id = o.product_id
      JOIN users seller ON seller.id = o.seller_id
      JOIN users buyer ON buyer.id = o.buyer_id
      ${accountIdentityJoins("seller")}
      ${accountIdentityJoins("buyer")}
      WHERE o.buyer_id = $1
      ORDER BY o.ordered_at DESC
    `,
    [userId]
  );

  return result.rows.map(mapOrder);
}

export function signCloudinaryUpload(user: SessionUser): UploadSignatureResponse {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new AppError("Cloudinary ?섍꼍 蹂?섍? ?꾩쭅 ?ㅼ젙?섏? ?딆븯?듬땲??", 500);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = getCloudinaryProductFolder({
    userId: user.id,
    threadsUsername: user.threadsUsername
  });
  const signature = cloudinary.utils.api_sign_request(
    { folder, timestamp },
    env.CLOUDINARY_API_SECRET
  );

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    folder,
    timestamp,
    signature
  };
}

