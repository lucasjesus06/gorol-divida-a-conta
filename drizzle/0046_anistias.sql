CREATE TABLE "amnesties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creditor_id" uuid NOT NULL,
	"debtor_id" uuid NOT NULL,
	"total_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text,
	CONSTRAINT "amnesties_total_positive" CHECK ("amnesties"."total_cents" > 0),
	CONSTRAINT "amnesties_different_people" CHECK ("amnesties"."creditor_id" <> "amnesties"."debtor_id")
);
--> statement-breakpoint
ALTER TABLE "amnesties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "amnesty_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amnesty_id" uuid NOT NULL,
	"outing_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "amnesty_items_amount_positive" CHECK ("amnesty_items"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "amnesty_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_valid";--> statement-breakpoint
ALTER TABLE "amnesties" ADD CONSTRAINT "amnesties_creditor_id_people_id_fk" FOREIGN KEY ("creditor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amnesties" ADD CONSTRAINT "amnesties_debtor_id_people_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amnesty_items" ADD CONSTRAINT "amnesty_items_amnesty_id_amnesties_id_fk" FOREIGN KEY ("amnesty_id") REFERENCES "public"."amnesties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amnesty_items" ADD CONSTRAINT "amnesty_items_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amnesty_items" ADD CONSTRAINT "amnesty_items_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amnesties_idempotency_idx" ON "amnesties" USING btree ("creditor_id","idempotency_key") WHERE "amnesties"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "amnesties_creditor_idx" ON "amnesties" USING btree ("creditor_id","created_at");--> statement-breakpoint
CREATE INDEX "amnesties_debtor_idx" ON "amnesties" USING btree ("debtor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "amnesty_items_expense_idx" ON "amnesty_items" USING btree ("amnesty_id","expense_id");--> statement-breakpoint
CREATE INDEX "amnesty_items_outing_idx" ON "amnesty_items" USING btree ("outing_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_valid" CHECK ("notifications"."kind" in ('guest_requested_account', 'join_requested', 'payment_declared', 'bill_part_transferred', 'payment_reminder', 'outing_closed', 'participant_removed', 'participant_left', 'closing_vote_requested', 'closing_vote_resolved', 'outing_reopened', 'amnesty_granted'));