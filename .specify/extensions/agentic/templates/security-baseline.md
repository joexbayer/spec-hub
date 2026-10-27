# Security Baseline

The shared reference for `speckit.agentic.security` and the security dimension of
`speckit.agentic.verify`. Installed to
`.specify/extensions/agentic/templates/security-baseline.md` — edit it to match
your project's actual obligations.

Two different things get called "security requirements": **frameworks** that say
what good looks like, and **law** that says what you must do or be fined. Keep
them apart. Copy only what applies to you; a baseline nobody can satisfy gets
ignored wholesale.

---

## OWASP Top 10:2025

Current as of January 2026. **Not the 2021 list** — two categories are new and
SSRF was folded into A01, so a review written against 2021 has real gaps.

| ID | Category | What to look for |
|---|---|---|
| **A01** | Broken Access Control | Missing authorization on an endpoint, IDOR, privilege escalation, path traversal. **Now includes SSRF.** |
| **A02** | Security Misconfiguration | Debug on in prod, default credentials, permissive CORS, verbose errors, unnecessary features enabled |
| **A03** | Software Supply Chain Failures | **New.** Vulnerable or unpinned dependencies, unverified build inputs, no SBOM, compromised CI |
| **A04** | Cryptographic Failures | Weak or homegrown crypto, plaintext at rest or in transit, bad key handling, predictable randomness |
| **A05** | Injection | SQL, command, LDAP, XSS, template — plus query mini-languages where a bound parameter stops injection but not operator abuse |
| **A06** | Insecure Design | The control that was never designed. Missing rate limits, no tenant isolation, trust placed in the client |
| **A07** | Authentication Failures | Weak credential policy, broken session lifecycle, missing MFA, no revocation |
| **A08** | Software or Data Integrity Failures | Unsigned artifacts, insecure deserialization, auto-update without verification |
| **A09** | Security Logging & Alerting Failures | Security events unlogged, or logged where nobody looks. **Alerting is in scope, not just logging.** |
| **A10** | Mishandling of Exceptional Conditions | **New.** Failing open, swallowed errors, logic that assumes the happy path, error messages that leak internals |

A03 and A10 are where most existing reviews come up empty, because neither was a
category before. Check them explicitly rather than assuming they'd have surfaced.

## Verification level — OWASP ASVS 5.0

Frameworks say what to achieve; ASVS gives testable requirements. v5.0.0 (May
2025) is ~350 requirements across 17 chapters.

- **L1** — first layer of defence; deliberately low entry bar
- **L2** — standard practice for anything holding real data. **Default target.**
- **L3** — high assurance, where compromise is severe

Set `security.asvs_level` in `agentic-config.yml`. "We follow ASVS" without a
level named means nothing.

## When the system is agentic

If the feature gives a model tools, memory, or autonomy, the classic Top 10 is
not sufficient. From OWASP's GenAI work (Top 10 for LLM Applications 2025 and for
Agentic Applications 2026), the recurring ones:

- **Prompt injection** — untrusted content reaching a model that can act. Treat
  any retrieved document, issue body, or web page as attacker-controlled.
- **Excessive agency** — the agent can do more than the task requires. Scope
  tools and credentials to the job, not to the user.
- **Tool misuse** — a legitimate tool invoked toward an illegitimate end.
- **Memory / context poisoning** — persisted state that later steps trust.
- **Sensitive information disclosure** — secrets or other tenants' data reaching
  a prompt or a log.

The mitigation that generalises: an agent's blast radius is its credentials and
its tools. Bound both, and log what it actually did.

---

## Regulatory obligations

Fill in what applies. Delete what does not — and record *why*, so the next person
doesn't re-litigate it.

### Cyber Resilience Act (EU)

In scope if you place a "product with digital elements" on the EU market. This is
wider than people assume: commercially supplied software counts, not just IoT.

Four duties land on engineers:

1. **SBOM** — machine-readable, covering at least top-level dependencies, kept
   current for the support period. CycloneDX or SPDX. It must be able to answer
   "are we affected by this CVE?" in minutes, or it isn't doing its job.
2. **Secure by default** — secure initial configuration, minimised attack
   surface, resettable to original state. No default credentials.
3. **Vulnerability handling as a lifecycle** — remediate without undue delay,
   test regularly, publish fixed-vulnerability information, run a monitored
   disclosure contact (`/.well-known/security.txt`).
4. **Reporting clocks** — from **11 Sep 2026**, actively exploited vulnerabilities
   and severe incidents: **24 h** early warning, **72 h** full notification,
   **14 days** final report. Full obligations apply **11 Dec 2027**.

The 24-hour clock is a *detection* requirement wearing a reporting costume. If
you cannot tell you are being exploited, it is already running.

### NIS2 / digitalsikkerhetsloven (Norway)

Applies to designated essential and important entities. Drives governance,
supply-chain risk management, and incident reporting rather than specific code
patterns. Norway is EEA, so check current status — dates have slipped.

### NSM grunnprinsipper v2.1

Guidance, not law, but the basis Norwegian sector regulators build on. Four
categories, 21 principles, 118 measures. The engineering-relevant ordering:

1. **Identifisere og kartlegge** — you cannot protect what you have not mapped.
   Dependency inventory is principle 1.2, and it is your SBOM.
2. **Beskytte og opprettholde** — secure SDLC, architecture, configuration,
   identity, encryption, recovery, change control.
3. **Oppdage** — vulnerability scanning, monitoring, analysis, pentest.
4. **Håndtere og gjenopprette** — incident readiness, classification, handling,
   and learning.

### GDPR

If the feature touches personal data: lawful basis, data minimisation, retention
limit, subject-access and deletion paths, and a record of what is stored where.

---

## The non-negotiable floor

These are never cut for scope, speed, or brevity — including by a restraint pass:

- Input validation at trust boundaries
- Authorization on every endpoint that isn't deliberately public
- Error handling that prevents data loss and fails **closed**
- Secrets outside the repo, outside logs, and rotatable
- An audit trail for security-relevant actions
- Accessibility affordances

Cut the abstraction, never the control.
