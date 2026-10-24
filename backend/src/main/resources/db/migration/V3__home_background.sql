CREATE TABLE home_background (
  id INTEGER PRIMARY KEY CHECK(id=1),
  mode TEXT NOT NULL CHECK(mode IN ('default','photo','none')),
  photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
  opacity REAL NOT NULL CHECK(typeof(opacity) IN ('real','integer') AND opacity BETWEEN 0 AND 1),
  zoom REAL NOT NULL CHECK(typeof(zoom) IN ('real','integer') AND zoom BETWEEN 1 AND 4),
  x REAL NOT NULL CHECK(typeof(x) IN ('real','integer') AND x BETWEEN 0 AND 1),
  y REAL NOT NULL CHECK(typeof(y) IN ('real','integer') AND y BETWEEN 0 AND 1),
  CHECK(mode='photo' OR photo_id IS NULL)
);
