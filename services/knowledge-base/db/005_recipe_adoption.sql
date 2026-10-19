-- Additive recipe adoption. Original source/revision documents remain unchanged.
BEGIN IMMEDIATE;
ALTER TABLE ingredients ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>0);
CREATE TABLE ingredient_revisions (
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
  version INTEGER NOT NULL CHECK(version>0),
  document TEXT NOT NULL CHECK(json_valid(document) AND json_type(document)='object'),
  created_at TEXT NOT NULL,
  PRIMARY KEY(ingredient_id,version)
) STRICT;
INSERT INTO ingredient_revisions(ingredient_id,version,document,created_at)
SELECT id,1,json_object('id',id,'version',1,'ingredient',json_object('name',json(name),'aliases',json(aliases),'trackStock',json('false')),'createdAt',created_at),created_at FROM ingredients;
CREATE TABLE recipe_approvals (
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  recipe_version INTEGER NOT NULL CHECK(recipe_version>0),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  document TEXT NOT NULL CHECK(json_valid(document) AND json_type(document)='object'),
  created_at TEXT NOT NULL,
  PRIMARY KEY(recipe_id,recipe_version),
  FOREIGN KEY(recipe_id,recipe_version) REFERENCES recipe_revisions(recipe_id,version)
) STRICT;
CREATE TRIGGER ingredient_revisions_no_update BEFORE UPDATE ON ingredient_revisions BEGIN SELECT RAISE(ABORT,'ingredient revisions are immutable'); END;
CREATE TRIGGER ingredient_revisions_no_delete BEFORE DELETE ON ingredient_revisions BEGIN SELECT RAISE(ABORT,'ingredient revisions are immutable'); END;
CREATE TRIGGER recipe_approvals_no_update BEFORE UPDATE ON recipe_approvals BEGIN SELECT RAISE(ABORT,'recipe approvals are immutable'); END;
CREATE TRIGGER recipe_approvals_no_delete BEFORE DELETE ON recipe_approvals BEGIN SELECT RAISE(ABORT,'recipe approvals are immutable'); END;
COMMIT;
