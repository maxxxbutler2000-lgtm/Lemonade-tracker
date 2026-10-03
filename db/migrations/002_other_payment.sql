ALTER TABLE sales ADD COLUMN payment_detail text NOT NULL DEFAULT '' CHECK(char_length(payment_detail)<=80);
