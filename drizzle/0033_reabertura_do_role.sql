CREATE TABLE "outing_reopenings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"dispute_id" uuid NOT NULL,
	"reopened_by" uuid NOT NULL,
	"reopened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous_closed_at" timestamp with time zone NOT NULL,
	"previous_closed_by" uuid
);
--> statement-breakpoint
ALTER TABLE "outing_reopenings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_valid";--> statement-breakpoint
ALTER TABLE "outing_reopenings" ADD CONSTRAINT "outing_reopenings_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_reopenings" ADD CONSTRAINT "outing_reopenings_dispute_id_expense_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."expense_disputes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_reopenings" ADD CONSTRAINT "outing_reopenings_reopened_by_people_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_reopenings" ADD CONSTRAINT "outing_reopenings_previous_closed_by_people_id_fk" FOREIGN KEY ("previous_closed_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outing_reopenings_outing_idx" ON "outing_reopenings" USING btree ("outing_id","reopened_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_valid" CHECK ("notifications"."kind" in ('guest_requested_account', 'join_requested', 'payment_declared', 'bill_part_transferred', 'payment_reminder', 'outing_closed', 'participant_removed', 'participant_left', 'closing_vote_requested', 'closing_vote_resolved', 'outing_reopened'));