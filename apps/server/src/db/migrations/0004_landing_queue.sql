-- Landing lock: one row per member's request, live rows are the queue (specs/003-landing-queue).
CREATE TYPE "public"."land_outcome" AS ENUM('landed', 'released', 'expired', 'skipped', 'left', 'removed');--> statement-breakpoint
CREATE TYPE "public"."land_state" AS ENUM('waiting', 'holding', 'ended');--> statement-breakpoint
CREATE TABLE "land_place" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"state" "land_state" NOT NULL,
	"outcome" "land_outcome",
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone NOT NULL,
	"ended_by" text,
	CONSTRAINT "land_place_outcome_check" CHECK (("land_place"."state" = 'ended') = ("land_place"."outcome" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "land_place" ADD CONSTRAINT "land_place_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_place" ADD CONSTRAINT "land_place_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "land_place" ADD CONSTRAINT "land_place_ended_by_user_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "land_place_live_member" ON "land_place" USING btree ("project_id","user_id") WHERE "land_place"."state" <> 'ended';--> statement-breakpoint
CREATE UNIQUE INDEX "land_place_holder" ON "land_place" USING btree ("project_id") WHERE "land_place"."state" = 'holding';--> statement-breakpoint
CREATE INDEX "land_place_project_id_idx" ON "land_place" USING btree ("project_id","id");