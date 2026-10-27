CREATE FUNCTION security_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security_event is append-only (constitution Art. 4.3, FR-031)';
END
$$;
--> statement-breakpoint
CREATE TRIGGER security_event_append_only BEFORE UPDATE OR DELETE ON security_event
FOR EACH ROW EXECUTE FUNCTION security_event_append_only();
