ALTER TABLE "outing_participants" ADD COLUMN "display_name" text;--> statement-breakpoint
UPDATE "outing_participants" SET "display_name" = "people"."display_name" FROM "people" WHERE "people"."id" = "outing_participants"."person_id";--> statement-breakpoint
ALTER TABLE "outing_participants" ALTER COLUMN "display_name" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "outing_participants_outing_name_idx" ON "outing_participants" USING btree ("outing_id",lower("display_name"));--> statement-breakpoint
ALTER TABLE "outing_participants" ADD CONSTRAINT "outing_participants_display_name_filled" CHECK (length(btrim("outing_participants"."display_name")) > 0);
