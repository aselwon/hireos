---
name: proof
description: Verify a change or reproduce a reported behavior using relevant checks and inspected evidence. Use when a claim needs validation, independently of implementation, review or PR publication.
disable-model-invocation: true
---

# Proof

Establish what works, what fails and what remains unverified. Run independently
on local code, a commit, a PR or a reproduction request. No other skill is required.
Ordinary local setup and isolated probes are in scope; product-code fixes,
commits, publication and production mutations are not.

## Verify

1. Identify the claim, acceptance criteria, actual base and exact revision. Include
   the working-tree diff and relevant untracked files when verifying local work.
   Read repository instructions and choose the smallest meaningful checks that
   can disprove the claim, plus required repository checks.
2. Run the affected tests and exercise the relevant UI, endpoint, command or data
   flow. Cover meaningful failure cases and regressions. For content-only work,
   check structure, consistency and links instead of inventing runtime tests.
3. Use available local services or fixtures when appropriate. If a dependency is
   unavailable, try a practical substitute and state exactly which live behavior
   it cannot establish. A failed command, missing check or mocked integration is
   never a pass for the original claim.
4. Keep evidence suited to the claim: command and observed output, an inspected
   screenshot for a visible state, or a recording for timing and interaction.
   Follow the host's browser and capture rules. Inspect artifacts before citing
   them. Recording and before/after capture are optional; use an adequate
   alternative without repeatedly retrying a broken capture tool.

Do not alter the implementation to make verification pass. Keep temporary probes
isolated, clean up only resources created by this run, and preserve user work.
On failure, diagnose enough to identify an actionable cause and return it to the
caller. Do not start full-send or a repair loop.

## Result

Report the tested revision and local diff identity, the environment, commands or
steps, observed outcomes, evidence paths and limitations. Use `passed`, `failed`
or `incomplete` for each claim; the overall result cannot be passed while a
required claim is failed or unverified. Keep evidence local unless publication
was separately included in the request or calling workflow.

Evidence belongs to the tested code and environment. A caller changing behavior,
dependencies or conflict resolutions must refresh the affected checks; unchanged
evidence can be reused with its original scope clearly stated.
