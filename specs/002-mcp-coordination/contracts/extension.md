# Contract: Spec Kit extension

## Config keys (`spec-hub-config.yml`, committed)

The format stays flat: `key: value` lines. Every key below is optional, and a file with none of them
keeps approvals off.

```yaml
hub_url: https://hub.example.com
project: payments
# remote: origin

# Approvals (off until set above 0)
# spec_approvals: 1
# plan_approvals: 0
# spec_approvers: dependency-owners, @alice     # also: admin
# plan_approvers:
# self_approval_counts: false
# approval_survives_change: true

# Further numbered sequences (up to 5): sequence_<name>: <dir>/<NNNN>-*<ext>
# sequence_adr: docs/adr/NNNN-*.md
```

- The hub reads the default branch's copy (research R1). The reporter reads the working tree's copy
  only for `hub_url`, `project`, `remote` and `sequence_*`.
- **Errors**: an unknown key, a bad value, a duplicate sequence pattern or more than 5 sequences make
  the hub list the error on the project's Settings tab and use the default for that key.

## Manifest additions

The report POST body gains these fields; all of them are bounded (data-model.md § Validation).

```jsonc
{
  "default": {
    // …001 fields…
    "config": { "oid": "<blob>", "size": 312 },   // null when the file isn't on the default branch
    "sequences": { "adr": [1, 2, 67] }
  },
  "branches": [{
    // …001 fields…
    "sequences": { "adr": [68] },                 // numbers on this branch not on the default branch
    "features": [{
      // …001 fields…
      "docs": {
        "spec": "…", "plan": "…", "tasks": "…",
        "preview": { "oid": "…", "size": 9000 }    // or null
      },
      "contracts": [{ "name": "lease.md", "oid": "…", "size": 1800 }]
    }]
  }]
}
```

- `uploadableOids` also includes the config, preview and contract oids, so the existing 409 →
  PUT flow uploads them.
- The reporter keeps a single schema; there are no version branches, because 001 has one deployed
  hub and the reporter and hub ship together. A clone running an older reporter keeps working,
  because the new fields are optional in the schema. The `connect` notice (001) already tells
  people to re-run `connect` after an upgrade.

## Commands and hooks (`extension.yml`)

```yaml
provides:
  commands:
    - name: "speckit.spec-hub.claim"
      file: "commands/claim.md"
      description: "Claim the next feature number from Spec Hub (silent)"
    - name: "speckit.spec-hub.gate"
      file: "commands/gate.md"
      description: "Check Spec Hub for objections or missing approvals (silent when clear)"
    - name: "speckit.spec-hub.after"
      file: "commands/after.md"
      description: "Offer a review only when the project asks for approvals"

hooks:
  before_specify:   { command: "speckit.spec-hub.claim", optional: false }
  before_plan:      { command: "speckit.spec-hub.gate",  optional: false }
  before_implement: { command: "speckit.spec-hub.gate",  optional: false }
  after_specify:    { command: "speckit.spec-hub.after", optional: false }
  after_plan:       { command: "speckit.spec-hub.after", optional: false }
```

The exact `hooks:` shape for several events with one command follows Spec Kit 1.1's schema; check
it against the agentic extension's `extension.yml` during implementation.

### What each command tells the agent

All three start the same way: "If no `spec-hub` MCP tool is available, or any call fails, stop here
and say nothing."

| Command | Steps | Shown to the developer |
|---|---|---|
| claim | Call `claim_number`. Use its number as this feature's number. With "no claim is needed", carry on unchanged. | Nothing. |
| gate | Call `check_gate` for this feature: `spec` before plan, `plan` before implement. On `PASS`, carry on. On `ATTENTION`, show the findings in one message and ask once: go on, or stop? On "go on" (or any clear yes, such as "yes, do as I say"), call `go_on` and carry on without asking again. | Nothing, or one message with one question. |
| after | Call `check_gate` for the document just written. Only if `offer_review: true`, ask once: "Ask someone to review this <spec/plan>? (names, or 'the owners of what this depends on')". On names, call `request_review`. | Nothing, or one question. |

No command ever fails the Spec Kit command (Art. 3.6).

## Reporter commands

`spec-hub inbox --line` prints the `line` from `GET /api/r/:slug/inbox/summary`, or nothing. It
uses `--max-time 3` and exits 0 in every case.

The README shows the optional Claude Code hook for it:

```json
{ "hooks": { "SessionStart": [{ "hooks": [{ "type": "command",
  "command": "sh .specify/extensions/spec-hub/scripts/spec-hub inbox --line" }] }] } }
```
