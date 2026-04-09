import { z } from "zod";

import { query, withTransaction, type DbClient } from "../../../db/src/index.js";
import { MAX_EVENT_IMAGES } from "../../../shared/src/index.js";
import type {
  CreateEventInput,
  EventCard,
  EventDetail,
  EventDrawSource,
  EventEntryRecord,
  EventImage,
} from "../../../shared/src/index.js";

import { AppError, isPgUniqueError } from "../errors.js";

const isoDateTimeSchema = z.string().datetime({ offset: true });

const eventImageSchema = z.object({
  imageUrl: z.string().url(),
  providerPublicId: z.string().min(1),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  bytes: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(1),
  isPrimary: z.boolean(),
});

const createEventSchema = z
  .object({
    title: z.string().trim().min(2).max(140),
    description: z.string().trim().min(1).max(5000),
    registrationMode: z.enum(["MANUAL", "SHOP_ENTRY"]),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    images: z.array(eventImageSchema).min(1).max(MAX_EVENT_IMAGES),
  })
  .superRefine((value, context) => {
    if (new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "이벤트 종료 일시는 시작 일시보다 뒤여야 합니다.",
        path: ["endsAt"],
      });
    }
  });

type EventCardRow = {
  id: string;
  seller_id: string;
  seller_display_name: string;
  title: string;
  description: string;
  registration_mode: "MANUAL" | "SHOP_ENTRY";
  primary_image_url: string | null;
  starts_at: Date;
  ends_at: Date;
  entry_count: number;
  created_at: Date;
};

type EventImageRow = {
  id: string;
  image_url: string;
  provider_public_id: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  sort_order: number;
  is_primary: boolean;
};

type EventEntryRow = {
  id: string;
  event_id: string;
  user_display_name: string;
  user_threads_username: string | null;
  created_at: Date;
};

const ensureEventSchemaSql = `
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type
      WHERE typname = 'event_registration_mode'
    ) THEN
      CREATE TYPE event_registration_mode AS ENUM ('MANUAL', 'SHOP_ENTRY');
    END IF;
  END
  $$;

  CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(140) NOT NULL,
    description TEXT NOT NULL,
    registration_mode event_registration_mode NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT events_period_check CHECK (ends_at > starts_at)
  );

  CREATE TABLE IF NOT EXISTS event_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    provider image_provider NOT NULL DEFAULT 'CLOUDINARY',
    provider_public_id VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    bytes INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 1 CHECK (sort_order >= 1),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS event_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_event_primary_image
    ON event_images(event_id)
    WHERE is_primary = TRUE;

  CREATE INDEX IF NOT EXISTS idx_events_seller_created
    ON events(seller_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_events_public_window
    ON events(starts_at, ends_at, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_event_entries_event
    ON event_entries(event_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_event_entries_user
    ON event_entries(user_id, created_at DESC);
`;

let eventSchemaReadyPromise: Promise<void> | null = null;

async function ensureEventSchema() {
  if (!eventSchemaReadyPromise) {
    eventSchemaReadyPromise = query(ensureEventSchemaSql)
      .then(() => undefined)
      .catch((error) => {
        eventSchemaReadyPromise = null;
        throw error;
      });
  }

  await eventSchemaReadyPromise;
}

function mapEventCard(row: EventCardRow): EventCard {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    registrationMode: row.registration_mode,
    sellerId: row.seller_id,
    sellerDisplayName: row.seller_display_name,
    primaryImageUrl: row.primary_image_url,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    entryCount: row.entry_count,
    createdAt: row.created_at.toISOString(),
  };
}

function mapEventImage(row: EventImageRow): EventImage {
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

function mapEventEntry(row: EventEntryRow): EventEntryRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    userDisplayName: row.user_display_name,
    userThreadsUsername: row.user_threads_username,
    enteredAt: row.created_at.toISOString(),
  };
}

function buildEventListQuery(filterToVisibleWindow: boolean) {
  return `
    SELECT
      e.id,
      e.seller_id,
      seller.display_name AS seller_display_name,
      e.title,
      e.description,
      e.registration_mode,
      primary_image.image_url AS primary_image_url,
      e.starts_at,
      e.ends_at,
      COALESCE(entry_stats.entry_count, 0) AS entry_count,
      e.created_at
    FROM events e
    JOIN users seller ON seller.id = e.seller_id
    LEFT JOIN event_images primary_image
      ON primary_image.event_id = e.id
     AND primary_image.is_primary = TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS entry_count
      FROM event_entries entry_row
      WHERE entry_row.event_id = e.id
    ) entry_stats ON TRUE
    ${filterToVisibleWindow ? "WHERE e.ends_at >= NOW()" : ""}
    ORDER BY
      CASE
        WHEN e.starts_at <= NOW() AND e.ends_at >= NOW() THEN 0
        ELSE 1
      END,
      e.starts_at ASC,
      e.created_at DESC
  `;
}

function assertValidEventImages(images: EventImage[]) {
  if (images.length > MAX_EVENT_IMAGES) {
    throw new AppError(`이벤트 이미지는 최대 ${MAX_EVENT_IMAGES}장까지 등록할 수 있습니다.`, 400);
  }

  const primaryImages = images.filter((image) => image.isPrimary);
  if (primaryImages.length !== 1) {
    throw new AppError("대표 이미지는 정확히 1장이어야 합니다.", 400);
  }
}

async function replaceEventImages(client: DbClient, eventId: string, images: EventImage[]) {
  for (const image of images) {
    await client.query(
      `
        INSERT INTO event_images (
          event_id,
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
        eventId,
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

async function getEventImages(eventId: string) {
  await ensureEventSchema();

  const result = await query<EventImageRow>(
    `
      SELECT id, image_url, provider_public_id, width, height, bytes, sort_order, is_primary
      FROM event_images
      WHERE event_id = $1
      ORDER BY sort_order ASC
    `,
    [eventId],
  );

  return result.rows.map(mapEventImage);
}

async function getEventById(eventId: string) {
  await ensureEventSchema();

  const result = await query<EventCardRow>(
    `
      SELECT
        e.id,
        e.seller_id,
        seller.display_name AS seller_display_name,
        e.title,
        e.description,
        e.registration_mode,
        primary_image.image_url AS primary_image_url,
        e.starts_at,
        e.ends_at,
        COALESCE(entry_stats.entry_count, 0) AS entry_count,
        e.created_at
      FROM events e
      JOIN users seller ON seller.id = e.seller_id
      LEFT JOIN event_images primary_image
        ON primary_image.event_id = e.id
       AND primary_image.is_primary = TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS entry_count
        FROM event_entries entry_row
        WHERE entry_row.event_id = e.id
      ) entry_stats ON TRUE
      WHERE e.id = $1
    `,
    [eventId],
  );

  return result.rows[0] ?? null;
}

async function ensureSellerOwnsEvent(sellerId: string, eventId: string) {
  const event = await getEventById(eventId);

  if (!event) {
    throw new AppError("이벤트를 찾을 수 없습니다.", 404);
  }

  if (event.seller_id !== sellerId) {
    throw new AppError("이 이벤트를 관리할 권한이 없습니다.", 403);
  }

  return event;
}

function isEventActive(event: Pick<EventCard, "startsAt" | "endsAt">) {
  const now = Date.now();
  return (
    new Date(event.startsAt).getTime() <= now &&
    new Date(event.endsAt).getTime() >= now
  );
}

export async function listPublicEvents() {
  await ensureEventSchema();

  const result = await query<EventCardRow>(buildEventListQuery(true));
  return result.rows.map(mapEventCard);
}

export async function getPublicEventDetail(eventId: string, viewerId?: string | null): Promise<EventDetail> {
  const event = await getEventById(eventId);

  if (!event) {
    throw new AppError("이벤트를 찾을 수 없습니다.", 404);
  }

  if (event.ends_at.getTime() < Date.now()) {
    throw new AppError("종료된 이벤트는 더 이상 확인할 수 없습니다.", 404);
  }

  const images = await getEventImages(eventId);
  const hasEntered = viewerId
    ? (
        await query<{ exists: boolean }>(
          `
            SELECT EXISTS (
              SELECT 1
              FROM event_entries
              WHERE event_id = $1 AND user_id = $2
            ) AS exists
          `,
          [eventId, viewerId],
        )
      ).rows[0]?.exists ?? false
    : false;

  const mapped = mapEventCard(event);
  const canEnter =
    mapped.registrationMode === "SHOP_ENTRY" &&
    Boolean(viewerId) &&
    viewerId !== mapped.sellerId &&
    isEventActive(mapped) &&
    !hasEntered;

  return {
    ...mapped,
    images,
    hasEntered,
    canEnter,
  };
}

export async function createEvent(sellerId: string, input: CreateEventInput) {
  await ensureEventSchema();

  const parsed = createEventSchema.parse(input) as CreateEventInput;
  assertValidEventImages(parsed.images);

  const eventId = await withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO events (
          seller_id,
          title,
          description,
          registration_mode,
          starts_at,
          ends_at
        )
        VALUES ($1, $2, $3, $4::event_registration_mode, $5, $6)
        RETURNING id
      `,
      [
        sellerId,
        parsed.title,
        parsed.description,
        parsed.registrationMode,
        parsed.startsAt,
        parsed.endsAt,
      ],
    );

    const insertedEventId = result.rows[0]?.id;

    if (!insertedEventId) {
      throw new AppError("이벤트를 생성하지 못했습니다.", 500);
    }

    await replaceEventImages(client, insertedEventId, parsed.images);
    return insertedEventId;
  });

  return getSellerEventDetail(sellerId, eventId);
}

export async function listSellerEvents(sellerId: string) {
  await ensureEventSchema();

  const result = await query<EventCardRow>(
    `
      SELECT
        e.id,
        e.seller_id,
        seller.display_name AS seller_display_name,
        e.title,
        e.description,
        e.registration_mode,
        primary_image.image_url AS primary_image_url,
        e.starts_at,
        e.ends_at,
        COALESCE(entry_stats.entry_count, 0) AS entry_count,
        e.created_at
      FROM events e
      JOIN users seller ON seller.id = e.seller_id
      LEFT JOIN event_images primary_image
        ON primary_image.event_id = e.id
       AND primary_image.is_primary = TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS entry_count
        FROM event_entries entry_row
        WHERE entry_row.event_id = e.id
      ) entry_stats ON TRUE
      WHERE e.seller_id = $1
      ORDER BY e.created_at DESC
    `,
    [sellerId],
  );

  return result.rows.map(mapEventCard);
}

export async function getSellerEventDetail(sellerId: string, eventId: string): Promise<EventDetail> {
  const event = await ensureSellerOwnsEvent(sellerId, eventId);
  const images = await getEventImages(eventId);
  return {
    ...mapEventCard(event),
    images,
    hasEntered: false,
    canEnter: false,
  };
}

export async function createEventEntry(userId: string, eventId: string) {
  await ensureEventSchema();

  return withTransaction(async (client) => {
    const eventResult = await client.query<{
      id: string;
      seller_id: string;
      registration_mode: "MANUAL" | "SHOP_ENTRY";
      starts_at: Date;
      ends_at: Date;
    }>(
      `
        SELECT id, seller_id, registration_mode, starts_at, ends_at
        FROM events
        WHERE id = $1
        FOR UPDATE
      `,
      [eventId],
    );

    const event = eventResult.rows[0];

    if (!event) {
      throw new AppError("이벤트를 찾을 수 없습니다.", 404);
    }

    if (event.seller_id === userId) {
      throw new AppError("본인이 등록한 이벤트에는 응모할 수 없습니다.", 400);
    }

    if (event.registration_mode !== "SHOP_ENTRY") {
      throw new AppError("이 이벤트는 구매자 사이트 응모를 받지 않습니다.", 400);
    }

    const now = Date.now();
    if (event.starts_at.getTime() > now) {
      throw new AppError("아직 시작 전인 이벤트입니다.", 409);
    }

    if (event.ends_at.getTime() < now) {
      throw new AppError("이미 종료된 이벤트입니다.", 409);
    }

    try {
      const inserted = await client.query<EventEntryRow>(
        `
          WITH inserted AS (
            INSERT INTO event_entries (event_id, user_id)
            VALUES ($1, $2)
            RETURNING id, event_id, created_at
          )
          SELECT
            inserted.id,
            inserted.event_id,
            user_row.display_name AS user_display_name,
            auth.provider_username AS user_threads_username,
            inserted.created_at
          FROM inserted
          JOIN users user_row ON user_row.id = $2
          LEFT JOIN auth_accounts auth
            ON auth.user_id = user_row.id
           AND auth.provider = 'THREADS'
        `,
        [eventId, userId],
      );

      return mapEventEntry(inserted.rows[0]);
    } catch (error) {
      if (isPgUniqueError(error)) {
        throw new AppError("이미 응모를 완료한 이벤트입니다.", 409);
      }

      throw error;
    }
  });
}

export async function listEventEntries(sellerId: string, eventId: string) {
  await ensureEventSchema();

  await ensureSellerOwnsEvent(sellerId, eventId);

  const result = await query<EventEntryRow>(
    `
      SELECT
        entry_row.id,
        entry_row.event_id,
        user_row.display_name AS user_display_name,
        auth.provider_username AS user_threads_username,
        entry_row.created_at
      FROM event_entries entry_row
      JOIN users user_row ON user_row.id = entry_row.user_id
      LEFT JOIN auth_accounts auth
        ON auth.user_id = user_row.id
       AND auth.provider = 'THREADS'
      WHERE entry_row.event_id = $1
      ORDER BY entry_row.created_at DESC
    `,
    [eventId],
  );

  return result.rows.map(mapEventEntry);
}

export async function getEventDrawSource(sellerId: string, eventId: string): Promise<EventDrawSource> {
  const event = await ensureSellerOwnsEvent(sellerId, eventId);

  if (event.registration_mode !== "SHOP_ENTRY") {
    throw new AppError("구매자 사이트 응모 이벤트만 응모자 기반 추첨이 가능합니다.", 400);
  }

  const entries = await listEventEntries(sellerId, eventId);

  return {
    eventId: event.id,
    eventTitle: event.title,
    registrationMode: event.registration_mode,
    sellerDisplayName: event.seller_display_name,
    participants: entries.map((entry) => ({
      id: entry.id,
      name: entry.userDisplayName,
    })),
  };
}
