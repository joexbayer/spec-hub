-- Access keys on the GitHub account, not the login (FR-025..027): a login can be renamed and then
-- taken by someone else. Hub admins are named by GitHub account id, memberships by hub user.

-- The GitHub account id Better Auth already stores for every GitHub sign-in. A user without a
-- GitHub account cannot exist (sign-in is GitHub-only), so SET NOT NULL failing here means the
-- data is wrong and must be looked at, not silently dropped.
ALTER TABLE "user" ADD COLUMN "github_id" text;--> statement-breakpoint
UPDATE "user" u SET "github_id" = a."account_id" FROM "account" a WHERE a."user_id" = u."id" AND a."provider_id" = 'github';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "github_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_github_id_unique" UNIQUE("github_id");--> statement-breakpoint
-- Pending invitations (a login nobody had signed in with yet) are dropped: access is now granted by
-- assigning someone who has signed in, and a login says nothing about which account will claim it.
DELETE FROM "membership" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_project_id_github_login_pk";--> statement-breakpoint
ALTER TABLE "membership" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_project_id_user_id_pk" PRIMARY KEY("project_id","user_id");--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" DROP COLUMN "github_login";
