ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'PRICE_OFFER_ACCEPTED';

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
    INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%game_attempt_id%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE orders
ADD CONSTRAINT orders_game_attempt_source_check CHECK (
  (source = 'INSTANT_BUY' AND game_attempt_id IS NULL)
  OR
  (source = 'GAME_CHANCE_WIN' AND game_attempt_id IS NOT NULL)
  OR
  (source = 'PRICE_OFFER_ACCEPTED' AND game_attempt_id IS NULL)
);
