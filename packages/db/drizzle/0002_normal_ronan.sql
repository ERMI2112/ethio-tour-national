CREATE TABLE "hotel_admission_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"application_version_id" uuid NOT NULL,
	"administrator_profile_id" uuid NOT NULL,
	"administrator_membership_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_admission_decisions_decision_check" CHECK ("hotel_admission_decisions"."decision" in ('admit', 'decline'))
);
--> statement-breakpoint
CREATE TABLE "hotel_application_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"submitted_by_profile_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_application_versions_number_check" CHECK ("hotel_application_versions"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "hotel_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_profile_id" uuid NOT NULL,
	"draft_content" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"admission_status" text DEFAULT 'not_eligible' NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"current_version_number" integer DEFAULT 0 NOT NULL,
	"current_submitted_version_id" uuid,
	"provider_organization_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_applications_status_check" CHECK ("hotel_applications"."status" in ('draft', 'submitted', 'changes_requested', 'approved', 'rejected')),
	CONSTRAINT "hotel_applications_admission_status_check" CHECK ("hotel_applications"."admission_status" in ('not_eligible', 'pending', 'admitted', 'declined')),
	CONSTRAINT "hotel_applications_version_check" CHECK ("hotel_applications"."current_version_number" >= 0 and "hotel_applications"."version" > 0),
	CONSTRAINT "hotel_applications_synthetic_check" CHECK ("hotel_applications"."is_synthetic" = true)
);
--> statement-breakpoint
CREATE TABLE "hotel_bureau_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"application_version_id" uuid NOT NULL,
	"bureau_organization_id" text NOT NULL,
	"scope_unit_id" text NOT NULL,
	"status" text DEFAULT 'in_review' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_bureau_cases_status_check" CHECK ("hotel_bureau_cases"."status" in ('submitted', 'in_review', 'approved', 'changes_requested', 'rejected')),
	CONSTRAINT "hotel_bureau_cases_version_check" CHECK ("hotel_bureau_cases"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "hotel_bureau_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"application_version_id" uuid NOT NULL,
	"reviewer_profile_id" uuid NOT NULL,
	"reviewer_membership_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_bureau_decisions_decision_check" CHECK ("hotel_bureau_decisions"."decision" in ('approve', 'request_changes', 'reject'))
);
--> statement-breakpoint
ALTER TABLE "access_grants" DROP CONSTRAINT "access_grants_capability_check";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_level_check";--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "level" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "organization_type" text DEFAULT 'administrative' NOT NULL;--> statement-breakpoint
ALTER TABLE "hotel_admission_decisions" ADD CONSTRAINT "hotel_admission_decisions_application_id_hotel_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."hotel_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_admission_decisions" ADD CONSTRAINT "hotel_admission_decisions_application_version_id_hotel_application_versions_id_fk" FOREIGN KEY ("application_version_id") REFERENCES "public"."hotel_application_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_admission_decisions" ADD CONSTRAINT "hotel_admission_decisions_administrator_profile_id_user_profiles_id_fk" FOREIGN KEY ("administrator_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_admission_decisions" ADD CONSTRAINT "hotel_admission_decisions_administrator_membership_id_memberships_id_fk" FOREIGN KEY ("administrator_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_application_id_hotel_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."hotel_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_submitted_by_profile_id_user_profiles_id_fk" FOREIGN KEY ("submitted_by_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_applications" ADD CONSTRAINT "hotel_applications_applicant_profile_id_user_profiles_id_fk" FOREIGN KEY ("applicant_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_applications" ADD CONSTRAINT "hotel_applications_current_submitted_version_id_hotel_application_versions_id_fk" FOREIGN KEY ("current_submitted_version_id") REFERENCES "public"."hotel_application_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_applications" ADD CONSTRAINT "hotel_applications_provider_organization_id_organizations_id_fk" FOREIGN KEY ("provider_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD CONSTRAINT "hotel_bureau_cases_bureau_organization_id_organizations_id_fk" FOREIGN KEY ("bureau_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD CONSTRAINT "hotel_bureau_cases_scope_unit_id_administrative_units_id_fk" FOREIGN KEY ("scope_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_application_versions_app_id_uq" ON "hotel_application_versions" USING btree ("application_id","id");--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD CONSTRAINT "hotel_bureau_cases_version_fk" FOREIGN KEY ("application_id","application_version_id") REFERENCES "public"."hotel_application_versions"("application_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_bureau_decisions" ADD CONSTRAINT "hotel_bureau_decisions_case_id_hotel_bureau_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."hotel_bureau_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_bureau_decisions" ADD CONSTRAINT "hotel_bureau_decisions_application_version_id_hotel_application_versions_id_fk" FOREIGN KEY ("application_version_id") REFERENCES "public"."hotel_application_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_bureau_decisions" ADD CONSTRAINT "hotel_bureau_decisions_reviewer_profile_id_user_profiles_id_fk" FOREIGN KEY ("reviewer_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_bureau_decisions" ADD CONSTRAINT "hotel_bureau_decisions_reviewer_membership_id_memberships_id_fk" FOREIGN KEY ("reviewer_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_admission_decisions_app_version_uq" ON "hotel_admission_decisions" USING btree ("application_id","application_version_id");--> statement-breakpoint
CREATE INDEX "hotel_admission_decisions_created_idx" ON "hotel_admission_decisions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_application_versions_app_number_uq" ON "hotel_application_versions" USING btree ("application_id","version_number");--> statement-breakpoint
CREATE INDEX "hotel_application_versions_submitted_idx" ON "hotel_application_versions" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_applications_provider_org_uq" ON "hotel_applications" USING btree ("provider_organization_id");--> statement-breakpoint
CREATE INDEX "hotel_applications_owner_idx" ON "hotel_applications" USING btree ("applicant_profile_id","updated_at");--> statement-breakpoint
CREATE INDEX "hotel_applications_status_idx" ON "hotel_applications" USING btree ("status","admission_status");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_bureau_cases_version_uq" ON "hotel_bureau_cases" USING btree ("application_version_id");--> statement-breakpoint
CREATE INDEX "hotel_bureau_cases_queue_idx" ON "hotel_bureau_cases" USING btree ("bureau_organization_id","scope_unit_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_bureau_decisions_case_uq" ON "hotel_bureau_decisions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "hotel_bureau_decisions_version_idx" ON "hotel_bureau_decisions" USING btree ("application_version_id");--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_capability_check" CHECK ("access_grants"."capability" in ('registry:resource:read', 'registry:resource:create', 'registry:resource:edit', 'registry:submission:submit', 'registry:submission:review', 'registry:publication:publish', 'registry:publication:withdraw', 'hotel:application:bureau:read', 'hotel:application:bureau:decide', 'hotel:application:admin:read', 'hotel:application:admin:decide', 'hotel:workspace:read', 'hotel:workspace:edit'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_type_level_check" CHECK (("organizations"."organization_type" = 'administrative' and "organizations"."level" in ('federal', 'regional', 'woreda', 'kebele')) or ("organizations"."organization_type" in ('platform', 'provider') and "organizations"."level" is null and "organizations"."administrative_unit_id" is null));
--> statement-breakpoint
CREATE FUNCTION reject_hotel_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'hotel application history is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hotel_application_versions_immutable
BEFORE UPDATE OR DELETE ON hotel_application_versions
FOR EACH ROW EXECUTE FUNCTION reject_hotel_history_mutation();
--> statement-breakpoint
CREATE TRIGGER hotel_bureau_decisions_immutable
BEFORE UPDATE OR DELETE ON hotel_bureau_decisions
FOR EACH ROW EXECUTE FUNCTION reject_hotel_history_mutation();
--> statement-breakpoint
CREATE TRIGGER hotel_admission_decisions_immutable
BEFORE UPDATE OR DELETE ON hotel_admission_decisions
FOR EACH ROW EXECUTE FUNCTION reject_hotel_history_mutation();
--> statement-breakpoint
CREATE TRIGGER hotel_application_versions_no_truncate
BEFORE TRUNCATE ON hotel_application_versions
FOR EACH STATEMENT EXECUTE FUNCTION reject_hotel_history_mutation();
--> statement-breakpoint
CREATE TRIGGER hotel_bureau_decisions_no_truncate
BEFORE TRUNCATE ON hotel_bureau_decisions
FOR EACH STATEMENT EXECUTE FUNCTION reject_hotel_history_mutation();
--> statement-breakpoint
CREATE TRIGGER hotel_admission_decisions_no_truncate
BEFORE TRUNCATE ON hotel_admission_decisions
FOR EACH STATEMENT EXECUTE FUNCTION reject_hotel_history_mutation();
