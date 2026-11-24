-- Done marks: a member marked a feature done at the document versions it was reported at; drops the superseded branch hides (specs/006-mark-done).
CREATE TABLE "feature_done" (
	"project_id" uuid NOT NULL,
	"dir" text NOT NULL,
	"docs_key" text NOT NULL,
	"done_by" text,
	"done_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_done_project_id_dir_docs_key_pk" PRIMARY KEY("project_id","dir","docs_key")
);
--> statement-breakpoint
DROP TABLE "branch_hide" CASCADE;--> statement-breakpoint
ALTER TABLE "feature_done" ADD CONSTRAINT "feature_done_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_done" ADD CONSTRAINT "feature_done_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;