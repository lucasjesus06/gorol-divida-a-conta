CREATE TABLE "expense_payers" (
	"expense_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "expense_payers_expense_id_person_id_pk" PRIMARY KEY("expense_id","person_id"),
	CONSTRAINT "expense_payers_amount_positive" CHECK ("expense_payers"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "expense_payers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expense_shares" (
	"expense_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "expense_shares_expense_id_person_id_pk" PRIMARY KEY("expense_id","person_id"),
	CONSTRAINT "expense_shares_amount_non_negative" CHECK ("expense_shares"."amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "expense_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_version_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"description" text NOT NULL,
	"total_cents" bigint NOT NULL,
	"split_method" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"registered_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by" uuid,
	"void_reason" text,
	"idempotency_key" text,
	CONSTRAINT "expenses_status_valid" CHECK ("expenses"."status" in ('active', 'superseded', 'voided')),
	CONSTRAINT "expenses_split_method_valid" CHECK ("expenses"."split_method" in ('equal', 'exact')),
	CONSTRAINT "expenses_total_positive" CHECK ("expenses"."total_cents" > 0),
	CONSTRAINT "expenses_version_positive" CHECK ("expenses"."version" >= 1),
	CONSTRAINT "expenses_description_filled" CHECK (length(btrim("expenses"."description")) > 0),
	CONSTRAINT "expenses_voided_matches_status" CHECK (("expenses"."status" = 'voided') = ("expenses"."voided_by" is not null and "expenses"."void_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outing_payers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"declared_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outing_payers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_previous_version_id_expenses_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_registered_by_people_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_people_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_payers" ADD CONSTRAINT "outing_payers_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_payers" ADD CONSTRAINT "outing_payers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_payers" ADD CONSTRAINT "outing_payers_declared_by_people_id_fk" FOREIGN KEY ("declared_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_idempotency_idx" ON "expenses" USING btree ("outing_id","idempotency_key") WHERE "expenses"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_one_revision_per_version_idx" ON "expenses" USING btree ("previous_version_id") WHERE "expenses"."previous_version_id" is not null;--> statement-breakpoint
CREATE INDEX "expenses_outing_idx" ON "expenses" USING btree ("outing_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outing_payers_outing_person_idx" ON "outing_payers" USING btree ("outing_id","person_id");