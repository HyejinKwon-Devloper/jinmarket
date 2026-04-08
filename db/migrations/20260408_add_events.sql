CREATE TYPE event_registration_mode AS ENUM (
    'MANUAL',
    'SHOP_ENTRY'
);

CREATE TABLE events (
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

CREATE TABLE event_images (
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

CREATE TABLE event_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

CREATE UNIQUE INDEX uq_event_primary_image
    ON event_images(event_id)
    WHERE is_primary = TRUE;

CREATE INDEX idx_events_seller_created
    ON events(seller_id, created_at DESC);

CREATE INDEX idx_events_public_window
    ON events(starts_at, ends_at, created_at DESC);

CREATE INDEX idx_event_entries_event
    ON event_entries(event_id, created_at DESC);

CREATE INDEX idx_event_entries_user
    ON event_entries(user_id, created_at DESC);
