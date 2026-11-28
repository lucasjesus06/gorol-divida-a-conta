CREATE TABLE "shared_funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_a" uuid NOT NULL,
	"person_b" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	CONSTRAINT "shared_funds_status_valid" CHECK ("shared_funds"."status" in ('pending', 'active', 'declined', 'ended')),
	CONSTRAINT "shared_funds_ordered_pair" CHECK ("shared_funds"."person_a" < "shared_funds"."person_b"),
	CONSTRAINT "shared_funds_requester_in_pair" CHECK ("shared_funds"."requested_by" in ("shared_funds"."person_a", "shared_funds"."person_b")),
	CONSTRAINT "shared_funds_dates_match_status" CHECK (("shared_funds"."status" in ('active', 'ended')) = ("shared_funds"."accepted_at" is not null) and ("shared_funds"."status" = 'ended') = ("shared_funds"."ended_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "shared_funds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_valid";--> statement-breakpoint
ALTER TABLE "shared_funds" ADD CONSTRAINT "shared_funds_person_a_people_id_fk" FOREIGN KEY ("person_a") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_funds" ADD CONSTRAINT "shared_funds_person_b_people_id_fk" FOREIGN KEY ("person_b") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_funds" ADD CONSTRAINT "shared_funds_requested_by_people_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_funds" ADD CONSTRAINT "shared_funds_ended_by_people_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_funds_person_a_idx" ON "shared_funds" USING btree ("person_a");--> statement-breakpoint
CREATE INDEX "shared_funds_person_b_idx" ON "shared_funds" USING btree ("person_b");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_valid" CHECK ("notifications"."kind" in ('guest_requested_account', 'join_requested', 'payment_declared', 'bill_part_transferred', 'payment_reminder', 'outing_closed', 'participant_removed', 'participant_left', 'closing_vote_requested', 'closing_vote_resolved', 'outing_reopened', 'amnesty_granted', 'shared_fund_requested', 'shared_fund_resolved'));