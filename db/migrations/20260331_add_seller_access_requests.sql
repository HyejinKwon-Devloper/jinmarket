DO $$
BEGIN
  CREATE TYPE seller_access_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS seller_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status seller_access_request_status NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_seller_access_requests_status
  ON seller_access_requests(status, requested_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_access_requests_pending
  ON seller_access_requests(user_id)
  WHERE status = 'PENDING';
