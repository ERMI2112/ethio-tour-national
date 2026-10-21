CREATE TABLE "hotel_location_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_unit_id" text NOT NULL,
	"bureau_organization_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_locations" (
	"administrative_unit_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "location_unit_id" text;--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "location_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "bureau_organization_id" text;--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD COLUMN "scope_unit_id" text;--> statement-breakpoint
ALTER TABLE "hotel_location_routes" ADD CONSTRAINT "hotel_location_routes_location_unit_id_hotel_locations_administrative_unit_id_fk" FOREIGN KEY ("location_unit_id") REFERENCES "public"."hotel_locations"("administrative_unit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_location_routes" ADD CONSTRAINT "hotel_location_routes_bureau_organization_id_organizations_id_fk" FOREIGN KEY ("bureau_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_locations" ADD CONSTRAINT "hotel_locations_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hotel_location_routes_location_idx" ON "hotel_location_routes" USING btree ("location_unit_id");--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_location_unit_id_administrative_units_id_fk" FOREIGN KEY ("location_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_bureau_organization_id_organizations_id_fk" FOREIGN KEY ("bureau_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_scope_unit_id_administrative_units_id_fk" FOREIGN KEY ("scope_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_routing_complete_check" CHECK (("hotel_application_versions"."location_unit_id" is null and "hotel_application_versions"."location_snapshot" is null and "hotel_application_versions"."bureau_organization_id" is null and "hotel_application_versions"."scope_unit_id" is null) or ("hotel_application_versions"."location_unit_id" is not null and "hotel_application_versions"."location_snapshot" is not null and "hotel_application_versions"."bureau_organization_id" is not null and "hotel_application_versions"."scope_unit_id" is not null));--> statement-breakpoint
ALTER TABLE "hotel_application_versions" ADD CONSTRAINT "hotel_application_versions_routing_consistency_check" CHECK ("hotel_application_versions"."location_unit_id" is null or ("hotel_application_versions"."scope_unit_id" = "hotel_application_versions"."location_unit_id" and jsonb_typeof("hotel_application_versions"."location_snapshot") = 'object' and ("hotel_application_versions"."location_snapshot"->>'id' = "hotel_application_versions"."location_unit_id") is true and (not ("hotel_application_versions"."location_snapshot" ? 'administrativeUnitId') or ("hotel_application_versions"."location_snapshot"->>'administrativeUnitId' = "hotel_application_versions"."location_unit_id") is true) and ("hotel_application_versions"."content"->>'administrativeUnitId' = "hotel_application_versions"."location_unit_id") is true));