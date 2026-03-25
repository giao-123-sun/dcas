# @dcas/evolve — Meta-Learning Frameworks

> Simple structures that get better as models improve.

## Philosophy

These frameworks provide **minimal scaffolding** and trust the model to do the hard work. As models get smarter, these frameworks automatically get better.

## Frameworks

| # | Name | Loop | Memory | Best For |
|---|------|------|--------|----------|
| 1 | Ralph Loop | modify → test → keep/rollback | Best version | Code, params, prompts |
| 3 | Self-Critique | generate → critique → revise | None | Reports, proposals |
| 4 | Experience Distill | solve → analyze → distill → reset | Experience bank | Math, coding |
| 6 | Twin Adversarial | A vs B → judge → both learn | Shared experience | Creative tasks |
| 7 | Tournament | N outputs → rank → distill | History pool | Exploration tasks |

## Quick Start

```bash
cd labs/evolve
pnpm test                              # Unit tests (mock model)
OPENROUTER_API_KEY=xxx pnpm bench      # Real LLM benchmark
```
