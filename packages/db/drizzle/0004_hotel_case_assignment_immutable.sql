CREATE OR REPLACE FUNCTION hotel_bureau_case_binding_is_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.application_id,
    NEW.application_version_id,
    NEW.bureau_organization_id,
    NEW.scope_unit_id
  ) IS DISTINCT FROM ROW(
    OLD.application_id,
    OLD.application_version_id,
    OLD.bureau_organization_id,
    OLD.scope_unit_id
  ) THEN
    RAISE EXCEPTION 'hotel Bureau case assignment is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hotel_bureau_case_binding_immutable
BEFORE UPDATE OF application_id, application_version_id, bureau_organization_id, scope_unit_id
ON hotel_bureau_cases
FOR EACH ROW EXECUTE FUNCTION hotel_bureau_case_binding_is_immutable();
