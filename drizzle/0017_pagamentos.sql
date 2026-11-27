CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"on_behalf_of_id" uuid,
	"amount_cents" bigint NOT NULL,
	"status" text DEFAULT 'declared' NOT NULL,
	"confirmed_by" text,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"idempotency_key" text,
	CONSTRAINT "payments_status_valid" CHECK ("payments"."status" in ('declared', 'confirmed', 'contested', 'rejected')),
	CONSTRAINT "payments_confirmed_by_valid" CHECK ("payments"."confirmed_by" is null or "payments"."confirmed_by" in ('creditor', 'receipt')),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_different_people" CHECK ("payments"."from_id" <> "payments"."to_id" and ("payments"."on_behalf_of_id" is null or ("payments"."on_behalf_of_id" <> "payments"."from_id" and "payments"."on_behalf_of_id" <> "payments"."to_id"))),
	CONSTRAINT "payments_resolved_matches_status" CHECK (("payments"."status" = 'declared') = ("payments"."resolved_at" is null)),
	CONSTRAINT "payments_confirmed_has_source" CHECK (("payments"."status" = 'confirmed') = ("payments"."confirmed_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_from_id_people_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_to_id_people_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_on_behalf_of_id_people_id_fk" FOREIGN KEY ("on_behalf_of_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_idx" ON "payments" USING btree ("outing_id","idempotency_key") WHERE "payments"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "payments_outing_idx" ON "payments" USING btree ("outing_id","status");