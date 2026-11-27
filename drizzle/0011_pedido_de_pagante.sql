CREATE TABLE "payer_request_payers" (
	"request_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "payer_request_payers_request_id_person_id_pk" PRIMARY KEY("request_id","person_id"),
	CONSTRAINT "payer_request_payers_amount_positive" CHECK ("payer_request_payers"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "payer_request_payers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payer_request_shares" (
	"request_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "payer_request_shares_request_id_person_id_pk" PRIMARY KEY("request_id","person_id"),
	CONSTRAINT "payer_request_shares_amount_non_negative" CHECK ("payer_request_shares"."amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payer_request_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payer_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"target_expense_id" uuid,
	"requested_by" uuid NOT NULL,
	"description" text NOT NULL,
	"total_cents" bigint NOT NULL,
	"split_method" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"result_expense_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payer_requests_status_valid" CHECK ("payer_requests"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "payer_requests_split_method_valid" CHECK ("payer_requests"."split_method" in ('equal', 'exact')),
	CONSTRAINT "payer_requests_total_positive" CHECK ("payer_requests"."total_cents" > 0),
	CONSTRAINT "payer_requests_description_filled" CHECK (length(btrim("payer_requests"."description")) > 0),
	CONSTRAINT "payer_requests_decided_matches_status" CHECK (("payer_requests"."status" = 'pending') = ("payer_requests"."decided_at" is null)),
	CONSTRAINT "payer_requests_result_only_when_approved" CHECK ("payer_requests"."result_expense_id" is null or "payer_requests"."status" = 'approved')
);
--> statement-breakpoint
ALTER TABLE "payer_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payer_request_payers" ADD CONSTRAINT "payer_request_payers_request_id_payer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payer_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_request_payers" ADD CONSTRAINT "payer_request_payers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_request_shares" ADD CONSTRAINT "payer_request_shares_request_id_payer_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payer_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_request_shares" ADD CONSTRAINT "payer_request_shares_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_requests" ADD CONSTRAINT "payer_requests_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_requests" ADD CONSTRAINT "payer_requests_target_expense_id_expenses_id_fk" FOREIGN KEY ("target_expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_requests" ADD CONSTRAINT "payer_requests_requested_by_people_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_requests" ADD CONSTRAINT "payer_requests_decided_by_people_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payer_requests" ADD CONSTRAINT "payer_requests_result_expense_id_expenses_id_fk" FOREIGN KEY ("result_expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payer_requests_idempotency_idx" ON "payer_requests" USING btree ("outing_id","idempotency_key") WHERE "payer_requests"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payer_requests_one_pending_per_target_idx" ON "payer_requests" USING btree ("requested_by","target_expense_id") WHERE "payer_requests"."status" = 'pending' and "payer_requests"."target_expense_id" is not null;--> statement-breakpoint
CREATE INDEX "payer_requests_outing_idx" ON "payer_requests" USING btree ("outing_id","status");