# Penny Engineering Rules

These rules apply to all work in this repository.

## Product boundary

- Build a hackathon MVP for Canadian students and young adults; optimize for a clear, reliable demo by November 15, 2026.
- Use only fictional people, accounts, transactions, balances, and financial scenarios.
- Do not add bank connections, payment processing, brokerage features, investment recommendations, or production financial infrastructure.
- Prefer the smallest implementation that supports the agreed demo. Record scope or architecture changes in `DECISIONS.md`.

## Financial correctness and AI safety

- Represent money as integer minor units (for example, cents) plus an ISO 4217 currency code. Never use floating-point arithmetic for money.
- Put all authoritative totals, ratios, limits, projections, and eligibility rules in deterministic, tested functions. An LLM may explain tool results but must not calculate or override them.
- Treat AI output as untrusted advisory content. Validate structured inputs and outputs at system boundaries.
- AI-suggested changes to budgets or savings goals must be shown as a proposal and require explicit user approval before application.
- Do not present individualized investment, legal, tax, or credit advice. Clearly label educational content and fictional demo data.

## Engineering practice

- Use strict TypeScript for the Next.js client and fully typed Python for the FastAPI service.
- Keep financial domain logic independent from UI and model-provider code, with unit tests for normal, boundary, and invalid cases.
- Keep secrets and model credentials server-side and out of source control. Provide documented example environment variables only.
- Preserve existing work. Inspect Git status before editing; do not delete, overwrite, migrate, or add dependencies without confirming scope and impact.
- Prefer accessible, mobile-first interfaces: semantic labels, keyboard and screen-reader support, text scaling, sufficient contrast, visible focus, and controls at least 44 by 44 points.
- Keep pull requests and commits focused. Update documentation and tests when behavior or decisions change.

## Definition of done

- The relevant tests, type checks, and lint checks pass.
- Financial results come from deterministic code using integer arithmetic.
- AI mutations are approval-gated and auditable.
- Empty, loading, error, and small-screen states are handled.
- New scope, assumptions, and unresolved trade-offs are recorded in `DECISIONS.md`.
