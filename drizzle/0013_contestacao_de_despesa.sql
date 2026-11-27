CREATE TABLE "expense_dispute_approvals" (
	"dispute_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"decision" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "expense_dispute_approvals_dispute_id_person_id_pk" PRIMARY KEY("dispute_id","person_id"),
	CONSTRAINT "expense_dispute_approvals_decision_valid" CHECK ("expense_dispute_approvals"."decision" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "expense_dispute_approvals_decided_matches" CHECK (("expense_dispute_approvals"."decision" = 'pending') = ("expense_dispute_approvals"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "expense_dispute_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expense_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"opened_by" uuid NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_at" timestamp with time zone,
	"result_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_disputes_subject_valid" CHECK ("expense_disputes"."subject" in ('amount', 'split', 'not_participated', 'other')),
	CONSTRAINT "expense_disputes_status_valid" CHECK ("expense_disputes"."status" in ('open', 'approved', 'rejected')),
	CONSTRAINT "expense_disputes_message_filled" CHECK (length(btrim("expense_disputes"."message")) > 0),
	CONSTRAINT "expense_disputes_decided_matches_status" CHECK (("expense_disputes"."status" = 'open') = ("expense_disputes"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "expense_disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expense_dispute_approvals" ADD CONSTRAINT "expense_dispute_approvals_dispute_id_expense_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."expense_disputes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_dispute_approvals" ADD CONSTRAINT "expense_dispute_approvals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disputes" ADD CONSTRAINT "expense_disputes_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disputes" ADD CONSTRAINT "expense_disputes_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disputes" ADD CONSTRAINT "expense_disputes_opened_by_people_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_disputes" ADD CONSTRAINT "expense_disputes_result_expense_id_expenses_id_fk" FOREIGN KEY ("result_expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_disputes_one_open_per_person_idx" ON "expense_disputes" USING btree ("expense_id","opened_by") WHERE "expense_disputes"."status" = 'open';--> statement-breakpoint
CREATE INDEX "expense_disputes_outing_idx" ON "expense_disputes" USING btree ("outing_id","status");