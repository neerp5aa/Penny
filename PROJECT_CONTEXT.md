# Penny Project Context

## Product

Penny is a mobile-first, AI-powered personal finance and financial literacy app for Canadian students and young adults. It is a working hackathon MVP for the Cognizant BrAInstorm AI Innovation Challenge 2026, not a production banking platform.

The experience should help a user understand a fictional financial picture, practise sound habits, and make intentional changes without pretending that generative AI is a financial calculator or decision-maker.

## Audience

- Canadian post-secondary students and young adults who are beginning to budget, save, and build credit knowledge.
- Users who benefit from plain language, guided actions, accessible design, and low-stakes practice with fictional data.
- Judges evaluating a coherent, responsible, and demonstrable use of AI.

## MVP scope: six modules

1. **Budget dashboard** — a Monarch-inspired overview of fictional accounts, recent transactions, category budgets, cash flow, and spending insights.
2. **Penny Council** — the flagship AI experience with three distinct advisors backed by deterministic financial tools.
3. **Learn** — short financial-literacy lessons, quizzes, explanations, and XP progression.
4. **Savings goals** — create and track fictional goals, contributions, progress, and deterministic target projections.
5. **Credit utilization** — an educational calculator using entered fictional balances and limits, with plain-language explanations.
6. **Responsible missions** — safe, achievable challenges that reinforce budgeting, saving, credit literacy, and reflection.

## Flagship: Penny Council

- **Savvy** is the practical budgeting guide: categories, cash flow, trade-offs, and actionable next steps.
- **Max** is the analytical coach: comparisons, deterministic scenarios, goal timing, and credit-utilization explanations.
- **Joy** is the encouraging habits coach: motivation, reflection, missions, and accessible explanations without shame.

The advisors may select approved tools and explain their outputs. They do not calculate authoritative values themselves. Any suggested budget or savings-goal mutation is returned as a reviewable proposal; nothing changes until the user explicitly approves it.

## Technology baseline

These choices keep the demo mobile-first while isolating financial logic and model credentials:

- **Client:** Next.js App Router, React, strict TypeScript, Tailwind CSS, and shadcn/ui, designed mobile-first.
- **API:** FastAPI with Pydantic request/response models. It owns authoritative deterministic calculations and will later own model-provider calls.
- **Domain:** a pure Python module for integer-cent calculations; the read-only frontend mirror uses decimal strings and `BigInt`.
- **Validation and tests:** schema validation at API/model boundaries and unit tests around every deterministic financial calculation.
- **MVP data:** versioned fictional fixtures plus Supabase Postgres migrations, Supabase Auth, and RLS. No bank connection or production financial data.
- **AI integration:** a provider adapter with structured tool calls so the demo can change providers or run with a deterministic fallback.
- **Money representation:** integer cents and the `CAD` currency code; ratios use integer/fixed-point or rational calculations with explicit rounding rules.

The model provider, hosting target, analytics approach, and production persistence requirements remain open decisions.

## Non-goals

- Real bank or credit-bureau connectivity
- Payments, transfers, lending, or identity verification
- Investment recommendations or trading
- Production-grade compliance, security certification, or multi-tenant infrastructure
- Complex forecasting, autonomous agents, or background financial actions

## Milestones

| Date | Outcome |
| --- | --- |
| October 29, 2026 | Repository audit, product context, guardrails, decisions, and architecture baseline |
| November 2, 2026 | App foundation plus a tested fictional-data dashboard vertical slice |
| November 6, 2026 | Penny Council end-to-end with deterministic tools and approval-gated proposals |
| November 9, 2026 | Learn, savings goals, credit utilization, missions, and XP demo paths complete |
| November 12, 2026 | Integrated demo flow, accessibility pass, error states, and test coverage complete |
| November 13, 2026 | Feature freeze; only critical fixes and demo-content changes afterward |
| November 14, 2026 | Final device rehearsal, offline/fallback check, pitch assets, and backup recording |
| November 15, 2026 | MVP submission deadline |

## MVP success criteria

A judge can open Penny on a phone-sized screen, understand a fictional budget, ask each Council member a useful question, see that numbers come from deterministic tools, explicitly approve a proposed change, complete a learning interaction, inspect a savings goal and credit-utilization scenario, and finish a responsible mission without encountering a dead end.
