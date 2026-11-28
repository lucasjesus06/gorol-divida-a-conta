ALTER TABLE "bill_items" ADD COLUMN "added_by" uuid;--> statement-breakpoint
ALTER TABLE "consumption_bills" ADD COLUMN "mode" text DEFAULT 'detailed' NOT NULL;--> statement-breakpoint
ALTER TABLE "consumption_bills" ADD COLUMN "direct_total_cents" bigint;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_added_by_people_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_bills" ADD CONSTRAINT "consumption_bills_mode_valid" CHECK ("consumption_bills"."mode" in ('direct', 'detailed'));--> statement-breakpoint
ALTER TABLE "consumption_bills" ADD CONSTRAINT "consumption_bills_direct_total_matches_mode" CHECK (("consumption_bills"."mode" = 'direct') = ("consumption_bills"."direct_total_cents" is not null) and ("consumption_bills"."direct_total_cents" is null or "consumption_bills"."direct_total_cents" > 0));