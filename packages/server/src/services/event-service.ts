import { v2 as cloudinary } from "cloudinary";
import { z } from "zod";

import { query, runWithSystemDbContext, withTransaction, type DbClient } from "@jinmarket/db";
import { MAX_EVENT_IMAGES } from "../../../shared/src/index.js";
import type {
  CreateEventInput,
  EventCard,
  EventDetail,
  EventDrawSource,
  EventEntryRecord,
  EventImage,
  UpdateEventInput,
} from "../../../shared/src/index.js";

import { AppError, isPgUniqueError } from "../errors.js";
import { env } from "../env.js";
import { safeUserLoginIdSql } from "./account-sql.js";
import { loadUserIdentityMap } from "./user-identity-service.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

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

const eventImagesSchema = z
  .array(eventImageSchema)
  .min(1)
  .max(MAX_EVENT_IMAGES);

const createEventSchema = z
  .object({
    title: z.string().trim().min(2).max(140),
    description: z.string().trim().min(1).max(5000),
    registrationMode: z.enum(["MANUAL", "SHOP_ENTRY"]),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    images: eventImagesSchema,
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

const updateEventSchema = z
  .object({
    title: z.string().trim().min(2).max(140).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    registrationMode: z.enum(["MANUAL", "SHOP_ENTRY"]).optional(),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.optional(),
    images: eventImagesSchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      value.startsAt &&
      value.endsAt &&
      new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()
    ) {
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

type EventCardQueryRow = Omit<EventCardRow, "seller_display_name">;

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

type EventEntryQueryRow = Omit<EventEntryRow, "user_display_name"> & {
  user_id: string;
};

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

async function hydrateEventCardRows(rows: EventCardQueryRow[], client?: DbClient) {
  const identities = await loadEventIdentityMap(
    rows.map((row) => row.seller_id),
    client,
  );

  return rows.map((row) => {
    const seller = identities.get(row.seller_id);

    if (!seller) {
      throw new Error("Failed to load event seller identity.");
    }

    return {
      ...row,
      seller_display_name: seller.displayName
    } satisfies EventCardRow;
  });

}

async function hydrateEventEntryRows(rows: EventEntryQueryRow[], client?: DbClient) {
  const identities = await loadEventIdentityMap(
    rows.map((row) => row.user_id),
    client,
  );

  return rows.map((row) => {
    const user = identities.get(row.user_id);

    if (!user) {
      throw new Error("Failed to load event entry user identity.");
    }

    return {
      id: row.id,
      event_id: row.event_id,
      user_display_name: user.displayName,
      user_threads_username: row.user_threads_username,
      created_at: row.created_at
    } satisfies EventEntryRow;
  });
}

async function loadEventIdentityMap(
  userIds: Array<string | null | undefined>,
  client?: DbClient,
) {
  if (client) {
    return loadUserIdentityMap(userIds, client);
  }

  return runWithSystemDbContext(() => loadUserIdentityMap(userIds));
}

function buildEventListQuery(filterToVisibleWindow: boolean) {
  return `
    SELECT
      e.id,
      e.seller_id,
      e.title,
      e.description,
      e.registration_mode,
      primary_image.image_url AS primary_image_url,
      e.starts_at,
      e.ends_at,
      private.event_entry_count(e.id) AS entry_count,
      e.created_at
    FROM events e
    LEFT JOIN event_images primary_image
      ON primary_image.event_id = e.id
     AND primary_image.is_primary = TRUE
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

function assertValidEventWindow(input: {
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  if (!input.startsAt || !input.endsAt) {
    return;
  }

  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
    throw new AppError("이벤트 종료 일시는 시작 일시보다 뒤여야 합니다.", 400);
  }
}

async function replaceEventImages(client: DbClient, eventId: string, images: EventImage[]) {
  await client.query("DELETE FROM event_images WHERE event_id = $1", [eventId]);

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

function buildEventUpdateStatement(parsed: UpdateEventInput) {
  const assignments: string[] = [];
  const values: string[] = [];

  if (parsed.title !== undefined) {
    values.push(parsed.title);
    assignments.push(`title = $${values.length + 2}`);
  }

  if (parsed.description !== undefined) {
    values.push(parsed.description);
    assignments.push(`description = $${values.length + 2}`);
  }

  if (parsed.registrationMode !== undefined) {
    values.push(parsed.registrationMode);
    assignments.push(
      `registration_mode = $${values.length + 2}::event_registration_mode`,
    );
  }

  if (parsed.startsAt !== undefined) {
    values.push(parsed.startsAt);
    assignments.push(`starts_at = $${values.length + 2}`);
  }

  if (parsed.endsAt !== undefined) {
    values.push(parsed.endsAt);
    assignments.push(`ends_at = $${values.length + 2}`);
  }

  return { assignments, values };
}

async function getEventImages(eventId: string) {
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
  const result = await query<EventCardQueryRow>(
    `
      SELECT
        e.id,
        e.seller_id,
        e.title,
        e.description,
        e.registration_mode,
        primary_image.image_url AS primary_image_url,
        e.starts_at,
        e.ends_at,
        private.event_entry_count(e.id) AS entry_count,
        e.created_at
      FROM events e
      LEFT JOIN event_images primary_image
        ON primary_image.event_id = e.id
       AND primary_image.is_primary = TRUE
      WHERE e.id = $1
    `,
    [eventId],
  );

  const rows = await hydrateEventCardRows(result.rows);
  return rows[0] ?? null;
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
  const result = await query<EventCardQueryRow>(buildEventListQuery(true));
  return (await hydrateEventCardRows(result.rows)).map(mapEventCard);
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

export async function updateSellerEvent(
  sellerId: string,
  eventId: string,
  input: UpdateEventInput,
) {
  const parsed = updateEventSchema.parse(input) as UpdateEventInput;
  const nextImages = parsed.images;

  if (nextImages) {
    assertValidEventImages(nextImages);
  }

  const { assignments, values } = buildEventUpdateStatement(parsed);

  if (assignments.length === 0 && !nextImages) {
    throw new AppError("업데이트할 값이 없습니다.", 400);
  }

  let previousImagePublicIds: string[] = [];

  await withTransaction(async (client) => {
    const ownershipResult = await client.query<{
      seller_id: string;
      starts_at: Date;
      ends_at: Date;
    }>(
      `
        SELECT seller_id, starts_at, ends_at
        FROM events
        WHERE id = $1
        FOR UPDATE
      `,
      [eventId],
    );

    const ownerRow = ownershipResult.rows[0];

    if (!ownerRow) {
      throw new AppError("이벤트를 찾을 수 없습니다.", 404);
    }

    if (ownerRow.seller_id !== sellerId) {
      throw new AppError("해당 이벤트를 수정할 권한이 없습니다.", 403);
    }

    assertValidEventWindow({
      startsAt: parsed.startsAt ?? ownerRow.starts_at.toISOString(),
      endsAt: parsed.endsAt ?? ownerRow.ends_at.toISOString(),
    });

    if (assignments.length > 0) {
      await client.query(
        `
          UPDATE events
          SET ${assignments.join(", ")}, updated_at = NOW()
          WHERE id = $1 AND seller_id = $2
        `,
        [eventId, sellerId, ...values],
      );
    }

    if (nextImages) {
      const imageResult = await client.query<{ provider_public_id: string }>(
        `
          SELECT provider_public_id
          FROM event_images
          WHERE event_id = $1
        `,
        [eventId],
      );

      previousImagePublicIds = imageResult.rows.map(
        (row) => row.provider_public_id,
      );
      await replaceEventImages(client, eventId, nextImages);
    }
  });

  if (previousImagePublicIds.length > 0) {
    await destroyCloudinaryImages(previousImagePublicIds);
  }

  return getSellerEventDetail(sellerId, eventId);
}

export async function listSellerEvents(sellerId: string) {
  const result = await query<EventCardQueryRow>(
    `
      SELECT
        e.id,
        e.seller_id,
        e.title,
        e.description,
        e.registration_mode,
        primary_image.image_url AS primary_image_url,
        e.starts_at,
        e.ends_at,
        private.event_entry_count(e.id) AS entry_count,
        e.created_at
      FROM events e
      LEFT JOIN event_images primary_image
        ON primary_image.event_id = e.id
       AND primary_image.is_primary = TRUE
      WHERE e.seller_id = $1
      ORDER BY e.created_at DESC
    `,
    [sellerId],
  );

  return (await hydrateEventCardRows(result.rows)).map(mapEventCard);
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
  return runWithSystemDbContext(() => withTransaction(async (client) => {
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
      const inserted = await client.query<EventEntryQueryRow>(
        `
          WITH inserted AS (
            INSERT INTO event_entries (event_id, user_id)
            VALUES ($1, $2)
            RETURNING id, event_id, created_at
          )
          SELECT
            inserted.id,
            inserted.event_id,
            $2::uuid AS user_id,
            ${safeUserLoginIdSql("$2")} AS user_threads_username,
            inserted.created_at
          FROM inserted
        `,
        [eventId, userId],
      );

      return mapEventEntry((await hydrateEventEntryRows(inserted.rows, client))[0]);
    } catch (error) {
      if (isPgUniqueError(error)) {
        throw new AppError("이미 응모를 완료한 이벤트입니다.", 409);
      }

      throw error;
    }
  }));
}

export async function listEventEntries(sellerId: string, eventId: string) {
  await ensureSellerOwnsEvent(sellerId, eventId);

  const result = await query<EventEntryQueryRow>(
    `
      SELECT
        entry_row.id,
        entry_row.event_id,
        entry_row.user_id,
        ${safeUserLoginIdSql("entry_row.user_id")} AS user_threads_username,
        entry_row.created_at
      FROM event_entries entry_row
      WHERE entry_row.event_id = $1
      ORDER BY entry_row.created_at DESC
    `,
    [eventId],
  );

  return (await hydrateEventEntryRows(result.rows)).map(mapEventEntry);
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
