# tstack skills

- Repo: `https://github.com/t3dotgg/tstack`
- Ref: `1085050f3baed1ac724caa4a8166145fb2ac88af`
- License: MIT (`Copyright (c) 2026 Theo Browne`), vendored at
  [`docs/vendor/tstack-LICENSE`](vendor/tstack-LICENSE)
- Installed into: `.agents/skills/`

## Installed skills

All nine skills from the pinned upstream ref are installed:

| Skill                 | Project path                                  | Invocation                                     |
| --------------------- | --------------------------------------------- | ---------------------------------------------- |
| `sol-loop`            | `.agents/skills/sol-loop/SKILL.md`            | Say “sol loop”                                 |
| `full-send`           | `.agents/skills/full-send/SKILL.md`           | Say “full send”                                |
| `full-stop`           | `.agents/skills/full-stop/SKILL.md`           | Say “full stop”                                |
| `file-pr`             | `.agents/skills/file-pr/SKILL.md`             | Ask to file/open/create a PR                   |
| `babysit-pr`          | `.agents/skills/babysit-pr/SKILL.md`          | Ask to monitor/watch/babysit a PR              |
| `leaving-pr-comments` | `.agents/skills/leaving-pr-comments/SKILL.md` | Automatic when posting GitHub comments         |
| `council`             | `.agents/skills/council/SKILL.md`             | Say “council”                                  |
| `takeover`            | `.agents/skills/takeover/SKILL.md`            | Ask to take over a PR, branch, or agent thread |
| `modernize`           | `.agents/skills/modernize/SKILL.md`           | Ask to rebase a PR or say “modernize”          |

## Dependency closure

The declared workflow dependency closure is:

```text
full-stop -> full-send
full-send -> sol-loop, file-pr, babysit-pr
file-pr -> leaving-pr-comments
babysit-pr -> leaving-pr-comments
takeover -> modernize, file-pr, babysit-pr, leaving-pr-comments
modernize -> leaving-pr-comments
```

`council` has no skill-file dependency; it requires the active harness to
provide three delegate models/providers. `sol-loop` requires the harness to
provide OpenAI’s GPT Sol. PR workflows additionally require an authenticated
`gh` CLI, and `babysit-pr` requires `python3` for its `pr-wait` script.

## Requirements

- An authenticated `gh` CLI for GitHub PR operations.
- `python3` for `babysit-pr`’s `pr-wait` script.
- `sol-loop` requires a harness capable of delegating to OpenAI’s GPT Sol;
  T3 Code uses `orchestrator_capabilities` and `delegate_task` for this.
- `full-send` and `full-stop` use the PR/review/watching capabilities supplied
  by the active harness. They were installed only; no workflow was run.

## Verification

All nine `SKILL.md` files have YAML frontmatter with matching `name` fields.
The relative reference in `full-stop/SKILL.md` resolves to
`../full-send/SKILL.md`, and every referenced dependency is present under
`.agents/skills/`. All referenced scripts and agent resources are present.
No existing skill directory was overwritten.
