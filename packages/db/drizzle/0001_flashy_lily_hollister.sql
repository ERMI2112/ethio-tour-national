CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"organization_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"demo_only" boolean DEFAULT true NOT NULL,
	"production_decision_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grants_production_decisions_disabled_check" CHECK ("access_grants"."production_decision_enabled" = false),
	CONSTRAINT "access_grants_capability_check" CHECK ("access_grants"."capability" in ('registry:resource:read', 'registry:resource:create', 'registry:resource:edit', 'registry:submission:submit', 'registry:submission:review', 'registry:publication:publish', 'registry:publication:withdraw'))
);
--> statement-breakpoint
CREATE TABLE "administrative_unit_paths" (
	"ancestor_unit_id" text NOT NULL,
	"descendant_unit_id" text NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "administrative_unit_paths_ancestor_unit_id_descendant_unit_id_pk" PRIMARY KEY("ancestor_unit_id","descendant_unit_id"),
	CONSTRAINT "administrative_unit_paths_depth_check" CHECK ("administrative_unit_paths"."depth" >= 0)
);
--> statement-breakpoint
CREATE TABLE "administrative_units" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"level" text NOT NULL,
	"parent_id" text,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "administrative_units_level_check" CHECK ("administrative_units"."level" in ('federal', 'regional', 'woreda', 'kebele'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_issuer" text,
	"actor_subject_id" text,
	"actor_membership_id" uuid,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"target_resource_id" uuid,
	"target_revision_id" uuid,
	"reason_code" text,
	"policy_version" text NOT NULL,
	"request_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grant_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"administrative_unit_id" text NOT NULL,
	"include_descendants" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbox_event_id" uuid NOT NULL,
	"recipient_subject_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"level" text NOT NULL,
	"administrative_unit_id" text,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_level_check" CHECK ("organizations"."level" in ('federal', 'regional', 'woreda', 'kebele'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" uuid,
	"revision_id" uuid,
	"recipient_subject_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "publication_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"release_number" integer NOT NULL,
	"publisher_profile_id" uuid NOT NULL,
	"publisher_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_releases_number_check" CHECK ("publication_releases"."release_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "publication_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"withdrawn_by_profile_id" uuid NOT NULL,
	"withdrawn_by_membership_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registry_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"owner_organization_id" text NOT NULL,
	"administrative_unit_id" text NOT NULL,
	"destination_id" uuid,
	"created_by_membership_id" uuid NOT NULL,
	"current_revision_id" uuid,
	"current_revision_number" integer DEFAULT 0 NOT NULL,
	"current_publication_release_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"is_synthetic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_resources_kind_check" CHECK ("registry_resources"."kind" in ('destination', 'attraction')),
	CONSTRAINT "registry_resources_versions_check" CHECK ("registry_resources"."current_revision_number" >= 0 and "registry_resources"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "resource_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"author_profile_id" uuid NOT NULL,
	"author_membership_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_revisions_number_check" CHECK ("resource_revisions"."revision_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_profile_id" uuid NOT NULL,
	"reviewer_membership_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_decisions_decision_check" CHECK ("review_decisions"."decision" in ('approve', 'request_changes', 'reject'))
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"submitted_by_profile_id" uuid NOT NULL,
	"submitted_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_issuer" text NOT NULL,
	"external_subject_id" text NOT NULL,
	"display_name" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_unit_paths" ADD CONSTRAINT "administrative_unit_paths_ancestor_unit_id_administrative_units_id_fk" FOREIGN KEY ("ancestor_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_unit_paths" ADD CONSTRAINT "administrative_unit_paths_descendant_unit_id_administrative_units_id_fk" FOREIGN KEY ("descendant_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "administrative_units" ADD CONSTRAINT "administrative_units_parent_id_administrative_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_membership_id_memberships_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_scopes" ADD CONSTRAINT "grant_scopes_grant_id_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."access_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_scopes" ADD CONSTRAINT "grant_scopes_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_outbox_event_id_outbox_events_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_releases" ADD CONSTRAINT "publication_releases_resource_id_registry_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."registry_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_releases" ADD CONSTRAINT "publication_releases_revision_id_resource_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."resource_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_releases" ADD CONSTRAINT "publication_releases_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_releases" ADD CONSTRAINT "publication_releases_publisher_profile_id_user_profiles_id_fk" FOREIGN KEY ("publisher_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_releases" ADD CONSTRAINT "publication_releases_publisher_membership_id_memberships_id_fk" FOREIGN KEY ("publisher_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_withdrawals" ADD CONSTRAINT "publication_withdrawals_release_id_publication_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."publication_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_withdrawals" ADD CONSTRAINT "publication_withdrawals_withdrawn_by_profile_id_user_profiles_id_fk" FOREIGN KEY ("withdrawn_by_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_withdrawals" ADD CONSTRAINT "publication_withdrawals_withdrawn_by_membership_id_memberships_id_fk" FOREIGN KEY ("withdrawn_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_resources" ADD CONSTRAINT "registry_resources_owner_organization_id_organizations_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_resources" ADD CONSTRAINT "registry_resources_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_resources" ADD CONSTRAINT "registry_resources_destination_id_registry_resources_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."registry_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_resources" ADD CONSTRAINT "registry_resources_created_by_membership_id_memberships_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_resources" ADD CONSTRAINT "registry_resources_current_revision_id_resource_revisions_id_fk" FOREIGN KEY ("current_revision_id") REFERENCES "public"."resource_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_resources" ADD CONSTRAINT "registry_resources_current_publication_release_id_publication_releases_id_fk" FOREIGN KEY ("current_publication_release_id") REFERENCES "public"."publication_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_revisions" ADD CONSTRAINT "resource_revisions_resource_id_registry_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."registry_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_revisions" ADD CONSTRAINT "resource_revisions_author_profile_id_user_profiles_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_revisions" ADD CONSTRAINT "resource_revisions_author_membership_id_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewer_profile_id_user_profiles_id_fk" FOREIGN KEY ("reviewer_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewer_membership_id_memberships_id_fk" FOREIGN KEY ("reviewer_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_resource_id_registry_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."registry_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_revision_id_resource_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."resource_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_profile_id_user_profiles_id_fk" FOREIGN KEY ("submitted_by_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_membership_id_memberships_id_fk" FOREIGN KEY ("submitted_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_grants_membership_capability_organization_uq" ON "access_grants" USING btree ("membership_id","capability","organization_id");--> statement-breakpoint
CREATE INDEX "access_grants_membership_capability_idx" ON "access_grants" USING btree ("membership_id","capability","active");--> statement-breakpoint
CREATE INDEX "administrative_unit_paths_descendant_idx" ON "administrative_unit_paths" USING btree ("descendant_unit_id");--> statement-breakpoint
CREATE INDEX "administrative_units_parent_idx" ON "administrative_units" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_created_idx" ON "audit_events" USING btree ("target_resource_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_created_idx" ON "audit_events" USING btree ("actor_subject_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "grant_scopes_grant_unit_uq" ON "grant_scopes" USING btree ("grant_id","administrative_unit_id");--> statement-breakpoint
CREATE INDEX "grant_scopes_unit_idx" ON "grant_scopes" USING btree ("administrative_unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_organization_uq" ON "memberships" USING btree ("user_profile_id","organization_id");--> statement-breakpoint
CREATE INDEX "memberships_organization_idx" ON "memberships" USING btree ("organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_recipient_uq" ON "notifications" USING btree ("outbox_event_id","recipient_subject_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_subject_id","created_at");--> statement-breakpoint
CREATE INDEX "organizations_unit_idx" ON "organizations" USING btree ("administrative_unit_id");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("processed_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_releases_resource_number_uq" ON "publication_releases" USING btree ("resource_id","release_number");--> statement-breakpoint
CREATE INDEX "publication_releases_revision_idx" ON "publication_releases" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_withdrawals_release_uq" ON "publication_withdrawals" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "publication_withdrawals_created_idx" ON "publication_withdrawals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "registry_resources_owner_scope_idx" ON "registry_resources" USING btree ("owner_organization_id","administrative_unit_id","kind");--> statement-breakpoint
CREATE INDEX "registry_resources_publication_idx" ON "registry_resources" USING btree ("current_publication_release_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_revisions_resource_number_uq" ON "resource_revisions" USING btree ("resource_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_revisions_resource_id_uq" ON "resource_revisions" USING btree ("resource_id","id");--> statement-breakpoint
CREATE INDEX "resource_revisions_author_idx" ON "resource_revisions" USING btree ("author_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_decisions_submission_uq" ON "review_decisions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "review_decisions_reviewer_idx" ON "review_decisions" USING btree ("reviewer_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_revision_uq" ON "submissions" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "submissions_resource_created_idx" ON "submissions" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_external_identity_uq" ON "user_profiles" USING btree ("external_issuer","external_subject_id");
--> statement-breakpoint
CREATE FUNCTION registry_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Registry history is append-only.' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resource_revisions_append_only BEFORE UPDATE OR DELETE ON resource_revisions FOR EACH ROW EXECUTE FUNCTION registry_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER submissions_append_only BEFORE UPDATE OR DELETE ON submissions FOR EACH ROW EXECUTE FUNCTION registry_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER review_decisions_append_only BEFORE UPDATE OR DELETE ON review_decisions FOR EACH ROW EXECUTE FUNCTION registry_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER publication_releases_append_only BEFORE UPDATE OR DELETE ON publication_releases FOR EACH ROW EXECUTE FUNCTION registry_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER publication_withdrawals_append_only BEFORE UPDATE OR DELETE ON publication_withdrawals FOR EACH ROW EXECUTE FUNCTION registry_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION registry_reject_history_mutation();
