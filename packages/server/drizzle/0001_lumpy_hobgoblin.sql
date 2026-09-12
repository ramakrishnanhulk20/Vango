CREATE TABLE "challenges" (
	"nonce" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "challenges_kind" CHECK ("challenges"."kind" in ('login', 'redeem'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "luna_consumed" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "cashback_luna" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "cashback_tx_hash" text;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "challenge_nonce" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_token_hash_unique" UNIQUE("token_hash");--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_cashback_tx_hash_unique" UNIQUE("cashback_tx_hash");--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_challenge_nonce_unique" UNIQUE("challenge_nonce");--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_luna_consumed" CHECK ("redemptions"."luna_consumed" >= 0);--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_cashback_luna" CHECK ("redemptions"."cashback_luna" >= 0);