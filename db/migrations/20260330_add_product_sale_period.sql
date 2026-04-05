ALTER TABLE products
    ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;

UPDATE products
SET published_at = created_at
WHERE published_at IS NULL;

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_sale_period_check;

ALTER TABLE products
    ADD CONSTRAINT products_sale_period_check CHECK (
        sale_ends_at IS NULL
        OR published_at IS NULL
        OR sale_ends_at > published_at
    );

DROP INDEX IF EXISTS idx_products_public_list;

CREATE INDEX idx_products_public_list
    ON products(status, is_free_share, purchase_type, published_at, sale_ends_at, created_at DESC);
