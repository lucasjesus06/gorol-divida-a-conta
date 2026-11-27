CREATE TABLE "outing_join_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"succeeded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outing_join_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outing_join_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outing_join_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "outing_join_links_token_hash_shape" CHECK ("outing_join_links"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "outing_join_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outing_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"guest_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outing_join_requests_status_valid" CHECK ("outing_join_requests"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "outing_join_requests_decided_matches_status" CHECK (("outing_join_requests"."status" = 'pending') = ("outing_join_requests"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "outing_join_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outing_participants" ADD COLUMN "confirmed_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "outing_join_attempts" ADD CONSTRAINT "outing_join_attempts_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_join_attempts" ADD CONSTRAINT "outing_join_attempts_participant_id_outing_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."outing_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_join_links" ADD CONSTRAINT "outing_join_links_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_join_links" ADD CONSTRAINT "outing_join_links_created_by_people_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_join_requests" ADD CONSTRAINT "outing_join_requests_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_join_requests" ADD CONSTRAINT "outing_join_requests_participant_id_outing_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."outing_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_join_requests" ADD CONSTRAINT "outing_join_requests_guest_user_id_users_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_join_requests" ADD CONSTRAINT "outing_join_requests_decided_by_people_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outing_join_attempts_outing_idx" ON "outing_join_attempts" USING btree ("outing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outing_join_links_one_active_idx" ON "outing_join_links" USING btree ("outing_id") WHERE "outing_join_links"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "outing_join_requests_one_pending_per_participant_idx" ON "outing_join_requests" USING btree ("participant_id") WHERE "outing_join_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "outing_join_requests_one_pending_per_guest_idx" ON "outing_join_requests" USING btree ("outing_id","guest_user_id") WHERE "outing_join_requests"."status" = 'pending';