CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"outing_id" uuid,
	"subject_id" uuid,
	"path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"original_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_path_unique" UNIQUE("path"),
	CONSTRAINT "files_kind_valid" CHECK ("files"."kind" in ('expense_evidence', 'payment_receipt', 'profile_photo')),
	CONSTRAINT "files_status_valid" CHECK ("files"."status" in ('pending', 'ready')),
	CONSTRAINT "files_size_positive" CHECK ("files"."size_bytes" > 0),
	CONSTRAINT "files_name_size" CHECK (length(btrim("files"."original_name")) between 1 and 200),
	CONSTRAINT "files_subject_matches_kind" CHECK (("files"."kind" = 'profile_photo' and "files"."outing_id" is null and "files"."subject_id" is null)
        or ("files"."kind" <> 'profile_photo' and "files"."outing_id" is not null and "files"."subject_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_subject_idx" ON "files" USING btree ("kind","subject_id");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id","kind");