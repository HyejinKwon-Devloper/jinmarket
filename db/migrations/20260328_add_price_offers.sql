ALTER TABLE products
ADD COLUMN IF NOT EXISTS allow_price_offer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS price_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offered_price_krw INTEGER NOT NULL CHECK (offered_price_krw > 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_offers_product
    ON price_offers(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_offers_buyer
    ON price_offers(buyer_id, created_at DESC);
