CREATE TABLE "hotel_active_release_pair" (
	"singleton" integer PRIMARY KEY NOT NULL,
	"geography_release_id" text NOT NULL,
	"routing_release_id" text NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_active_release_pair_singleton_check" CHECK ("hotel_active_release_pair"."singleton" = 1)
);
--> statement-breakpoint
CREATE TABLE "hotel_geography_continuity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_release_id" text NOT NULL,
	"from_unit_revision_id" uuid NOT NULL,
	"to_release_id" text NOT NULL,
	"to_unit_revision_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"confidence" text NOT NULL,
	"provenance" text NOT NULL,
	CONSTRAINT "hotel_geography_continuity_releases_check" CHECK ("hotel_geography_continuity"."from_release_id" <> "hotel_geography_continuity"."to_release_id"),
	CONSTRAINT "hotel_geography_continuity_relation_check" CHECK ("hotel_geography_continuity"."relation" in ('same_entity', 'renamed', 'split_into', 'merged_into', 'possible_successor', 'no_claim')),
	CONSTRAINT "hotel_geography_continuity_confidence_check" CHECK ("hotel_geography_continuity"."confidence" in ('asserted', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "hotel_geography_external_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geography_release_id" text NOT NULL,
	"unit_revision_id" uuid NOT NULL,
	"source_namespace" text NOT NULL,
	"source_identifier" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_geography_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geography_release_id" text NOT NULL,
	"unit_revision_id" uuid NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"language_tag" text NOT NULL,
	"script" text,
	"name_kind" text NOT NULL,
	CONSTRAINT "hotel_geography_names_kind_check" CHECK ("hotel_geography_names"."name_kind" in ('display', 'alias'))
);
--> statement-breakpoint
CREATE TABLE "hotel_geography_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"source_name" text NOT NULL,
	"source_edition" text NOT NULL,
	"source_reference" text NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"synthetic" boolean NOT NULL,
	"validation_status" text DEFAULT 'draft' NOT NULL,
	"validation_report" jsonb,
	"validated_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_geography_releases_status_check" CHECK ("hotel_geography_releases"."validation_status" in ('draft', 'valid', 'invalid')),
	CONSTRAINT "hotel_geography_releases_dates_check" CHECK ("hotel_geography_releases"."effective_to" is null or "hotel_geography_releases"."effective_from" is null or "hotel_geography_releases"."effective_to" >= "hotel_geography_releases"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "hotel_geography_unit_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geography_release_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"parent_revision_id" uuid,
	"unit_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hotel_geography_unit_revisions_parent_check" CHECK ("hotel_geography_unit_revisions"."parent_revision_id" is null or "hotel_geography_unit_revisions"."parent_revision_id" <> "hotel_geography_unit_revisions"."id")
);
--> statement-breakpoint
CREATE TABLE "hotel_geography_units" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_routing_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"geography_release_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_edition" text NOT NULL,
	"provenance" text NOT NULL,
	"synthetic" boolean NOT NULL,
	"validated_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routing_release_id" text NOT NULL,
	"geography_release_id" text NOT NULL,
	"match_unit_id" text NOT NULL,
	"match_mode" text NOT NULL,
	"bureau_organization_id" text NOT NULL,
	"scope_unit_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "hotel_routing_rules_match_mode_check" CHECK ("hotel_routing_rules"."match_mode" in ('exact', 'descendants'))
);
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" DROP CONSTRAINT "hotel_application_versions_routing_complete_check";
--> statement-breakpoint
ALTER TABLE "grant_scopes" ALTER COLUMN "administrative_unit_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ALTER COLUMN "scope_unit_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "grant_scopes" ADD COLUMN "hotel_geography_release_id" text;
--> statement-breakpoint
ALTER TABLE "grant_scopes" ADD COLUMN "hotel_geography_unit_id" text;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "geography_release_id" text;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "location_revision_id" uuid;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "submitted_location_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "routing_release_id" text;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "routing_rule_id" uuid;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "resolved_scope_unit_id" text;
--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD COLUMN "geography_release_id" text;
--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD COLUMN "location_revision_id" uuid;
--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD COLUMN "routing_release_id" text;
--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD COLUMN "routing_rule_id" uuid;
--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD COLUMN "scope_geography_unit_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_geography_external_identifiers_source_id_uq" ON "hotel_geography_external_identifiers" USING btree ("geography_release_id","source_namespace","source_identifier");
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_geography_names_revision_value_uq" ON "hotel_geography_names" USING btree ("unit_revision_id","normalized_value","language_tag","script","name_kind");
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_geography_unit_revisions_release_unit_uq" ON "hotel_geography_unit_revisions" USING btree ("geography_release_id","unit_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_geography_unit_revisions_release_revision_uq" ON "hotel_geography_unit_revisions" USING btree ("geography_release_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_routing_releases_pair_uq" ON "hotel_routing_releases" USING btree ("id","geography_release_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_routing_rules_assignment_uq" ON "hotel_routing_rules" USING btree ("id","routing_release_id","geography_release_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_routing_rules_scope_uq" ON "hotel_routing_rules" USING btree ("id","scope_unit_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_routing_rules_organization_uq" ON "hotel_routing_rules" USING btree ("id","bureau_organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "grant_scopes_grant_hotel_geo_uq" ON "grant_scopes" USING btree ("grant_id","hotel_geography_release_id","hotel_geography_unit_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "hotel_application_versions_release_assignment_uq" ON "hotel_application_versions" USING btree ("id","geography_release_id","location_revision_id","routing_release_id","routing_rule_id","bureau_organization_id","resolved_scope_unit_id");
--> statement-breakpoint
CREATE INDEX "hotel_geography_names_search_idx" ON "hotel_geography_names" USING btree ("geography_release_id","normalized_value");
--> statement-breakpoint
CREATE INDEX "hotel_geography_unit_revisions_parent_idx" ON "hotel_geography_unit_revisions" USING btree ("geography_release_id","parent_revision_id");
--> statement-breakpoint
CREATE INDEX "hotel_routing_releases_geography_idx" ON "hotel_routing_releases" USING btree ("geography_release_id");
--> statement-breakpoint
CREATE INDEX "hotel_routing_rules_match_idx" ON "hotel_routing_rules" USING btree ("routing_release_id","geography_release_id","match_unit_id","enabled");
--> statement-breakpoint
CREATE INDEX "grant_scopes_hotel_geography_idx" ON "grant_scopes" USING btree ("hotel_geography_release_id","hotel_geography_unit_id");
--> statement-breakpoint
CREATE INDEX "hotel_bureau_cases_release_queue_idx" ON "hotel_bureau_cases" USING btree ("bureau_organization_id","geography_release_id","scope_geography_unit_id","status","created_at");
--> statement-breakpoint
ALTER TABLE "hotel_active_release_pair" ADD CONSTRAINT "hotel_active_release_pair_compatible_fk" FOREIGN KEY ("routing_release_id","geography_release_id") REFERENCES "public"."hotel_routing_releases"("id","geography_release_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_geography_continuity" ADD CONSTRAINT "hotel_geography_continuity_from_revision_fk" FOREIGN KEY ("from_release_id","from_unit_revision_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_geography_continuity" ADD CONSTRAINT "hotel_geography_continuity_to_revision_fk" FOREIGN KEY ("to_release_id","to_unit_revision_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_geography_external_identifiers" ADD CONSTRAINT "hotel_geography_external_identifiers_revision_release_fk" FOREIGN KEY ("geography_release_id","unit_revision_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_geography_names" ADD CONSTRAINT "hotel_geography_names_revision_release_fk" FOREIGN KEY ("geography_release_id","unit_revision_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_geography_unit_revisions" ADD CONSTRAINT "hotel_geography_unit_revisions_geography_release_id_hotel_geography_releases_id_fk" FOREIGN KEY ("geography_release_id") REFERENCES "public"."hotel_geography_releases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_geography_unit_revisions" ADD CONSTRAINT "hotel_geography_unit_revisions_unit_id_hotel_geography_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."hotel_geography_units"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_geography_unit_revisions" ADD CONSTRAINT "hotel_geography_unit_revisions_parent_same_release_fk" FOREIGN KEY ("geography_release_id","parent_revision_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_routing_releases" ADD CONSTRAINT "hotel_routing_releases_geography_release_id_hotel_geography_releases_id_fk" FOREIGN KEY ("geography_release_id") REFERENCES "public"."hotel_geography_releases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_routing_rules" ADD CONSTRAINT "hotel_routing_rules_bureau_organization_id_organizations_id_fk" FOREIGN KEY ("bureau_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_routing_rules" ADD CONSTRAINT "hotel_routing_rules_release_pair_fk" FOREIGN KEY ("routing_release_id","geography_release_id") REFERENCES "public"."hotel_routing_releases"("id","geography_release_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_routing_rules" ADD CONSTRAINT "hotel_routing_rules_match_unit_release_fk" FOREIGN KEY ("geography_release_id","match_unit_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","unit_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_routing_rules" ADD CONSTRAINT "hotel_routing_rules_scope_unit_release_fk" FOREIGN KEY ("geography_release_id","scope_unit_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","unit_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "grant_scopes" ADD CONSTRAINT "grant_scopes_hotel_geography_unit_fk" FOREIGN KEY ("hotel_geography_release_id","hotel_geography_unit_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","unit_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_geography_release_id_hotel_geography_releases_id_fk" FOREIGN KEY ("geography_release_id") REFERENCES "public"."hotel_geography_releases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_routing_release_id_hotel_routing_releases_id_fk" FOREIGN KEY ("routing_release_id") REFERENCES "public"."hotel_routing_releases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_location_revision_release_fk" FOREIGN KEY ("geography_release_id","location_revision_id") REFERENCES "public"."hotel_geography_unit_revisions"("geography_release_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_routing_release_pair_fk" FOREIGN KEY ("routing_release_id","geography_release_id") REFERENCES "public"."hotel_routing_releases"("id","geography_release_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_routing_rule_fk" FOREIGN KEY ("routing_rule_id","routing_release_id","geography_release_id") REFERENCES "public"."hotel_routing_rules"("id","routing_release_id","geography_release_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_routing_scope_fk" FOREIGN KEY ("routing_rule_id","resolved_scope_unit_id") REFERENCES "public"."hotel_routing_rules"("id","scope_unit_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_routing_organization_fk" FOREIGN KEY ("routing_rule_id","bureau_organization_id") REFERENCES "public"."hotel_routing_rules"("id","bureau_organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD CONSTRAINT "hotel_bureau_cases_release_assignment_fk" FOREIGN KEY ("application_version_id","geography_release_id","location_revision_id","routing_release_id","routing_rule_id","bureau_organization_id","scope_geography_unit_id") REFERENCES "public"."hotel_application_versions"("id","geography_release_id","location_revision_id","routing_release_id","routing_rule_id","bureau_organization_id","resolved_scope_unit_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "grant_scopes" ADD CONSTRAINT "grant_scopes_exactly_one_geography_check" CHECK (("grant_scopes"."administrative_unit_id" is not null and "grant_scopes"."hotel_geography_release_id" is null and "grant_scopes"."hotel_geography_unit_id" is null) or ("grant_scopes"."administrative_unit_id" is null and "grant_scopes"."hotel_geography_release_id" is not null and "grant_scopes"."hotel_geography_unit_id" is not null));
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_release_assignment_complete_check" CHECK (("hotel_application_versions"."geography_release_id" is null and "hotel_application_versions"."location_revision_id" is null and "hotel_application_versions"."submitted_location_snapshot" is null and "hotel_application_versions"."routing_release_id" is null and "hotel_application_versions"."routing_rule_id" is null and "hotel_application_versions"."resolved_scope_unit_id" is null) or ("hotel_application_versions"."geography_release_id" is not null and "hotel_application_versions"."location_revision_id" is not null and jsonb_typeof("hotel_application_versions"."submitted_location_snapshot") = 'object' and "hotel_application_versions"."routing_release_id" is not null and "hotel_application_versions"."routing_rule_id" is not null and "hotel_application_versions"."bureau_organization_id" is not null and "hotel_application_versions"."scope_unit_id" is null and "hotel_application_versions"."location_unit_id" is null and "hotel_application_versions"."location_snapshot" is null and "hotel_application_versions"."resolved_scope_unit_id" is not null));
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_release_assignment_consistency_check" CHECK ("hotel_application_versions"."geography_release_id" is null or (("hotel_application_versions"."content"->'locationSelection'->>'geographyReleaseId' = "hotel_application_versions"."geography_release_id") is true and ("hotel_application_versions"."content"->'locationSelection'->>'unitRevisionId' = "hotel_application_versions"."location_revision_id"::text) is true and ("hotel_application_versions"."submitted_location_snapshot"->>'geographyReleaseId' = "hotel_application_versions"."geography_release_id") is true and ("hotel_application_versions"."submitted_location_snapshot"->>'unitRevisionId' = "hotel_application_versions"."location_revision_id"::text) is true));
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_routing_complete_check" CHECK (("hotel_application_versions"."location_unit_id" is null and "hotel_application_versions"."location_snapshot" is null and "hotel_application_versions"."bureau_organization_id" is null and "hotel_application_versions"."scope_unit_id" is null) or ("hotel_application_versions"."location_unit_id" is not null and "hotel_application_versions"."location_snapshot" is not null and "hotel_application_versions"."bureau_organization_id" is not null and "hotel_application_versions"."scope_unit_id" is not null) or ("hotel_application_versions"."location_unit_id" is null and "hotel_application_versions"."location_snapshot" is null and "hotel_application_versions"."bureau_organization_id" is not null and "hotel_application_versions"."scope_unit_id" is null and "hotel_application_versions"."geography_release_id" is not null and "hotel_application_versions"."location_revision_id" is not null and "hotel_application_versions"."routing_release_id" is not null and "hotel_application_versions"."routing_rule_id" is not null and "hotel_application_versions"."resolved_scope_unit_id" is not null and jsonb_typeof("hotel_application_versions"."submitted_location_snapshot") = 'object'));
--> statement-breakpoint
ALTER TABLE "hotel_bureau_cases" ADD CONSTRAINT "hotel_bureau_cases_release_assignment_complete_check" CHECK (("hotel_bureau_cases"."geography_release_id" is null and "hotel_bureau_cases"."location_revision_id" is null and "hotel_bureau_cases"."routing_release_id" is null and "hotel_bureau_cases"."routing_rule_id" is null and "hotel_bureau_cases"."scope_geography_unit_id" is null and "hotel_bureau_cases"."scope_unit_id" is not null) or ("hotel_bureau_cases"."geography_release_id" is not null and "hotel_bureau_cases"."location_revision_id" is not null and "hotel_bureau_cases"."routing_release_id" is not null and "hotel_bureau_cases"."routing_rule_id" is not null and "hotel_bureau_cases"."scope_geography_unit_id" is not null and "hotel_bureau_cases"."scope_unit_id" is null));
--> statement-breakpoint
CREATE FUNCTION hotel_guard_geography_release() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'hotel geography must be validated before activation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'activated hotel geography release is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.activated_at IS NOT NULL THEN
    IF NEW.synthetic IS NOT TRUE OR NEW.validation_status <> 'valid'
       OR NEW.validated_at IS NULL OR (NEW.validation_report->>'valid') IS DISTINCT FROM 'true'
       OR NOT EXISTS (SELECT 1 FROM hotel_geography_unit_revisions WHERE geography_release_id = NEW.id) THEN
      RAISE EXCEPTION 'hotel geography release is not validated for synthetic activation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM hotel_geography_unit_revisions revision
      WHERE revision.geography_release_id = NEW.id
        AND NOT EXISTS (SELECT 1 FROM hotel_geography_names name
                        WHERE name.geography_release_id = NEW.id
                          AND name.unit_revision_id = revision.id
                          AND name.name_kind = 'display' AND length(btrim(name.value)) > 0)
    ) THEN RAISE EXCEPTION 'hotel geography revision has no display name'; END IF;
    IF EXISTS (
      WITH RECURSIVE chain AS (
        SELECT id, parent_revision_id, ARRAY[id] AS path, false AS cycle
        FROM hotel_geography_unit_revisions WHERE geography_release_id = NEW.id
        UNION ALL
        SELECT parent.id, parent.parent_revision_id, chain.path || parent.id,
               parent.id = ANY(chain.path)
        FROM hotel_geography_unit_revisions parent
        JOIN chain ON parent.id = chain.parent_revision_id
        WHERE parent.geography_release_id = NEW.id AND NOT chain.cycle
      ) SELECT 1 FROM chain WHERE cycle
    ) THEN RAISE EXCEPTION 'hotel geography hierarchy contains a cycle'; END IF;
    IF EXISTS (
      SELECT 1 FROM hotel_geography_unit_revisions current_revision
      WHERE current_revision.geography_release_id = NEW.id
        AND EXISTS (SELECT 1 FROM hotel_geography_unit_revisions previous
                    WHERE previous.unit_id = current_revision.unit_id
                      AND previous.geography_release_id <> NEW.id)
        AND NOT EXISTS (SELECT 1 FROM hotel_geography_continuity continuity
                        WHERE continuity.to_release_id = NEW.id
                          AND continuity.to_unit_revision_id = current_revision.id)
    ) THEN RAISE EXCEPTION 'reused hotel geography unit requires explicit continuity provenance'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hotel_geography_release_guard
BEFORE INSERT OR UPDATE OR DELETE ON hotel_geography_releases
FOR EACH ROW EXECUTE FUNCTION hotel_guard_geography_release();
--> statement-breakpoint
CREATE FUNCTION hotel_guard_geography_content() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE old_release text; new_release text;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_release := to_jsonb(OLD)->>TG_ARGV[0]; END IF;
  IF TG_OP <> 'DELETE' THEN new_release := to_jsonb(NEW)->>TG_ARGV[0]; END IF;
  IF EXISTS (SELECT 1 FROM hotel_geography_releases
             WHERE id IN (old_release, new_release) AND activated_at IS NOT NULL) THEN
    RAISE EXCEPTION 'activated hotel geography contents are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hotel_geography_revisions_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hotel_geography_unit_revisions
FOR EACH ROW EXECUTE FUNCTION hotel_guard_geography_content('geography_release_id');
--> statement-breakpoint
CREATE TRIGGER hotel_geography_names_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hotel_geography_names
FOR EACH ROW EXECUTE FUNCTION hotel_guard_geography_content('geography_release_id');
--> statement-breakpoint
CREATE TRIGGER hotel_geography_identifiers_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hotel_geography_external_identifiers
FOR EACH ROW EXECUTE FUNCTION hotel_guard_geography_content('geography_release_id');
--> statement-breakpoint
CREATE TRIGGER hotel_geography_continuity_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hotel_geography_continuity
FOR EACH ROW EXECUTE FUNCTION hotel_guard_geography_content('to_release_id');
--> statement-breakpoint
CREATE TRIGGER hotel_geography_units_immutable
BEFORE UPDATE OR DELETE ON hotel_geography_units
FOR EACH ROW EXECUTE FUNCTION reject_hotel_history_mutation();
--> statement-breakpoint
CREATE FUNCTION hotel_guard_routing_release() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'hotel routing must be validated before activation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'activated hotel routing release is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.activated_at IS NOT NULL THEN
    IF NEW.synthetic IS NOT TRUE OR NEW.validated_at IS NULL OR NOT EXISTS (
      SELECT 1 FROM hotel_geography_releases geography WHERE geography.id = NEW.geography_release_id
        AND geography.synthetic = true AND geography.validation_status = 'valid'
        AND geography.activated_at IS NOT NULL
    ) THEN RAISE EXCEPTION 'hotel routing release has no validated compatible geography'; END IF;
    IF EXISTS (
      SELECT 1 FROM hotel_routing_rules rule
      JOIN organizations organization ON organization.id = rule.bureau_organization_id
      WHERE rule.routing_release_id = NEW.id
        AND (organization.is_synthetic IS DISTINCT FROM true OR organization.organization_type <> 'administrative')
    ) THEN RAISE EXCEPTION 'hotel routing requires a synthetic review organization'; END IF;
    IF EXISTS (
      SELECT 1 FROM hotel_routing_rules rule WHERE rule.routing_release_id = NEW.id
      AND NOT EXISTS (
        WITH RECURSIVE chain AS (
          SELECT id, unit_id, parent_revision_id FROM hotel_geography_unit_revisions
          WHERE geography_release_id = NEW.geography_release_id AND unit_id = rule.match_unit_id
          UNION ALL
          SELECT parent.id, parent.unit_id, parent.parent_revision_id
          FROM hotel_geography_unit_revisions parent JOIN chain ON parent.id = chain.parent_revision_id
          WHERE parent.geography_release_id = NEW.geography_release_id
        ) SELECT 1 FROM chain WHERE unit_id = rule.scope_unit_id
      )
    ) THEN RAISE EXCEPTION 'hotel route scope must cover its matched unit'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hotel_routing_release_guard
BEFORE INSERT OR UPDATE OR DELETE ON hotel_routing_releases
FOR EACH ROW EXECUTE FUNCTION hotel_guard_routing_release();
--> statement-breakpoint
CREATE FUNCTION hotel_guard_routing_rule() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM hotel_routing_releases
    WHERE id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.routing_release_id END,
                 CASE WHEN TG_OP <> 'DELETE' THEN NEW.routing_release_id END)
      AND activated_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'activated hotel routing contents are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hotel_routing_rules_immutable
BEFORE INSERT OR UPDATE OR DELETE ON hotel_routing_rules
FOR EACH ROW EXECUTE FUNCTION hotel_guard_routing_rule();
--> statement-breakpoint
CREATE FUNCTION hotel_guard_active_release_pair() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM hotel_geography_releases geography
    JOIN hotel_routing_releases routing ON routing.geography_release_id = geography.id
    WHERE geography.id = NEW.geography_release_id AND routing.id = NEW.routing_release_id
      AND geography.synthetic = true AND routing.synthetic = true
      AND geography.validation_status = 'valid' AND geography.activated_at IS NOT NULL
      AND routing.validated_at IS NOT NULL AND routing.activated_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'hotel active release pair must be validated, synthetic and compatible'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hotel_active_release_pair_guard
BEFORE INSERT OR UPDATE ON hotel_active_release_pair
FOR EACH ROW EXECUTE FUNCTION hotel_guard_active_release_pair();
--> statement-breakpoint
CREATE FUNCTION hotel_guard_versioned_submission() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE active_pair hotel_active_release_pair%ROWTYPE;
DECLARE selected_unit text; path_ids text[]; matches integer; selected_rule hotel_routing_rules%ROWTYPE;
DECLARE expected_hierarchy jsonb;
BEGIN
  IF NEW.geography_release_id IS NULL THEN
    RAISE EXCEPTION 'new hotel submissions require a versioned location selection';
  END IF;
  SELECT * INTO active_pair FROM hotel_active_release_pair WHERE singleton = 1 FOR SHARE;
  IF NOT FOUND OR active_pair.geography_release_id <> NEW.geography_release_id
     OR active_pair.routing_release_id <> NEW.routing_release_id THEN
    RAISE EXCEPTION 'hotel submission release pair is stale or incompatible';
  END IF;
  SELECT unit_id INTO selected_unit FROM hotel_geography_unit_revisions
  WHERE id = NEW.location_revision_id AND geography_release_id = NEW.geography_release_id;
  IF NOT FOUND OR (NEW.content->'locationSelection'->>'unitId') IS DISTINCT FROM selected_unit
     OR (NEW.submitted_location_snapshot->>'unitId') IS DISTINCT FROM selected_unit THEN
    RAISE EXCEPTION 'hotel submission selected unit does not match the release revision';
  END IF;
  WITH RECURSIVE chain AS (
    SELECT id, unit_id, unit_type, parent_revision_id, 0 AS depth
    FROM hotel_geography_unit_revisions WHERE id = NEW.location_revision_id
      AND geography_release_id = NEW.geography_release_id
    UNION ALL
    SELECT parent.id, parent.unit_id, parent.unit_type, parent.parent_revision_id, chain.depth + 1
    FROM hotel_geography_unit_revisions parent JOIN chain ON parent.id = chain.parent_revision_id
    WHERE parent.geography_release_id = NEW.geography_release_id
  )
  SELECT array_agg(chain.unit_id ORDER BY depth DESC),
         jsonb_agg(jsonb_build_object('unitId', chain.unit_id, 'unitRevisionId', chain.id,
                   'unitType', chain.unit_type, 'displayName', display_name.value) ORDER BY depth DESC)
  INTO path_ids, expected_hierarchy
  FROM chain JOIN LATERAL (
    SELECT name.value FROM hotel_geography_names name WHERE name.unit_revision_id = chain.id
      AND name.geography_release_id = NEW.geography_release_id AND name.name_kind = 'display'
    ORDER BY CASE WHEN lower(name.language_tag) = 'en' THEN 0 ELSE 1 END,
             name.language_tag COLLATE "C", COALESCE(name.script, '') COLLATE "C",
             name.normalized_value COLLATE "C", name.id LIMIT 1
  ) display_name ON true;
  IF (NEW.submitted_location_snapshot->'hierarchy') IS DISTINCT FROM expected_hierarchy
     OR (NEW.submitted_location_snapshot->>'displayName') IS DISTINCT FROM (expected_hierarchy->-1->>'displayName')
     OR (NEW.submitted_location_snapshot->>'unitType') IS DISTINCT FROM (expected_hierarchy->-1->>'unitType') THEN
    RAISE EXCEPTION 'hotel submission hierarchy does not match the immutable geography release';
  END IF;
  SELECT count(*) INTO matches FROM hotel_routing_rules rule
  WHERE rule.routing_release_id = NEW.routing_release_id AND rule.geography_release_id = NEW.geography_release_id
    AND rule.enabled = true
    AND ((rule.match_mode = 'exact' AND rule.match_unit_id = selected_unit)
      OR (rule.match_mode = 'descendants' AND rule.match_unit_id = ANY(path_ids)));
  IF matches <> 1 THEN RAISE EXCEPTION 'hotel submission requires exactly one applicable route'; END IF;
  SELECT * INTO selected_rule FROM hotel_routing_rules WHERE id = NEW.routing_rule_id
    AND routing_release_id = NEW.routing_release_id AND geography_release_id = NEW.geography_release_id
    AND enabled = true
    AND ((match_mode = 'exact' AND match_unit_id = selected_unit)
      OR (match_mode = 'descendants' AND match_unit_id = ANY(path_ids)));
  IF NOT FOUND OR selected_rule.bureau_organization_id <> NEW.bureau_organization_id
     OR selected_rule.scope_unit_id <> NEW.resolved_scope_unit_id
     OR NOT NEW.resolved_scope_unit_id = ANY(path_ids) THEN
    RAISE EXCEPTION 'hotel submission assignment does not match its immutable route';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hotel_versioned_submission_guard
BEFORE INSERT ON hotel_application_versions
FOR EACH ROW EXECUTE FUNCTION hotel_guard_versioned_submission();
--> statement-breakpoint
CREATE FUNCTION hotel_guard_case_release_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.geography_release_id, NEW.location_revision_id,
      NEW.routing_release_id, NEW.routing_rule_id, NEW.scope_geography_unit_id)
    IS DISTINCT FROM ROW(OLD.geography_release_id, OLD.location_revision_id,
      OLD.routing_release_id, OLD.routing_rule_id, OLD.scope_geography_unit_id) THEN
    RAISE EXCEPTION 'hotel Bureau case release assignment is immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hotel_application_versions version
    WHERE version.id = NEW.application_version_id AND version.application_id = NEW.application_id
      AND version.bureau_organization_id = NEW.bureau_organization_id
      AND version.scope_unit_id IS NOT DISTINCT FROM NEW.scope_unit_id
      AND version.geography_release_id IS NOT DISTINCT FROM NEW.geography_release_id
      AND version.location_revision_id IS NOT DISTINCT FROM NEW.location_revision_id
      AND version.routing_release_id IS NOT DISTINCT FROM NEW.routing_release_id
      AND version.routing_rule_id IS NOT DISTINCT FROM NEW.routing_rule_id
      AND version.resolved_scope_unit_id IS NOT DISTINCT FROM NEW.scope_geography_unit_id
  ) THEN RAISE EXCEPTION 'hotel Bureau case does not match its immutable submitted version'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hotel_case_release_assignment_guard
BEFORE INSERT OR UPDATE ON hotel_bureau_cases
FOR EACH ROW EXECUTE FUNCTION hotel_guard_case_release_assignment();
--> statement-breakpoint
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hotel_geography_releases', 'hotel_geography_units', 'hotel_geography_unit_revisions',
    'hotel_geography_names', 'hotel_geography_external_identifiers', 'hotel_geography_continuity',
    'hotel_routing_releases', 'hotel_routing_rules'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_hotel_history_mutation()',
                   table_name || '_no_truncate', table_name);
  END LOOP;
END;
$$;
