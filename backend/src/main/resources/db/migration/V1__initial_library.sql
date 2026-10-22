CREATE TABLE photo_roots (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, normalized_path TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'ready', last_scan_at TEXT
);
CREATE TABLE places (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, province TEXT NOT NULL, province_code TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, description TEXT NOT NULL DEFAULT '',
  coordinate_system TEXT NOT NULL DEFAULT 'WGS84', coordinate_source TEXT NOT NULL DEFAULT 'manual'
);
CREATE TABLE categories (
  id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  name TEXT NOT NULL, UNIQUE(place_id, name)
);
CREATE TABLE photos (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, normalized_path TEXT NOT NULL UNIQUE,
  root_id TEXT NOT NULL REFERENCES photo_roots(id), file_name TEXT NOT NULL,
  size INTEGER NOT NULL, modified_at INTEGER NOT NULL,
  width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0,
  taken_at TEXT, sort_at TEXT NOT NULL, orientation INTEGER NOT NULL DEFAULT 1,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  availability TEXT NOT NULL DEFAULT 'available', error TEXT, version TEXT NOT NULL
);
CREATE TABLE photo_categories (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY(photo_id, category_id)
);
CREATE INDEX photos_place_sort ON photos(place_id, sort_at, id);
CREATE INDEX photos_sort ON photos(sort_at, id);
CREATE INDEX photos_root ON photos(root_id);
CREATE INDEX category_photos ON photo_categories(category_id, photo_id);
CREATE TRIGGER category_same_place BEFORE INSERT ON photo_categories
WHEN (SELECT place_id FROM photos WHERE id=NEW.photo_id) IS NOT (SELECT place_id FROM categories WHERE id=NEW.category_id)
BEGIN SELECT RAISE(ABORT, 'category must belong to photo place'); END;
