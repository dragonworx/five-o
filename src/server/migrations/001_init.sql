-- Five-O initial schema. Applied once by the migration runner in db.ts.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS guest (
  id              TEXT PRIMARY KEY,              -- uuidv7
  name            TEXT NOT NULL,
  name_normalised TEXT NOT NULL,
  attending       INTEGER,                       -- NULL = not answered, 1 = yes, 0 = no
  adults          INTEGER NOT NULL DEFAULT 0,
  kids            INTEGER NOT NULL DEFAULT 0,
  is_musician     INTEGER NOT NULL DEFAULT 0,
  diet            TEXT CHECK (diet IN ('omnivore','vegetarian','vegan')),
  message         TEXT,
  slides_seen_at  TEXT,
  merged_into     TEXT REFERENCES guest(id),     -- non-null => hidden from admin totals
  overridden_from TEXT REFERENCES guest(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,

  -- A decline can never carry a headcount. Enforced by the database, not just
  -- the form, so a bad client or a hand-edit can't inflate the catering numbers.
  CHECK (attending = 1 OR (adults = 0 AND kids = 0)),
  -- An acceptance must bring at least one person.
  CHECK (attending IS NOT 1 OR adults >= 1)
);
CREATE INDEX IF NOT EXISTS idx_guest_name ON guest(name_normalised);
CREATE INDEX IF NOT EXISTS idx_guest_attending ON guest(attending) WHERE merged_into IS NULL;

CREATE TABLE IF NOT EXISTS identity_signal (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id    TEXT NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('cookie','local','idb','cache','fingerprint','ipua')),
  value_hash  TEXT NOT NULL,
  weight      REAL NOT NULL,                     -- mutable: decay & collision penalties
  hits        INTEGER NOT NULL DEFAULT 1,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  UNIQUE (kind, value_hash, guest_id)
);
CREATE INDEX IF NOT EXISTS idx_signal_lookup ON identity_signal(kind, value_hash);

CREATE TABLE IF NOT EXISTS visit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id      TEXT REFERENCES guest(id) ON DELETE SET NULL,
  outcome       TEXT NOT NULL,                   -- new|auto|soft|ambiguous|override|lookup
  score         REAL,
  matched_kinds TEXT,                            -- json array, for tuning weights later
  ua            TEXT,
  ip_hash       TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (               -- append-only edit history
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  created_at  TEXT NOT NULL
);
