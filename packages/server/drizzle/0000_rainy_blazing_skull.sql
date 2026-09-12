CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"merchant_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"reward_kind" text NOT NULL,
	"target_visits" integer,
	"cashback_bps" integer,
	"min_luna" bigint DEFAULT 100000 NOT NULL,
	"receiving_address" text NOT NULL,
	"reward_text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_code_unique" UNIQUE("code"),
	CONSTRAINT "cards_code_len" CHECK (char_length("cards"."code") = 8),
	CONSTRAINT "cards_name_len" CHECK (char_length("cards"."name") between 1 and 40),
	CONSTRAINT "cards_reward_text_len" CHECK (char_length("cards"."reward_text") between 1 and 60),
	CONSTRAINT "cards_reward_kind" CHECK ("cards"."reward_kind" in ('nth_free', 'cashback')),
	CONSTRAINT "cards_min_luna" CHECK ("cards"."min_luna" >= 100000),
	CONSTRAINT "cards_rule_matches_kind" CHECK (("cards"."reward_kind" = 'nth_free' and "cards"."target_visits" between 2 and 20 and "cards"."cashback_bps" is null)
          or ("cards"."reward_kind" = 'cashback' and "cards"."cashback_bps" between 1 and 2000 and "cards"."target_visits" is null))
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"stamps_consumed" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "redemptions_status" CHECK ("redemptions"."status" in ('pending', 'confirmed', 'cancelled')),
	CONSTRAINT "redemptions_stamps_consumed" CHECK ("redemptions"."stamps_consumed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stamps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"customer_user_id" uuid,
	"sender_address" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" integer NOT NULL,
	"value_luna" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stamps_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visible_address" text NOT NULL,
	"remote_address" text,
	"language" text,
	"fiat" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_visible_address_unique" UNIQUE("visible_address"),
	CONSTRAINT "users_remote_address_unique" UNIQUE("remote_address")
);
--> statement-breakpoint
CREATE TABLE "watcher_cursors" (
	"receiving_address" text PRIMARY KEY NOT NULL,
	"last_block" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_merchant_user_id_users_id_fk" FOREIGN KEY ("merchant_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_receiving_address_idx" ON "cards" USING btree ("receiving_address");--> statement-breakpoint
CREATE INDEX "cards_merchant_user_id_idx" ON "cards" USING btree ("merchant_user_id");--> statement-breakpoint
CREATE INDEX "redemptions_card_customer_idx" ON "redemptions" USING btree ("card_id","customer_user_id");--> statement-breakpoint
CREATE INDEX "stamps_card_customer_idx" ON "stamps" USING btree ("card_id","customer_user_id");--> statement-breakpoint
CREATE INDEX "stamps_sender_address_idx" ON "stamps" USING btree ("sender_address");