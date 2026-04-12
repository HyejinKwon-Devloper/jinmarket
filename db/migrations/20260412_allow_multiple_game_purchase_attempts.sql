DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
    INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'game_purchase_attempts'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%product_id, user_id%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE game_purchase_attempts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
