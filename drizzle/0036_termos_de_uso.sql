CREATE TABLE "terms_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminders_consent" boolean NOT NULL,
	"reminders_withdrawn_at" timestamp with time zone,
	CONSTRAINT "terms_acceptances_version_filled" CHECK (length(btrim("terms_acceptances"."version")) > 0),
	CONSTRAINT "terms_acceptances_withdrawn_needs_consent" CHECK ("terms_acceptances"."reminders_withdrawn_at" is null or "terms_acceptances"."reminders_consent")
);
--> statement-breakpoint
ALTER TABLE "terms_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "terms_acceptances_person_version_idx" ON "terms_acceptances" USING btree ("person_id","version");