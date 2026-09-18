CREATE TABLE "email_otps" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"payload" jsonb,
	"request_id" text,
	"user_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sends" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_otps_lookup_idx" ON "email_otps" USING btree (lower("email"),"purpose","consumed_at");--> statement-breakpoint
CREATE INDEX "email_otps_request_idx" ON "email_otps" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "email_otps_expiry_idx" ON "email_otps" USING btree ("expires_at");--> statement-breakpoint
/* Everything already in the table predates verification. Leaving those NULL
   would flag every historical enquiry as "unconfirmed" in the admin queue —
   a backlog of false alarms on day one, and indistinguishable from a genuine
   unconfirmed lead arriving tomorrow. They were accepted under the old rules,
   so they are grandfathered as verified at their creation time. */
UPDATE "requests" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
