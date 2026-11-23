-- Pushed-branch sharing: a per-project opt-in on project, and the remote flag on clone_branch (specs/004-pushed-branch-sharing).
ALTER TABLE "clone_branch" ADD COLUMN "remote" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "share_pushed_branches" boolean DEFAULT false NOT NULL;