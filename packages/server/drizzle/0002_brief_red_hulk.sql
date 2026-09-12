ALTER TABLE "redemptions" ADD COLUMN "merchant_user_id" uuid;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "code6" text;--> statement-breakpoint
UPDATE "redemptions" AS r SET "merchant_user_id" = c."merchant_user_id" FROM "cards" AS c WHERE c."id" = r."card_id" AND r."merchant_user_id" IS NULL;--> statement-breakpoint
UPDATE "redemptions" SET "token_hash" = encode(sha256(("id"::text || ':backfilled')::bytea), 'hex') WHERE "token_hash" IS NULL;--> statement-breakpoint
UPDATE "redemptions" SET "challenge_nonce" = md5("id"::text || ':backfilled') WHERE "challenge_nonce" IS NULL;--> statement-breakpoint
UPDATE "redemptions" SET "expires_at" = "created_at" WHERE "expires_at" IS NULL;--> statement-breakpoint
UPDATE "redemptions" SET "code6" = lpad(((('x' || right("token_hash", 12))::bit(48)::bigint) % 1000000)::text, 6, '0') WHERE "code6" IS NULL;--> statement-breakpoint
UPDATE "redemptions" SET "status" = 'cancelled' WHERE "status" = 'pending' AND "id" NOT IN (SELECT DISTINCT ON ("card_id", "customer_user_id") "id" FROM "redemptions" WHERE "status" = 'pending' ORDER BY "card_id", "customer_user_id", "created_at" DESC, "id");--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "token_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "challenge_nonce" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "merchant_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "code6" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_merchant_user_id_users_id_fk" FOREIGN KEY ("merchant_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_one_pending_per_card_customer" ON "redemptions" USING btree ("card_id","customer_user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_one_pending_code6_per_merchant" ON "redemptions" USING btree ("merchant_user_id","code6") WHERE status = 'pending';
