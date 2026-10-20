-- Version standard techniques without changing legacy documents or approvals.
BEGIN IMMEDIATE;
ALTER TABLE techniques ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE techniques ADD COLUMN created_at TEXT;
CREATE TABLE technique_revisions (
 technique_id TEXT NOT NULL REFERENCES techniques(id),
 version INTEGER NOT NULL CHECK(version>0),
 document TEXT NOT NULL CHECK(json_valid(document) AND json_type(document)='object'),
 created_at TEXT,
 PRIMARY KEY(technique_id,version)
) STRICT;
INSERT INTO technique_revisions(technique_id,version,document,created_at)
SELECT id,1,json_object('id',id,'version',1,'technique',json(json_patch(json_object('kind',kind,'name',json(name)),CASE WHEN note IS NULL THEN '{}' ELSE json_object('note',json(note)) END)),'createdAt',NULL),NULL FROM techniques;
CREATE TRIGGER technique_revisions_no_update BEFORE UPDATE ON technique_revisions BEGIN SELECT RAISE(ABORT,'technique revisions are immutable'); END;
CREATE TRIGGER technique_revisions_no_delete BEFORE DELETE ON technique_revisions BEGIN SELECT RAISE(ABORT,'technique revisions are immutable'); END;
COMMIT;
