-- Branch hides: a member hid a branch at the tips it was reported at (specs/006-hide-branch).
CREATE TABLE "branch_hide" (
	"project_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"tip" text NOT NULL,
	"hidden_by" text,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_hide_project_id_branch_tip_pk" PRIMARY KEY("project_id","branch","tip")
);
--> statement-breakpoint
ALTER TABLE "branch_hide" ADD CONSTRAINT "branch_hide_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_hide" ADD CONSTRAINT "branch_hide_hidden_by_user_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;