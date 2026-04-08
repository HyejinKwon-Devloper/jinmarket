CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE role_code AS ENUM (
    'BUYER',
    'SELLER',
    'ADMIN'
);

CREATE TYPE auth_provider AS ENUM (
    'THREADS'
);

CREATE TYPE seller_status AS ENUM (
    'ACTIVE',
    'SUSPENDED'
);

CREATE TYPE seller_access_request_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);

CREATE TYPE image_provider AS ENUM (
    'CLOUDINARY'
);

CREATE TYPE product_purchase_type AS ENUM (
    'INSTANT_BUY',
    'GAME_CHANCE'
);

CREATE TYPE game_type AS ENUM (
    'ROCK_PAPER_SCISSORS'
);

CREATE TYPE product_status AS ENUM (
    'DRAFT',
    'OPEN',
    'SOLD_OUT',
    'CANCELLED'
);

CREATE TYPE rps_choice AS ENUM (
    'ROCK',
    'PAPER',
    'SCISSORS'
);

CREATE TYPE game_result AS ENUM (
    'WIN',
    'LOSE',
    'DRAW'
);

CREATE TYPE order_source AS ENUM (
    'INSTANT_BUY',
    'GAME_CHANCE_WIN',
    'PRICE_OFFER_ACCEPTED'
);

CREATE TYPE order_status AS ENUM (
    'PENDING_CONTACT',
    'CONTACTED',
    'TRANSFER_PENDING',
    'COMPLETED',
    'CANCELLED'
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(60) NOT NULL,
    profile_image_url TEXT,
    email VARCHAR(255),
    seller_email_verified_at TIMESTAMPTZ,
    phone_number VARCHAR(30),
    kakao_id VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role role_code NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role)
);

CREATE TABLE auth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider auth_provider NOT NULL,
    provider_user_id VARCHAR(120) NOT NULL,
    provider_username VARCHAR(120),
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id),
    UNIQUE (user_id, provider)
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_accessed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE local_auth_credentials (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    login_id VARCHAR(120) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE signup_verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login_id VARCHAR(120) NOT NULL UNIQUE,
    display_name VARCHAR(60) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    verification_code_hash TEXT NOT NULL,
    code_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seller_email_verification_requests (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    verification_code_hash TEXT NOT NULL,
    code_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_requests (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    verification_code_hash TEXT NOT NULL,
    code_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE legacy_account_activation_requests (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    verification_code_hash TEXT NOT NULL,
    code_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seller_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    shop_name VARCHAR(80) NOT NULL,
    introduction TEXT,
    bank_name VARCHAR(100) NOT NULL,
    bank_account_holder VARCHAR(100) NOT NULL,
    bank_account_number_encrypted TEXT NOT NULL,
    contact_phone VARCHAR(30),
    contact_kakao_id VARCHAR(100),
    status seller_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE seller_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status seller_access_request_status NOT NULL DEFAULT 'PENDING',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    review_note TEXT
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(120) NOT NULL,
    description TEXT,
    price_krw INTEGER NOT NULL CHECK (price_krw >= 0),
    is_free_share BOOLEAN NOT NULL DEFAULT FALSE,
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    allow_price_offer BOOLEAN NOT NULL DEFAULT FALSE,
    purchase_type product_purchase_type NOT NULL,
    game_type game_type,
    status product_status NOT NULL DEFAULT 'DRAFT',
    published_at TIMESTAMPTZ,
    sale_ends_at TIMESTAMPTZ,
    sold_out_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (purchase_type = 'INSTANT_BUY' AND game_type IS NULL)
        OR
        (purchase_type = 'GAME_CHANCE' AND game_type IS NOT NULL)
    ),
    CONSTRAINT products_free_share_consistency_check CHECK (
        (is_free_share = TRUE AND price_krw = 0 AND allow_price_offer = FALSE)
        OR
        (is_free_share = FALSE AND price_krw > 0)
    ),
    CONSTRAINT products_sale_period_check CHECK (
        sale_ends_at IS NULL
        OR published_at IS NULL
        OR sale_ends_at > published_at
    )
);

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
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

CREATE TABLE game_purchase_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    game_type game_type NOT NULL,
    player_choice rps_choice NOT NULL,
    system_choice rps_choice NOT NULL,
    result game_result NOT NULL,
    played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, user_id)
);

CREATE TABLE price_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offered_price_krw INTEGER NOT NULL CHECK (offered_price_krw > 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    buyer_id UUID NOT NULL REFERENCES users(id),
    source order_source NOT NULL,
    game_attempt_id UUID UNIQUE REFERENCES game_purchase_attempts(id),
    status order_status NOT NULL DEFAULT 'PENDING_CONTACT',
    payment_method VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
    seller_message TEXT,
    buyer_note TEXT,
    ordered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seller_contacted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (seller_id <> buyer_id),
    CONSTRAINT orders_game_attempt_source_check CHECK (
        (source = 'INSTANT_BUY' AND game_attempt_id IS NULL)
        OR
        (source = 'GAME_CHANCE_WIN' AND game_attempt_id IS NOT NULL)
        OR
        (source = 'PRICE_OFFER_ACCEPTED' AND game_attempt_id IS NULL)
    )
);

CREATE UNIQUE INDEX uq_product_primary_image
    ON product_images(product_id)
    WHERE is_primary = TRUE;

CREATE UNIQUE INDEX uq_orders_active_product
    ON orders(product_id)
    WHERE status <> 'CANCELLED';

CREATE INDEX idx_products_seller_status
    ON products(seller_id, status, created_at DESC);

CREATE INDEX idx_products_public_list
    ON products(status, is_free_share, purchase_type, published_at, sale_ends_at, created_at DESC);

CREATE INDEX idx_game_purchase_attempts_product
    ON game_purchase_attempts(product_id, played_at DESC);

CREATE INDEX idx_game_purchase_attempts_user
    ON game_purchase_attempts(user_id, played_at DESC);

CREATE INDEX idx_price_offers_product
    ON price_offers(product_id, created_at DESC);

CREATE INDEX idx_price_offers_buyer
    ON price_offers(buyer_id, created_at DESC);

CREATE INDEX idx_orders_seller_status
    ON orders(seller_id, status, ordered_at DESC);

CREATE INDEX idx_orders_buyer_status
    ON orders(buyer_id, status, ordered_at DESC);

CREATE INDEX idx_user_sessions_user_id
    ON user_sessions(user_id, expires_at DESC);

CREATE INDEX idx_seller_access_requests_status
    ON seller_access_requests(status, requested_at ASC);

CREATE UNIQUE INDEX uq_users_email_ci
    ON users(LOWER(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX uq_seller_access_requests_pending
    ON seller_access_requests(user_id)
    WHERE status = 'PENDING';
