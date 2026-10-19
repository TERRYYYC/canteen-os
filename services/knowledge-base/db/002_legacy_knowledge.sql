-- Additive integration. 001_core.sql remains immutable after deployment.
BEGIN IMMEDIATE;

CREATE TABLE legacy_imports (
  id TEXT PRIMARY KEY NOT NULL,
  namespace TEXT NOT NULL,
  source_revision TEXT NOT NULL CHECK(length(source_revision)=40 AND source_revision NOT GLOB '*[^0-9a-f]*'),
  manifest_hash TEXT NOT NULL CHECK(length(manifest_hash)=64),
  result TEXT NOT NULL CHECK(json_valid(result) AND json_type(result)='object'),
  created_at TEXT NOT NULL,
  UNIQUE(namespace,source_revision)
) STRICT;

CREATE TABLE legacy_files (
  import_id TEXT NOT NULL REFERENCES legacy_imports(id),
  path TEXT NOT NULL,
  raw_bytes BLOB NOT NULL,
  sha256 TEXT NOT NULL,
  git_blob_sha TEXT NOT NULL,
  PRIMARY KEY(import_id,path)
) STRICT;

CREATE TABLE legacy_bindings (
  namespace TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('dish','ingredient','technique')),
  legacy_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_version INTEGER CHECK(target_version>0),
  import_id TEXT NOT NULL REFERENCES legacy_imports(id),
  source_path TEXT NOT NULL,
  source_pointer TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(namespace,kind,legacy_id),
  UNIQUE(kind,target_id)
) STRICT;

CREATE TABLE ingredient_knowledge (
  ingredient_id TEXT PRIMARY KEY NOT NULL REFERENCES ingredients(id),
  document TEXT NOT NULL CHECK(json_valid(document) AND json_type(document)='object')
) STRICT;

CREATE TABLE techniques (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('cut','heat','pretreat')),
  name TEXT NOT NULL CHECK(json_valid(name) AND json_type(name)='object'),
  note TEXT CHECK(note IS NULL OR (json_valid(note) AND json_type(note)='object')),
  document TEXT NOT NULL CHECK(json_valid(document) AND json_type(document)='object')
) STRICT;

CREATE TABLE legacy_recipe_evidence (
  recipe_id TEXT PRIMARY KEY NOT NULL REFERENCES recipes(id),
  import_id TEXT NOT NULL REFERENCES legacy_imports(id),
  document TEXT NOT NULL CHECK(json_valid(document) AND json_type(document)='object')
) STRICT;

CREATE TRIGGER legacy_imports_no_update BEFORE UPDATE ON legacy_imports BEGIN SELECT RAISE(ABORT,'legacy import is immutable'); END;
CREATE TRIGGER legacy_imports_no_delete BEFORE DELETE ON legacy_imports BEGIN SELECT RAISE(ABORT,'legacy import is immutable'); END;
CREATE TRIGGER legacy_files_no_update BEFORE UPDATE ON legacy_files BEGIN SELECT RAISE(ABORT,'legacy file is immutable'); END;
CREATE TRIGGER legacy_files_no_delete BEFORE DELETE ON legacy_files BEGIN SELECT RAISE(ABORT,'legacy file is immutable'); END;
CREATE TRIGGER legacy_bindings_no_update BEFORE UPDATE ON legacy_bindings BEGIN SELECT RAISE(ABORT,'legacy binding requires an explicit migration'); END;
CREATE TRIGGER legacy_bindings_no_delete BEFORE DELETE ON legacy_bindings BEGIN SELECT RAISE(ABORT,'legacy binding is immutable'); END;
CREATE TRIGGER legacy_evidence_no_update BEFORE UPDATE ON legacy_recipe_evidence BEGIN SELECT RAISE(ABORT,'legacy evidence is immutable'); END;
CREATE TRIGGER legacy_evidence_no_delete BEFORE DELETE ON legacy_recipe_evidence BEGIN SELECT RAISE(ABORT,'legacy evidence is immutable'); END;

COMMIT;
