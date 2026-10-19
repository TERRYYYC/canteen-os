-- Canteen KB / SQLite M1. Apply once to an empty dedicated database.
-- SQL syntax requires SQLite >= 3.38 (STRICT + built-in JSON).
-- Deployment requires >= 3.51.3, or a verified WAL-reset fix backport.
-- Application generates UUIDs, binds exact amounts as strings, and validates
-- JSON Schema before beginning a transaction. See README.md for service rules.
-- These connection settings MUST also be applied/verified by every connection.
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
PRAGMA recursive_triggers = ON;

-- journal_mode=WAL is configured by deployment before migrations, not here.
BEGIN IMMEDIATE;

CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (json_valid(title) AND json_type(title) = 'object'),
  description TEXT CHECK (description IS NULL OR (json_valid(description) AND json_type(description) = 'object')),
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array' AND json_array_length(tags) <= 50),
  base_servings INTEGER CHECK (base_servings > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
-- No UNIQUE(title), no parent dish: same-name recipes remain independent.
CREATE INDEX recipes_page_idx ON recipes(updated_at DESC,id DESC) WHERE archived_at IS NULL;

CREATE TABLE ingredients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (json_valid(name) AND json_type(name) = 'object'),
  aliases TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases) AND json_type(aliases) = 'array'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  ingredient_id TEXT REFERENCES ingredients(id),
  name TEXT NOT NULL CHECK (json_valid(name) AND json_type(name) = 'object'),
  raw_text TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'unspecified' CHECK (role IN ('main','seasoning','unspecified')),
  amount_kind TEXT NOT NULL DEFAULT 'unknown' CHECK (amount_kind IN ('unknown','exact','to_taste','text')),
  -- Do not change to NUMERIC or REAL: TEXT preserves 0.123456789... exactly.
  amount_value TEXT,
  amount_unit TEXT,
  amount_raw TEXT NOT NULL DEFAULT '',
  preparation TEXT CHECK (preparation IS NULL OR (json_valid(preparation) AND json_type(preparation) = 'object')),
  UNIQUE(recipe_id,position),
  CHECK (
    (amount_kind = 'exact' AND amount_value IS NOT NULL
      AND length(amount_value) BETWEEN 1 AND 40
      AND amount_value NOT GLOB '*[^0-9.]*'
      AND amount_value GLOB '*[1-9]*'
      AND substr(amount_value,1,1) BETWEEN '0' AND '9'
      AND substr(amount_value,-1,1) BETWEEN '0' AND '9'
      AND (instr(amount_value,'.') = 0 OR instr(substr(amount_value,instr(amount_value,'.') + 1),'.') = 0)
      AND (substr(amount_value,1,1) <> '0' OR substr(amount_value,1,2) = '0.')
      AND amount_unit IS NOT NULL AND length(trim(amount_unit)) > 0)
    OR
    (amount_kind <> 'exact' AND amount_value IS NULL AND amount_unit IS NULL
      AND (amount_kind = 'unknown' OR length(trim(amount_raw)) > 0))
  )
) STRICT;
CREATE INDEX recipe_ingredients_identity_idx ON recipe_ingredients(ingredient_id,recipe_id);

CREATE TABLE recipe_steps (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  text TEXT NOT NULL CHECK (json_valid(text) AND json_type(text) = 'object'),
  UNIQUE(id,recipe_id),
  UNIQUE(recipe_id,position)
) STRICT;

CREATE TABLE assets (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image','video','audio','document')),
  storage TEXT NOT NULL CHECK (storage IN ('external','local','s3')),
  object_key TEXT,
  external_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','ready','failed')),
  sha256 TEXT CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')),
  mime_type TEXT,
  byte_size INTEGER CHECK (byte_size >= 0),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (
    (storage = 'external' AND external_url IS NOT NULL
      AND (external_url GLOB 'https://?*' OR external_url GLOB 'http://?*') AND object_key IS NULL)
    OR
    (storage IN ('local','s3') AND object_key IS NOT NULL AND length(trim(object_key)) > 0 AND external_url IS NULL)
  )
) STRICT;
CREATE UNIQUE INDEX assets_object_key_idx ON assets(storage,object_key) WHERE object_key IS NOT NULL;

CREATE TABLE sources (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('web','video','file','text')),
  title TEXT,
  author TEXT,
  url TEXT CHECK (url IS NULL OR url GLOB 'https://?*' OR url GLOB 'http://?*'),
  text_content TEXT,
  asset_id TEXT REFERENCES assets(id),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (url IS NOT NULL OR asset_id IS NOT NULL OR coalesce(length(trim(text_content)),0) > 0)
) STRICT;

CREATE TABLE recipe_sources (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  evidence TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(evidence) AND json_type(evidence) = 'object'),
  PRIMARY KEY(recipe_id,source_id)
) STRICT;
CREATE INDEX recipe_sources_source_idx ON recipe_sources(source_id);

CREATE TABLE recipe_assets (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  role TEXT NOT NULL CHECK (role IN ('cover','step','reference')),
  step_id TEXT,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  -- Seconds, per import-batch v1. Media timestamps are approximate; food amounts are not.
  clip_start REAL,
  clip_end REAL,
  FOREIGN KEY(step_id,recipe_id) REFERENCES recipe_steps(id,recipe_id),
  CHECK ((role = 'step' AND step_id IS NOT NULL) OR (role <> 'step' AND step_id IS NULL)),
  CHECK ((clip_start IS NULL AND clip_end IS NULL)
    OR (clip_start IS NOT NULL AND clip_end IS NOT NULL AND clip_start >= 0
      AND clip_end > clip_start AND clip_end <= 1.7976931348623157e308))
) STRICT;
CREATE UNIQUE INDEX recipe_cover_idx ON recipe_assets(recipe_id) WHERE role = 'cover';
CREATE INDEX recipe_assets_lookup_idx ON recipe_assets(recipe_id,position,id);
CREATE INDEX recipe_assets_asset_idx ON recipe_assets(asset_id);
CREATE INDEX recipe_assets_step_idx ON recipe_assets(step_id,recipe_id);

CREATE TABLE recipe_revisions (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  version INTEGER NOT NULL CHECK (version > 0),
  document TEXT NOT NULL CHECK (json_valid(document) AND json_type(document) = 'object'),
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(recipe_id,version)
) STRICT;

CREATE TABLE write_receipts (
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  request_key TEXT NOT NULL CHECK (length(trim(request_key)) BETWEEN 1 AND 200),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  http_status INTEGER NOT NULL CHECK (http_status BETWEEN 200 AND 299),
  response TEXT NOT NULL CHECK (json_valid(response) AND json_type(response) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(actor,request_key)
) STRICT;

-- Validation triggers follow. CHECK cannot use json_each subqueries.
-- SQL tables are not a public import API; full JSON Schema is enforced by service.

CREATE TRIGGER recipes_title_insert BEFORE INSERT ON recipes
WHEN NEW.title IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.title)) = 0
  OR (SELECT count(*) FROM json_each(NEW.title)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.title))
  OR EXISTS (SELECT 1 FROM json_each(NEW.title) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipes.title');
END;

CREATE TRIGGER recipes_title_update BEFORE UPDATE ON recipes
WHEN NEW.title IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.title)) = 0
  OR (SELECT count(*) FROM json_each(NEW.title)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.title))
  OR EXISTS (SELECT 1 FROM json_each(NEW.title) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipes.title');
END;

CREATE TRIGGER recipes_description_insert BEFORE INSERT ON recipes
WHEN NEW.description IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.description)) = 0
  OR (SELECT count(*) FROM json_each(NEW.description)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.description))
  OR EXISTS (SELECT 1 FROM json_each(NEW.description) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipes.description');
END;

CREATE TRIGGER recipes_description_update BEFORE UPDATE ON recipes
WHEN NEW.description IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.description)) = 0
  OR (SELECT count(*) FROM json_each(NEW.description)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.description))
  OR EXISTS (SELECT 1 FROM json_each(NEW.description) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipes.description');
END;

CREATE TRIGGER ingredients_name_insert BEFORE INSERT ON ingredients
WHEN NEW.name IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.name)) = 0
  OR (SELECT count(*) FROM json_each(NEW.name)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.name))
  OR EXISTS (SELECT 1 FROM json_each(NEW.name) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n ingredients.name');
END;

CREATE TRIGGER ingredients_name_update BEFORE UPDATE ON ingredients
WHEN NEW.name IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.name)) = 0
  OR (SELECT count(*) FROM json_each(NEW.name)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.name))
  OR EXISTS (SELECT 1 FROM json_each(NEW.name) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n ingredients.name');
END;

CREATE TRIGGER recipe_ingredients_name_insert BEFORE INSERT ON recipe_ingredients
WHEN NEW.name IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.name)) = 0
  OR (SELECT count(*) FROM json_each(NEW.name)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.name))
  OR EXISTS (SELECT 1 FROM json_each(NEW.name) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipe_ingredients.name');
END;

CREATE TRIGGER recipe_ingredients_name_update BEFORE UPDATE ON recipe_ingredients
WHEN NEW.name IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.name)) = 0
  OR (SELECT count(*) FROM json_each(NEW.name)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.name))
  OR EXISTS (SELECT 1 FROM json_each(NEW.name) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipe_ingredients.name');
END;

CREATE TRIGGER recipe_ingredients_preparation_insert BEFORE INSERT ON recipe_ingredients
WHEN NEW.preparation IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.preparation)) = 0
  OR (SELECT count(*) FROM json_each(NEW.preparation)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.preparation))
  OR EXISTS (SELECT 1 FROM json_each(NEW.preparation) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipe_ingredients.preparation');
END;

CREATE TRIGGER recipe_ingredients_preparation_update BEFORE UPDATE ON recipe_ingredients
WHEN NEW.preparation IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.preparation)) = 0
  OR (SELECT count(*) FROM json_each(NEW.preparation)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.preparation))
  OR EXISTS (SELECT 1 FROM json_each(NEW.preparation) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipe_ingredients.preparation');
END;

CREATE TRIGGER recipe_steps_text_insert BEFORE INSERT ON recipe_steps
WHEN NEW.text IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.text)) = 0
  OR (SELECT count(*) FROM json_each(NEW.text)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.text))
  OR EXISTS (SELECT 1 FROM json_each(NEW.text) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipe_steps.text');
END;

CREATE TRIGGER recipe_steps_text_update BEFORE UPDATE ON recipe_steps
WHEN NEW.text IS NOT NULL AND (
  (SELECT count(*) FROM json_each(NEW.text)) = 0
  OR (SELECT count(*) FROM json_each(NEW.text)) <> (SELECT count(DISTINCT key) FROM json_each(NEW.text))
  OR EXISTS (SELECT 1 FROM json_each(NEW.text) e WHERE e.key NOT IN ('zh','en','uk')
    OR e.type <> 'text' OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0
    OR length(e.value) > 20000)
)
BEGIN
  SELECT RAISE(ABORT,'invalid i18n recipe_steps.text');
END;

CREATE TRIGGER recipes_tags_insert BEFORE INSERT ON recipes
WHEN EXISTS (SELECT 1 FROM json_each(NEW.tags) e WHERE e.type <> 'text'
    OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0 OR length(e.value) > 100)
  OR (SELECT count(*) FROM json_each(NEW.tags)) <> (SELECT count(DISTINCT value) FROM json_each(NEW.tags))
BEGIN
  SELECT RAISE(ABORT,'invalid string array recipes.tags');
END;

CREATE TRIGGER recipes_tags_update BEFORE UPDATE ON recipes
WHEN EXISTS (SELECT 1 FROM json_each(NEW.tags) e WHERE e.type <> 'text'
    OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0 OR length(e.value) > 100)
  OR (SELECT count(*) FROM json_each(NEW.tags)) <> (SELECT count(DISTINCT value) FROM json_each(NEW.tags))
BEGIN
  SELECT RAISE(ABORT,'invalid string array recipes.tags');
END;

CREATE TRIGGER ingredients_aliases_insert BEFORE INSERT ON ingredients
WHEN EXISTS (SELECT 1 FROM json_each(NEW.aliases) e WHERE e.type <> 'text'
    OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0 OR length(e.value) > 20000)
  OR (SELECT count(*) FROM json_each(NEW.aliases)) <> (SELECT count(DISTINCT value) FROM json_each(NEW.aliases))
BEGIN
  SELECT RAISE(ABORT,'invalid string array ingredients.aliases');
END;

CREATE TRIGGER ingredients_aliases_update BEFORE UPDATE ON ingredients
WHEN EXISTS (SELECT 1 FROM json_each(NEW.aliases) e WHERE e.type <> 'text'
    OR length(trim(e.value,char(9)||char(10)||char(11)||char(12)||char(13)||' ')) = 0 OR length(e.value) > 20000)
  OR (SELECT count(*) FROM json_each(NEW.aliases)) <> (SELECT count(DISTINCT value) FROM json_each(NEW.aliases))
BEGIN
  SELECT RAISE(ABORT,'invalid string array ingredients.aliases');
END;

CREATE TRIGGER recipes_uuid_insert BEFORE INSERT ON recipes
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER recipes_uuid_update BEFORE UPDATE ON recipes
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER ingredients_uuid_insert BEFORE INSERT ON ingredients
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER ingredients_uuid_update BEFORE UPDATE ON ingredients
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER recipe_ingredients_uuid_insert BEFORE INSERT ON recipe_ingredients
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER recipe_ingredients_uuid_update BEFORE UPDATE ON recipe_ingredients
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER recipe_steps_uuid_insert BEFORE INSERT ON recipe_steps
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER recipe_steps_uuid_update BEFORE UPDATE ON recipe_steps
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER assets_uuid_insert BEFORE INSERT ON assets
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER assets_uuid_update BEFORE UPDATE ON assets
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER sources_uuid_insert BEFORE INSERT ON sources
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER sources_uuid_update BEFORE UPDATE ON sources
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER recipe_assets_uuid_insert BEFORE INSERT ON recipe_assets
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER recipe_assets_uuid_update BEFORE UPDATE ON recipe_assets
WHEN length(NEW.id) <> 36 OR length(replace(NEW.id,'-','')) <> 32
  OR NEW.id GLOB '*[^0-9a-f-]*'
  OR substr(NEW.id,9,1) <> '-' OR substr(NEW.id,14,1) <> '-'
  OR substr(NEW.id,19,1) <> '-' OR substr(NEW.id,24,1) <> '-'
BEGIN
  SELECT RAISE(ABORT,'id must be a lowercase UUID');
END;

CREATE TRIGGER sources_immutable_update BEFORE UPDATE ON sources
BEGIN
  SELECT RAISE(ABORT,'sources is append-only');
END;

CREATE TRIGGER sources_immutable_delete BEFORE DELETE ON sources
BEGIN
  SELECT RAISE(ABORT,'sources is append-only');
END;

CREATE TRIGGER recipe_revisions_immutable_update BEFORE UPDATE ON recipe_revisions
BEGIN
  SELECT RAISE(ABORT,'recipe_revisions is append-only');
END;

CREATE TRIGGER recipe_revisions_immutable_delete BEFORE DELETE ON recipe_revisions
BEGIN
  SELECT RAISE(ABORT,'recipe_revisions is append-only');
END;

CREATE TRIGGER write_receipts_immutable_update BEFORE UPDATE ON write_receipts
BEGIN
  SELECT RAISE(ABORT,'write_receipts is append-only');
END;

CREATE TRIGGER write_receipts_immutable_delete BEFORE DELETE ON write_receipts
BEGIN
  SELECT RAISE(ABORT,'write_receipts is append-only');
END;

-- Application must still use UPDATE ... WHERE id=? AND version=? and check changes().
CREATE TRIGGER recipes_version_update BEFORE UPDATE ON recipes
WHEN NEW.version <> OLD.version + 1 OR NEW.id <> OLD.id
BEGIN
  SELECT RAISE(ABORT,'recipe update must keep id and advance version by one');
END;

-- Do not use INSERT OR REPLACE. It is deletion + insertion, not an update.
-- Foreign keys intentionally have no ON DELETE CASCADE: archive instead.
COMMIT;
