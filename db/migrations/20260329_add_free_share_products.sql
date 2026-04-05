ALTER TABLE products
    ADD COLUMN IF NOT EXISTS is_free_share BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_price_krw_check;

ALTER TABLE products
    ADD CONSTRAINT products_price_krw_check CHECK (price_krw >= 0);

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_free_share_consistency_check;

ALTER TABLE products
    ADD CONSTRAINT products_free_share_consistency_check CHECK (
        (is_free_share = TRUE AND price_krw = 0 AND allow_price_offer = FALSE)
        OR
        (is_free_share = FALSE AND price_krw > 0)
    );

DROP INDEX IF EXISTS idx_products_public_list;

CREATE INDEX idx_products_public_list
    ON products(status, is_free_share, purchase_type, created_at DESC);
