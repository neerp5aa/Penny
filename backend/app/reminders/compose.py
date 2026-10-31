"""Which reminders are due, and the email that carries them. Pure functions over a snapshot."""

import html
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from app.dashboard_models import DashboardResponse
from app.domain.finance import format_cad

ReminderKind = Literal["bills", "budgets", "streaks", "lessons"]
KINDS: tuple[ReminderKind, ...] = ("bills", "budgets", "streaks", "lessons")

BILL_LEAD_DAYS = 3
BUDGET_WARNING_BASIS_POINTS = 8_500
BUDGET_OVER_BASIS_POINTS = 10_000


@dataclass(frozen=True)
class Reminder:
    key: str  # stable per occurrence, so the same reminder is never emailed twice
    kind: ReminderKind
    title: str
    detail: str


def _when(due: date, today: date) -> str:
    days = (due - today).days
    if days <= 0:
        return "today"
    if days == 1:
        return "tomorrow"
    return f"in {days} days ({due:%a, %b} {due.day})"


def due_reminders(
    dashboard: DashboardResponse, kinds: set[ReminderKind], today: date
) -> list[Reminder]:
    """Reminders that apply today, in a fixed order. `dashboard` must be the current month."""
    items: list[Reminder] = []
    if "bills" in kinds:
        for bill in sorted(dashboard.bills, key=lambda b: (b.next_due, b.name)):
            if today <= bill.next_due <= today + timedelta(days=BILL_LEAD_DAYS):
                how = (
                    "Penny will record it automatically."
                    if bill.auto_record
                    else "Mark it paid in Penny once you’ve paid it."
                )
                items.append(
                    Reminder(
                        key=f"bill:{bill.id}:{bill.next_due.isoformat()}",
                        kind="bills",
                        title=f"{bill.name}: {format_cad(bill.amount_cents)} due "
                        f"{_when(bill.next_due, today)}",
                        detail=how,
                    )
                )
    if "budgets" in kinds:
        month = dashboard.active_month.isoformat()
        for budget in sorted(dashboard.budgets, key=lambda b: -b.usage_basis_points):
            if budget.carried_over or budget.usage_basis_points < BUDGET_WARNING_BASIS_POINTS:
                continue
            over = budget.usage_basis_points >= BUDGET_OVER_BASIS_POINTS
            percent = budget.usage_basis_points // 100
            items.append(
                Reminder(
                    key=f"budget:{budget.category_id}:{month}:{'over' if over else 'near'}",
                    kind="budgets",
                    title=f"{budget.category_name} budget is over ({percent}% used)"
                    if over
                    else f"{budget.category_name} budget is at {percent}%",
                    detail=(
                        f"{format_cad(budget.spent_cents)} spent of "
                        f"{format_cad(budget.limit_cents)}: "
                        + (
                            f"{format_cad(-budget.remaining_cents)} over."
                            if budget.remaining_cents < 0
                            else f"{format_cad(budget.remaining_cents)} left this month."
                        )
                    ),
                )
            )
    calendar = dashboard.money_calendar
    streak = calendar.streaks.current_green
    if "streaks" in kinds and calendar.today == today and streak > 0:
        day = next((d for d in calendar.days if d.day == today), None)
        if day and day.zone in ("yellow", "red"):
            items.append(
                Reminder(
                    key=f"streak:{today.isoformat()}",
                    kind="streaks",
                    title=f"Your {streak}-day green streak is at risk",
                    detail=f"You’ve spent {format_cad(day.flexible_spent_cents)} on flexible "
                    f"spending today; your daily allowance is "
                    f"{format_cad(calendar.daily_allowance_cents)}. A no-spend evening helps.",
                )
            )
    learning = dashboard.learning
    if "lessons" in kinds and not learning.completed_today:
        upcoming = learning.next_lesson
        items.append(
            Reminder(
                key=f"lesson:{today.isoformat()}",
                kind="lessons",
                title=(
                    f"Keep your {learning.streak_days}-day learning streak"
                    if learning.streak_days
                    else "Today’s lesson is waiting"
                ),
                detail=f"Next up: {upcoming.title}." if upcoming else "Pick any lesson in Learn.",
            )
        )
    return items


def subject_for(items: list[Reminder]) -> str:
    counts = {kind: sum(1 for item in items if item.kind == kind) for kind in KINDS}
    parts = []
    if counts["bills"]:
        parts.append(f"{counts['bills']} bill{'s' if counts['bills'] > 1 else ''} due soon")
    if counts["budgets"]:
        parts.append(f"{counts['budgets']} budget alert{'s' if counts['budgets'] > 1 else ''}")
    if counts["streaks"]:
        parts.append("streak at risk")
    if counts["lessons"]:
        parts.append("today’s lesson")
    return "Penny: " + (", ".join(parts) if parts else "you’re all caught up")


_HEADINGS = {
    "bills": "Bills coming up",
    "budgets": "Budgets",
    "streaks": "Money Score",
    "lessons": "Learning",
}
FOOTER = "Change these emails in Settings."
FICTIONAL_NOTE = "All amounts are from Penny’s fictional demo data. "


def render(
    items: list[Reminder], name: str, app_url: str, fictional: bool = True
) -> tuple[str, str, str]:
    """(subject, plain text, HTML). Every user-entered string is escaped in the HTML."""
    subject = subject_for(items)
    footer = (FICTIONAL_NOTE if fictional else "") + FOOTER
    lines = [f"Hi {name},", ""]
    blocks = []
    for kind in KINDS:
        group = [item for item in items if item.kind == kind]
        if not group:
            continue
        lines.append(_HEADINGS[kind])
        lines.extend(f"- {item.title}. {item.detail}" for item in group)
        lines.append("")
        rows = "".join(
            f'<li style="margin:0 0 10px"><strong>{html.escape(item.title)}</strong><br>'
            f'<span style="color:#55626f">{html.escape(item.detail)}</span></li>'
            for item in group
        )
        blocks.append(
            f'<h2 style="font-size:15px;margin:20px 0 8px;color:#173f5f">'
            f"{_HEADINGS[kind]}</h2>"
            f'<ul style="padding-left:18px;margin:0">{rows}</ul>'
        )
    if not items:
        lines.append("Nothing needs your attention right now.")
        blocks.append("<p>Nothing needs your attention right now.</p>")
    lines += [f"Open Penny: {app_url}", "", footer]
    text = "\n".join(lines)
    body = (
        '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;'
        'margin:0 auto;padding:24px;color:#14212b">'
        f'<p style="font-size:13px;color:#15977f;font-weight:600;margin:0">Penny reminders</p>'
        f'<p style="font-size:16px">Hi {html.escape(name)},</p>{"".join(blocks)}'
        f'<p style="margin:24px 0"><a href="{html.escape(app_url, quote=True)}" '
        'style="background:#173f5f;color:#fff;padding:10px 16px;border-radius:10px;'
        'text-decoration:none;font-weight:600">Open Penny</a></p>'
        f'<p style="font-size:12px;color:#7a8794">{footer}</p></div>'
    )
    return subject, text, body
