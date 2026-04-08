CREATE TABLE IF NOT EXISTS signup_verification_requests (
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci
    ON users(LOWER(email))
    WHERE email IS NOT NULL;
