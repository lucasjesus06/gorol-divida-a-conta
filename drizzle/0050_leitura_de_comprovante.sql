CREATE TABLE "payment_receipt_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"outing_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"amount_cents" bigint,
	"read_date" text,
	"recipient_name" text,
	"transaction_id" text,
	"issues" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_receipt_readings_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "receipt_readings_amount_positive" CHECK ("payment_receipt_readings"."amount_cents" is null or "payment_receipt_readings"."amount_cents" > 0),
	CONSTRAINT "receipt_readings_code_shape" CHECK ("payment_receipt_readings"."transaction_id" is null or "payment_receipt_readings"."transaction_id" ~ '^[ED][0-9]{20}[A-Za-z0-9]{11}$')
);
--> statement-breakpoint
ALTER TABLE "payment_receipt_readings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_valid";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "contestable_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "contest_reason" text;--> statement-breakpoint
ALTER TABLE "payment_receipt_readings" ADD CONSTRAINT "payment_receipt_readings_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt_readings" ADD CONSTRAINT "payment_receipt_readings_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_receipt_readings" ADD CONSTRAINT "payment_receipt_readings_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_readings_code_idx" ON "payment_receipt_readings" USING btree ("transaction_id") WHERE "payment_receipt_readings"."transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "receipt_readings_outing_idx" ON "payment_receipt_readings" USING btree ("outing_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_valid" CHECK ("notifications"."kind" in ('guest_requested_account', 'join_requested', 'payment_declared', 'bill_part_transferred', 'payment_reminder', 'outing_closed', 'participant_removed', 'participant_left', 'closing_vote_requested', 'closing_vote_resolved', 'outing_reopened', 'amnesty_granted', 'shared_fund_requested', 'shared_fund_resolved', 'payment_receipt_review', 'payment_contested'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contest_matches_status" CHECK (("payments"."status" = 'contested') = ("payments"."contest_reason" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contestable_only_by_receipt" CHECK ("payments"."contestable_until" is null or "payments"."confirmed_by" = 'receipt' or "payments"."status" = 'contested');