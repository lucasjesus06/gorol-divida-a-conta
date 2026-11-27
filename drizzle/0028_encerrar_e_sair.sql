ALTER TABLE "outing_participants" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outing_participants" ADD COLUMN "left_by" uuid;--> statement-breakpoint
ALTER TABLE "outings" ADD COLUMN "closed_by" uuid;--> statement-breakpoint
ALTER TABLE "outing_participants" ADD CONSTRAINT "outing_participants_left_by_people_id_fk" FOREIGN KEY ("left_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outings" ADD CONSTRAINT "outings_closed_by_people_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_participants" ADD CONSTRAINT "outing_participants_left_matches" CHECK (("outing_participants"."left_at" is null) = ("outing_participants"."left_by" is null));--> statement-breakpoint
ALTER TABLE "outing_participants" ADD CONSTRAINT "outing_participants_owner_stays" CHECK ("outing_participants"."left_at" is null or "outing_participants"."role" <> 'admin');