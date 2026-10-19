-- Source-video frames are private candidate references, never recipe/menu assets.
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
PRAGMA recursive_triggers = ON;
BEGIN IMMEDIATE;
CREATE TABLE favorite_candidate_illustrations (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES favorite_candidates(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  digest TEXT NOT NULL CHECK(length(digest)=64),
  document TEXT NOT NULL CHECK(json_valid(document) AND json_type(document)='object'),
  created_at TEXT NOT NULL,
  UNIQUE(candidate_id,digest)
) STRICT;
CREATE INDEX favorite_illustrations_candidate ON favorite_candidate_illustrations(candidate_id,created_at,id);
CREATE TRIGGER favorite_illustrations_no_update BEFORE UPDATE ON favorite_candidate_illustrations
BEGIN SELECT RAISE(ABORT,'Candidate illustration events are immutable'); END;
CREATE TRIGGER favorite_illustrations_no_delete BEFORE DELETE ON favorite_candidate_illustrations
BEGIN SELECT RAISE(ABORT,'Candidate illustration events are immutable'); END;
COMMIT;
