-- Durable source inbox. Import rows preserve every submitted card, including rejects.
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
PRAGMA recursive_triggers = ON;
BEGIN IMMEDIATE;

CREATE TABLE favorite_import_batches (
  id TEXT PRIMARY KEY,
  digest TEXT NOT NULL UNIQUE CHECK(length(digest)=64),
  folder TEXT NOT NULL,
  claimed_count INTEGER NOT NULL CHECK(claimed_count >= 0),
  submitted_count INTEGER NOT NULL CHECK(submitted_count >= 0),
  valid_count INTEGER NOT NULL CHECK(valid_count >= 0),
  inserted_count INTEGER NOT NULL CHECK(inserted_count >= 0),
  rejected_count INTEGER NOT NULL CHECK(rejected_count >= 0),
  coverage_gap INTEGER NOT NULL CHECK(coverage_gap >= 0),
  imported_at TEXT NOT NULL
) STRICT;

CREATE TABLE favorite_source_items (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK(platform='douyin'),
  content_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('video','note')),
  url TEXT NOT NULL,
  folder TEXT NOT NULL,
  first_index INTEGER NOT NULL CHECK(first_index > 0),
  author TEXT NOT NULL,
  card_alt TEXT NOT NULL,
  display_text TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'evidence_pending' CHECK(state IN ('evidence_pending','evidence_ready','draft_ready','needs_review','approved','blocked_auth','unavailable','non_recipe','rejected')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform,content_id)
) STRICT;
CREATE INDEX favorite_items_page ON favorite_source_items(folder,first_index,id);
CREATE INDEX favorite_items_state ON favorite_source_items(state,folder);

CREATE TABLE favorite_import_rows (
  batch_id TEXT NOT NULL REFERENCES favorite_import_batches(id),
  row_number INTEGER NOT NULL CHECK(row_number > 0),
  raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
  source_item_id TEXT REFERENCES favorite_source_items(id),
  rejection_code TEXT,
  PRIMARY KEY(batch_id,row_number),
  CHECK((source_item_id IS NULL) <> (rejection_code IS NULL))
) STRICT;
CREATE INDEX favorite_import_rows_item ON favorite_import_rows(source_item_id);

CREATE TABLE favorite_capture_jobs (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES favorite_source_items(id),
  method TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','leased','succeeded','blocked','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  lease_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX favorite_capture_jobs_claim ON favorite_capture_jobs(state,lease_until,created_at);

CREATE TABLE favorite_captures (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES favorite_source_items(id),
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ready','blocked_auth','unavailable','card_only')),
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json) AND json_type(evidence_json)='object'),
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  captured_at TEXT NOT NULL,
  UNIQUE(source_item_id,sha256)
) STRICT;
CREATE INDEX favorite_captures_item ON favorite_captures(source_item_id,captured_at);

CREATE TABLE favorite_candidates (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL REFERENCES favorite_source_items(id),
  capture_id TEXT NOT NULL REFERENCES favorite_captures(id),
  digest TEXT NOT NULL CHECK(length(digest)=64),
  document TEXT NOT NULL CHECK(json_valid(document) AND json_type(document)='object'),
  status TEXT NOT NULL CHECK(status IN ('needs_review','approved','rejected')),
  reviewer TEXT,
  review_note TEXT,
  recipe_id TEXT REFERENCES recipes(id),
  recipe_version INTEGER CHECK(recipe_version IS NULL OR recipe_version > 0),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE(source_item_id,capture_id,digest),
  CHECK((status='needs_review' AND reviewer IS NULL AND reviewed_at IS NULL AND recipe_id IS NULL AND recipe_version IS NULL)
    OR (status='rejected' AND reviewer IS NOT NULL AND reviewed_at IS NOT NULL AND recipe_id IS NULL AND recipe_version IS NULL)
    OR (status='approved' AND reviewer IS NOT NULL AND reviewed_at IS NOT NULL AND recipe_id IS NOT NULL AND recipe_version IS NOT NULL))
) STRICT;
CREATE INDEX favorite_candidates_item ON favorite_candidates(source_item_id,created_at);

CREATE TABLE favorite_classifications (
  source_item_id TEXT PRIMARY KEY REFERENCES favorite_source_items(id),
  capture_id TEXT NOT NULL REFERENCES favorite_captures(id),
  decision TEXT NOT NULL CHECK(decision='non_recipe'),
  reviewer TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

COMMIT;
