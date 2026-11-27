ALTER TABLE "access_invites" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_invites" ADD COLUMN "revoked_by" uuid;--> statement-breakpoint
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_revoked_by_people_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;