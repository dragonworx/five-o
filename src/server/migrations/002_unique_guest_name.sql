-- One active guest per full name (compared case-, accent- and whitespace-insensitively
-- via name_normalised). Merged shells are excluded so a merge can keep the survivor's
-- name. If this fails on a database that already holds duplicates, merge or rename the
-- offenders first:
--   SELECT name_normalised, COUNT(*) FROM guest WHERE merged_into IS NULL
--   GROUP BY name_normalised HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_name_unique
  ON guest(name_normalised) WHERE merged_into IS NULL;
