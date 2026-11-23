-- Finished features: the default branch's listing on landed_feature, and its watermark on project (specs/005-finished-features).
ALTER TABLE "landed_feature" ADD COLUMN "added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "last_change_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "author_email" text;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "spec_oid" text;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "plan_oid" text;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "tasks_oid" text;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "spec_size" integer;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "plan_size" integer;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD COLUMN "tasks_size" integer;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "finished_tip" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "finished_tip_at" timestamp with time zone;