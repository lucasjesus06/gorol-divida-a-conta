CREATE TABLE "system_parameter_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"previous_value" integer NOT NULL,
	"new_value" integer NOT NULL,
	"reset" boolean DEFAULT false NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_parameter_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "system_parameters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_parameters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "system_parameter_changes" ADD CONSTRAINT "system_parameter_changes_changed_by_people_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_parameters" ADD CONSTRAINT "system_parameters_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "system_parameter_changes_key_idx" ON "system_parameter_changes" USING btree ("key","changed_at");