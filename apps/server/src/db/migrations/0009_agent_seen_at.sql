-- Connect page: when the hub last saw an MCP call from a member to a project (specs/007-connect-lanes).
ALTER TABLE "membership" ADD COLUMN "agent_seen_at" timestamp with time zone;