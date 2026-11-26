CREATE TABLE "outing_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outing_participants_role_valid" CHECK ("outing_participants"."role" in ('admin', 'member'))
);
--> statement-breakpoint
ALTER TABLE "outing_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "outings_kind_valid" CHECK ("outings"."kind" in ('event', 'recurring')),
	CONSTRAINT "outings_status_valid" CHECK ("outings"."status" in ('active', 'closed')),
	CONSTRAINT "outings_name_filled" CHECK (length(btrim("outings"."name")) > 0),
	CONSTRAINT "outings_closed_at_matches_status" CHECK (("outings"."status" = 'closed') = ("outings"."closed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "outings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"phone" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_phone_unique" UNIQUE("phone"),
	CONSTRAINT "people_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "people_phone_e164" CHECK ("people"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "people_display_name_filled" CHECK (length(btrim("people"."display_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outing_participants" ADD CONSTRAINT "outing_participants_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_participants" ADD CONSTRAINT "outing_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_created_by_people_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outing_participants_outing_person_idx" ON "outing_participants" USING btree ("outing_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outing_participants_one_admin_idx" ON "outing_participants" USING btree ("outing_id") WHERE "outing_participants"."role" = 'admin';--> statement-breakpoint
CREATE INDEX "outing_participants_person_idx" ON "outing_participants" USING btree ("person_id");