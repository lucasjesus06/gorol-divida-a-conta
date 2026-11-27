CREATE TABLE "bill_claims" (
	"item_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"quantity_num" bigint NOT NULL,
	"quantity_den" bigint NOT NULL,
	"marked_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_claims_item_id_person_id_pk" PRIMARY KEY("item_id","person_id"),
	CONSTRAINT "bill_claims_quantity_positive" CHECK ("bill_claims"."quantity_num" > 0 and "bill_claims"."quantity_den" > 0)
);
--> statement-breakpoint
ALTER TABLE "bill_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"total_cents" bigint NOT NULL,
	"quantity_num" bigint NOT NULL,
	"quantity_den" bigint NOT NULL,
	CONSTRAINT "bill_items_total_positive" CHECK ("bill_items"."total_cents" > 0),
	CONSTRAINT "bill_items_quantity_positive" CHECK ("bill_items"."quantity_num" > 0 and "bill_items"."quantity_den" > 0),
	CONSTRAINT "bill_items_description_filled" CHECK (length(btrim("bill_items"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "bill_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_payers" (
	"bill_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "bill_payers_bill_id_person_id_pk" PRIMARY KEY("bill_id","person_id"),
	CONSTRAINT "bill_payers_amount_positive" CHECK ("bill_payers"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "bill_payers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consumption_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_by" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"service_charge_cents" bigint DEFAULT 0 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"leftover_mode" text,
	"leftover_to" uuid,
	"result_expense_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "consumption_bills_status_valid" CHECK ("consumption_bills"."status" in ('open', 'closing', 'closed')),
	CONSTRAINT "consumption_bills_leftover_mode_valid" CHECK ("consumption_bills"."leftover_mode" is null or "consumption_bills"."leftover_mode" in ('spread', 'transfer')),
	CONSTRAINT "consumption_bills_description_filled" CHECK (length(btrim("consumption_bills"."description")) > 0),
	CONSTRAINT "consumption_bills_amounts_non_negative" CHECK ("consumption_bills"."service_charge_cents" >= 0 and "consumption_bills"."discount_cents" >= 0),
	CONSTRAINT "consumption_bills_closed_matches_status" CHECK (("consumption_bills"."status" = 'closed') = ("consumption_bills"."closed_at" is not null)),
	CONSTRAINT "consumption_bills_transfer_has_target" CHECK (("consumption_bills"."leftover_mode" = 'transfer') = ("consumption_bills"."leftover_to" is not null))
);
--> statement-breakpoint
ALTER TABLE "consumption_bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_split_method_valid";--> statement-breakpoint
ALTER TABLE "payer_requests" DROP CONSTRAINT "payer_requests_split_method_valid";--> statement-breakpoint
ALTER TABLE "bill_claims" ADD CONSTRAINT "bill_claims_item_id_bill_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."bill_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_claims" ADD CONSTRAINT "bill_claims_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_claims" ADD CONSTRAINT "bill_claims_marked_by_people_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_consumption_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."consumption_bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payers" ADD CONSTRAINT "bill_payers_bill_id_consumption_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."consumption_bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payers" ADD CONSTRAINT "bill_payers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_bills" ADD CONSTRAINT "consumption_bills_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_bills" ADD CONSTRAINT "consumption_bills_opened_by_people_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_bills" ADD CONSTRAINT "consumption_bills_leftover_to_people_id_fk" FOREIGN KEY ("leftover_to") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_bills" ADD CONSTRAINT "consumption_bills_result_expense_id_expenses_id_fk" FOREIGN KEY ("result_expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_items_position_idx" ON "bill_items" USING btree ("bill_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "consumption_bills_idempotency_idx" ON "consumption_bills" USING btree ("outing_id","idempotency_key") WHERE "consumption_bills"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "consumption_bills_outing_idx" ON "consumption_bills" USING btree ("outing_id","status");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_split_method_valid" CHECK ("expenses"."split_method" in ('equal', 'exact', 'itemized'));--> statement-breakpoint
ALTER TABLE "payer_requests" ADD CONSTRAINT "payer_requests_split_method_valid" CHECK ("payer_requests"."split_method" in ('equal', 'exact', 'itemized'));