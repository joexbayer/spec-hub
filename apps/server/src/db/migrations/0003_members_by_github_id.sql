-- Members are assigned by GitHub username, before or after they sign in (FR-027). The hub resolves
-- the username to GitHub's account id, so a membership belongs to the account id; user_id is bound
-- when that account has a hub user. Every existing row is bound, so both new columns come from it.
ALTER TABLE "membership" ADD COLUMN "github_id" text;--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "assigned_login" text;--> statement-breakpoint
UPDATE "membership" m SET "github_id" = u."github_id", "assigned_login" = u."github_login" FROM "user" u WHERE u."id" = m."user_id";--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "github_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "assigned_login" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_project_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_project_id_github_id_pk" PRIMARY KEY("project_id","github_id");--> statement-breakpoint
-- pending rows have no user; a deleted user leaves the membership pending on its account id
ALTER TABLE "membership" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
