ALTER TABLE users
    ADD COLUMN IF NOT EXISTS seller_email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS seller_email_verification_requests (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    verification_code_hash TEXT NOT NULL,
    code_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
