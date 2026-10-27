CREATE TYPE "public"."membership_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."numbering" AS ENUM('sequential', 'timestamp');--> statement-breakpoint
CREATE TABLE "clone" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"commit_email" text NOT NULL,
	"generated_at" bigint NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clone_branch" (
	"clone_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tip" text NOT NULL,
	"tip_at" timestamp with time zone NOT NULL,
	"pushed" boolean NOT NULL,
	CONSTRAINT "clone_branch_clone_id_name_pk" PRIMARY KEY("clone_id","name")
);
--> statement-breakpoint
CREATE TABLE "clone_feature" (
	"clone_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"dir" text NOT NULL,
	"last_change_at" timestamp with time zone NOT NULL,
	"author_name" text,
	"author_email" text,
	"spec_oid" text,
	"plan_oid" text,
	"tasks_oid" text,
	"spec_size" integer,
	"plan_size" integer,
	"tasks_size" integer,
	CONSTRAINT "clone_feature_clone_id_branch_dir_pk" PRIMARY KEY("clone_id","branch","dir")
);
--> statement-breakpoint
CREATE TABLE "document" (
	"project_id" uuid NOT NULL,
	"oid" text NOT NULL,
	"size" integer NOT NULL,
	"content" text,
	"too_large" boolean DEFAULT false NOT NULL,
	"unreadable" boolean DEFAULT false NOT NULL,
	"title" text,
	"owner_handle" text,
	"open_clarifications" integer DEFAULT 0 NOT NULL,
	"tasks_done" integer DEFAULT 0 NOT NULL,
	"tasks_total" integer DEFAULT 0 NOT NULL,
	"depends_on" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_project_id_oid_pk" PRIMARY KEY("project_id","oid")
);
--> statement-breakpoint
CREATE TABLE "landed_feature" (
	"project_id" uuid NOT NULL,
	"dir" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"baseline" boolean NOT NULL,
	CONSTRAINT "landed_feature_project_id_dir_pk" PRIMARY KEY("project_id","dir")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"project_id" uuid NOT NULL,
	"github_login" text NOT NULL,
	"user_id" text,
	"role" "membership_role" NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_project_id_github_login_pk" PRIMARY KEY("project_id","github_login")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"numbering" "numbering" DEFAULT 'sequential' NOT NULL,
	"default_tip" text,
	"default_tip_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "security_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"project_id" uuid,
	"type" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"github_login" text NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_github_login_unique" UNIQUE("github_login")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clone" ADD CONSTRAINT "clone_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clone" ADD CONSTRAINT "clone_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clone_branch" ADD CONSTRAINT "clone_branch_clone_id_clone_id_fk" FOREIGN KEY ("clone_id") REFERENCES "public"."clone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clone_feature" ADD CONSTRAINT "clone_feature_clone_id_branch_clone_branch_clone_id_name_fk" FOREIGN KEY ("clone_id","branch") REFERENCES "public"."clone_branch"("clone_id","name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_feature" ADD CONSTRAINT "landed_feature_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clone_project_id_idx" ON "clone" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "clone_user_id_idx" ON "clone" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clone_feature_dir_idx" ON "clone_feature" USING btree ("dir");--> statement-breakpoint
CREATE INDEX "membership_user_id_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_event_project_at_idx" ON "security_event" USING btree ("project_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_event_at_idx" ON "security_event" USING btree ("at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_configId_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_referenceId_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");