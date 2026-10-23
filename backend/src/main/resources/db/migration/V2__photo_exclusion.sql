ALTER TABLE photos ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded IN (0,1));
CREATE INDEX photos_excluded_sort ON photos(excluded, sort_at, id);
