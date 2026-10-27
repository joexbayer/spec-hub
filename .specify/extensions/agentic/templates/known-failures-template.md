# Known Failures Registry

Living log of failure categories observed in retrospectives.

A category is a *suggestion* until it has been seen **3 times** (or whatever
`promotion.threshold` is set to in `agentic-config.yml`). At that point it stops
being advice and becomes an enforced constitution rule.

The threshold exists to separate a real pattern from one-off noise. Promoting on
the first occurrence fills the constitution with rules that never fire again.

Copy this file to `.specify/memory/known-failures.md` in your project.

---

## Active Failures

| Category | Description | Count | First Seen | Constitution? |
|----------|-------------|-------|------------|---------------|
| _(example)_ spec-drift | Spec changed after implementation started without re-running specify | 1 | YYYY-MM-DD | No |

---

## Promoted to Constitution

| Category | Constitution Amendment | Promoted |
|----------|-----------------------|----------|
| | | |

---

## Instructions

When closing a retrospective:

1. Scan its `CONSTITUTION_AMENDMENTS` block for failure patterns.
2. Add a new row, or increment the count on the matching existing category.
   Match on mechanism, not wording — two differently-phrased descriptions of the
   same root cause are one category.
3. When a count reaches the threshold, move the row to **Promoted to
   Constitution** and add the rule via the constitution command.
