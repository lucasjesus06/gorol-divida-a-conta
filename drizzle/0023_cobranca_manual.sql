CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position" integer NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_position_unique" UNIQUE("position"),
	CONSTRAINT "message_templates_body_size" CHECK (length(btrim("message_templates"."body")) between 1 and 600),
	CONSTRAINT "message_templates_position_positive" CHECK ("message_templates"."position" > 0)
);
--> statement-breakpoint
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"creditor_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"channel" text NOT NULL,
	"sent_by" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_log_channel_valid" CHECK ("reminder_log"."channel" in ('whatsapp', 'app')),
	CONSTRAINT "reminder_log_sequence_positive" CHECK ("reminder_log"."sequence" > 0),
	CONSTRAINT "reminder_log_different_people" CHECK ("reminder_log"."debtor_id" <> "reminder_log"."creditor_id")
);
--> statement-breakpoint
ALTER TABLE "reminder_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reminder_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debtor_id" uuid NOT NULL,
	"creditor_id" uuid NOT NULL,
	"paused_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_until" timestamp with time zone NOT NULL,
	"registered_by" uuid NOT NULL,
	CONSTRAINT "reminder_pauses_after_start" CHECK ("reminder_pauses"."paused_until" > "reminder_pauses"."paused_at")
);
--> statement-breakpoint
ALTER TABLE "reminder_pauses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_debtor_id_people_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_creditor_id_people_id_fk" FOREIGN KEY ("creditor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_sent_by_people_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_pauses" ADD CONSTRAINT "reminder_pauses_debtor_id_people_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_pauses" ADD CONSTRAINT "reminder_pauses_creditor_id_people_id_fk" FOREIGN KEY ("creditor_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_pauses" ADD CONSTRAINT "reminder_pauses_registered_by_people_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminder_log_pair_idx" ON "reminder_log" USING btree ("debtor_id","creditor_id","sent_at");--> statement-breakpoint
CREATE INDEX "reminder_pauses_pair_idx" ON "reminder_pauses" USING btree ("debtor_id","creditor_id");