CREATE TABLE "closing_vote_choices" (
	"vote_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "closing_vote_choices_vote_id_person_id_pk" PRIMARY KEY("vote_id","person_id"),
	CONSTRAINT "closing_vote_choices_decision_valid" CHECK ("closing_vote_choices"."decision" in ('pending', 'accepted', 'rejected')),
	CONSTRAINT "closing_vote_choices_decided_matches" CHECK (("closing_vote_choices"."decision" = 'pending') = ("closing_vote_choices"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "closing_vote_choices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "closing_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"snapshot" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closing_votes_status_valid" CHECK ("closing_votes"."status" in ('open', 'approved', 'rejected', 'cancelled')),
	CONSTRAINT "closing_votes_resolved_matches_status" CHECK (("closing_votes"."status" = 'open') = ("closing_votes"."resolved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "closing_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_valid";--> statement-breakpoint
ALTER TABLE "closing_vote_choices" ADD CONSTRAINT "closing_vote_choices_vote_id_closing_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."closing_votes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closing_vote_choices" ADD CONSTRAINT "closing_vote_choices_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closing_votes" ADD CONSTRAINT "closing_votes_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closing_votes" ADD CONSTRAINT "closing_votes_requested_by_people_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "closing_votes_one_open_per_outing_idx" ON "closing_votes" USING btree ("outing_id") WHERE "closing_votes"."status" = 'open';--> statement-breakpoint
CREATE INDEX "closing_votes_outing_idx" ON "closing_votes" USING btree ("outing_id","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_valid" CHECK ("notifications"."kind" in ('guest_requested_account', 'join_requested', 'payment_declared', 'bill_part_transferred', 'payment_reminder', 'outing_closed', 'participant_removed', 'participant_left', 'closing_vote_requested', 'closing_vote_resolved'));