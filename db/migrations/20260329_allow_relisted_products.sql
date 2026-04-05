ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_product_id_key;

DROP INDEX IF EXISTS uq_orders_active_product;

CREATE UNIQUE INDEX uq_orders_active_product
    ON orders(product_id)
    WHERE status <> 'CANCELLED';

UPDATE orders
SET status = 'CANCELLED',
    cancelled_at = COALESCE(cancelled_at, NOW()),
    updated_at = NOW()
WHERE product_id IN (
    SELECT id
    FROM products
    WHERE status = 'OPEN'
)
  AND status <> 'CANCELLED';

UPDATE products
SET sold_out_at = NULL,
    updated_at = NOW()
WHERE status = 'OPEN'
  AND sold_out_at IS NOT NULL;
