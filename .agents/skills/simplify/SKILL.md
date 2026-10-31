---
name: simplify
description: Simplify a specified change or code area while preserving behavior, then verify the edits. Use for focused cleanup without starting a delivery or PR workflow.
disable-model-invocation: true
---

# Simplify

Produce clearer code and a verified local diff. This skill works on its own;
it needs no PR, council review, proof skill or full-send run. It does not commit,
push, publish comments or change PR status.

## Scope

Use the files or change identified by the user or caller. Otherwise inspect the
current task diff, including staged, unstaged and untracked task files and task
commits against the actual base. Infer scope from the conversation and repository
before asking. An empty diff is a valid no-op, not permission to clean up the repo.
Preserve unrelated changes and existing public behavior.

## Work

1. Read the relevant code, callers, tests and repository instructions. Look for
   unnecessary indirection, duplicate logic, speculative branches and departures
   from established patterns. Prefer edits that reduce the effort of understanding
   or changing the code; fewer lines alone is not a reason to refactor.
2. Apply worthwhile changes directly. Preserve validation, error handling,
   compatibility and meaningful regression coverage. Avoid unrelated dependency
   upgrades, API redesigns and broad formatting churn.
3. Run checks relevant to the edits and repository-required validation. Exercise
   behavior where structural checks are insufficient. Reuse current evidence for
   untouched paths; do not require a separate verification workflow. If an edit
   introduces a regression, fix it or undo only that edit.

Make routine implementation choices autonomously. If a genuine ambiguity would
change behavior or scope, complete the independent cleanup first and report the
specific decision needed. Do not invent a simplification to produce a diff.

## Result

Return changed paths, why the code is clearer, checks and observed results, and
any remaining verification gap. State when no worthwhile change was found.
The caller may continue delivery; standalone use ends here.
