CREATE TABLE "access_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "access_invites_token_hash_shape" CHECK ("access_invites"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "access_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"message" text,
	"source" text DEFAULT 'request' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"person_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_requests_source_valid" CHECK ("access_requests"."source" in ('request', 'invite')),
	CONSTRAINT "access_requests_status_valid" CHECK ("access_requests"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "access_requests_phone_e164" CHECK ("access_requests"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "access_requests_email_shape" CHECK ("access_requests"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length("access_requests"."email") <= 254 and "access_requests"."email" = lower("access_requests"."email")),
	CONSTRAINT "access_requests_name_filled" CHECK (length(btrim("access_requests"."name")) > 0),
	CONSTRAINT "access_requests_decided_matches_status" CHECK (("access_requests"."status" = 'pending') = ("access_requests"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "super_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "super_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "account_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_created_by_people_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_request_id_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."access_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_people_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admins" ADD CONSTRAINT "super_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_one_pending_per_email_idx" ON "access_requests" USING btree ("email") WHERE "access_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status","created_at");