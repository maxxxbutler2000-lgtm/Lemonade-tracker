CREATE TABLE products (
 id text PRIMARY KEY, name text NOT NULL, price integer NOT NULL CHECK(price BETWEEN 0 AND 1000000),
 color text NOT NULL DEFAULT 'lemon', archived integer NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), deleted bigint
);
CREATE TABLE sessions (
 id text PRIMARY KEY, started bigint NOT NULL, ended bigint, active integer CHECK(active=1), voided bigint,
 CHECK(ended IS NULL OR ended>=started), CHECK(voided IS NULL OR active IS NULL)
);
CREATE UNIQUE INDEX idx_sessions_active ON sessions(active);
CREATE INDEX idx_sessions_started ON sessions(started);
CREATE TABLE photos (
 id text PRIMARY KEY, content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
 data bytea NOT NULL CHECK(octet_length(data)<=5242880)
);
CREATE TABLE sales (
 id text PRIMARY KEY, timestamp bigint NOT NULL, day text NOT NULL, hour integer NOT NULL CHECK(hour BETWEEN 0 AND 23),
 customer text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', payment text NOT NULL,
 did_upsell integer NOT NULL DEFAULT 0 CHECK(did_upsell IN (0,1)), upsell_pitch text NOT NULL DEFAULT '', upsell_items text NOT NULL DEFAULT '',
 total integer NOT NULL CHECK(total BETWEEN 0 AND 1000000000), photo text REFERENCES photos(id), session_id text REFERENCES sessions(id), voided bigint
);
CREATE INDEX idx_sales_timestamp ON sales(timestamp);
CREATE INDEX idx_sales_day ON sales(day);
CREATE INDEX idx_sales_session ON sales(session_id);
CREATE TABLE items (
 id text PRIMARY KEY, sale_id text NOT NULL REFERENCES sales(id), product_id text REFERENCES products(id), name text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000), price integer NOT NULL CHECK(price BETWEEN 0 AND 1000000),
 revenue integer CHECK(revenue BETWEEN 0 AND 1000000000)
);
CREATE INDEX idx_items_sale ON items(sale_id);
CREATE INDEX idx_items_product ON items(product_id);
CREATE TABLE login_attempts (key text PRIMARY KEY, attempts integer NOT NULL, window_start bigint NOT NULL);
