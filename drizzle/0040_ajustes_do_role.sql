CREATE TABLE "outing_settings" (
	"outing_id" uuid PRIMARY KEY NOT NULL,
	"vote_days" integer,
	"dispute_window_days" integer,
	"default_split" text,
	"suggested_route" text,
	"service_fee_percent" integer,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outing_settings_vote_days_range" CHECK ("outing_settings"."vote_days" is null or "outing_settings"."vote_days" between 1 and 14),
	CONSTRAINT "outing_settings_dispute_days_range" CHECK ("outing_settings"."dispute_window_days" is null or "outing_settings"."dispute_window_days" between 1 and 60),
	CONSTRAINT "outing_settings_default_split_valid" CHECK ("outing_settings"."default_split" is null or "outing_settings"."default_split" in ('equal', 'exact')),
	CONSTRAINT "outing_settings_suggested_route_valid" CHECK ("outing_settings"."suggested_route" is null or "outing_settings"."suggested_route" in ('smart', 'manual')),
	CONSTRAINT "outing_settings_service_fee_valid" CHECK ("outing_settings"."service_fee_percent" is null or "outing_settings"."service_fee_percent" in (0, 10, 13))
);
--> statement-breakpoint
ALTER TABLE "outing_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outing_settings" ADD CONSTRAINT "outing_settings_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outing_settings" ADD CONSTRAINT "outing_settings_updated_by_people_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;