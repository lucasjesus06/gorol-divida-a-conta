ALTER TABLE "people" ADD COLUMN "pix_key" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "pix_key_type" text;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_pix_key_type_valid" CHECK ("people"."pix_key_type" is null or "people"."pix_key_type" in ('cpf', 'cnpj', 'phone', 'email', 'random'));--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_pix_key_complete" CHECK (("people"."pix_key" is null) = ("people"."pix_key_type" is null));