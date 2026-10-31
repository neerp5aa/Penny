"""Per-user reminder settings, delivery, de-duplication, and a short log (in memory)."""

import re
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.config import Settings
from app.dashboard_store import DashboardStore
from app.reminders import mailer
from app.reminders.compose import KINDS, Reminder, ReminderKind, due_reminders, render

MAX_EMAILS_PER_HOUR = 6
LOG_SIZE = 20
_EMAIL = re.compile(r"^[^@\s<>,;\"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$")


class ReminderModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReminderKinds(ReminderModel):
    bills: bool = True
    budgets: bool = True
    streaks: bool = True
    lessons: bool = False

    def enabled(self) -> set[ReminderKind]:
        return {kind for kind in KINDS if getattr(self, kind)}


class ReminderSettingsWrite(ReminderModel):
    enabled: bool
    email: str | None = Field(default=None, max_length=254)
    kinds: ReminderKinds

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not _EMAIL.match(value):
            raise ValueError("Enter a valid email address")
        return value


class ReminderItem(ReminderModel):
    kind: ReminderKind
    title: str
    detail: str
    already_sent: bool


class SentEmail(ReminderModel):
    id: str
    at: datetime
    to: str
    subject: str
    text: str
    status: Literal["sent", "preview", "failed"]
    trigger: Literal["scheduled", "manual", "test"]
    error: str | None = None


class ReminderState(ReminderModel):
    enabled: bool
    email: str | None
    kinds: ReminderKinds
    # "smtp": emails are really sent. "preview": no server configured, so they're only logged.
    delivery: Literal["smtp", "preview"]
    sender: str | None
    check_minutes: int
    due: list[ReminderItem]
    log: list[SentEmail]
    emails_left_this_hour: int


@dataclass
class _UserReminders:
    enabled: bool = False
    email: str | None = None
    kinds: ReminderKinds = field(default_factory=ReminderKinds)
    sent_keys: set[str] = field(default_factory=set)
    sends: deque[datetime] = field(default_factory=deque)
    log: deque[SentEmail] = field(default_factory=lambda: deque(maxlen=LOG_SIZE))


class ReminderError(ValueError):
    """A request that can't be honoured (no address, rate limit). Safe to show the user."""


class ReminderService:
    def __init__(self, store_for: Callable[[str], DashboardStore]) -> None:
        # Looks up a user's own data (the demo set, or their fresh account).
        self._store_for = store_for
        self._users: dict[str, _UserReminders] = {}
        self._lock = Lock()

    def _user(self, user_id: str) -> _UserReminders:
        return self._users.setdefault(user_id, _UserReminders())

    def _due(self, user_id: str) -> list[Reminder]:
        state = self._user(user_id)
        store = self._store_for(user_id)
        return due_reminders(
            store.dashboard_for_user(user_id), state.kinds.enabled(), store.today()
        )

    def _left(self, state: _UserReminders, now: datetime) -> int:
        while state.sends and state.sends[0] <= now - timedelta(hours=1):
            state.sends.popleft()
        return max(0, MAX_EMAILS_PER_HOUR - len(state.sends))

    def state(self, settings: Settings, user_id: str, default_email: str | None) -> ReminderState:
        self._store_for(user_id).require_owner(user_id)
        with self._lock:
            user = self._user(user_id)
            due = self._due(user_id)
            return ReminderState(
                enabled=user.enabled,
                email=user.email or default_email,
                kinds=user.kinds,
                delivery="smtp" if mailer.configured(settings) else "preview",
                sender=mailer.sender(settings) if mailer.configured(settings) else None,
                check_minutes=settings.reminder_check_minutes,
                due=[
                    ReminderItem(
                        kind=item.kind,
                        title=item.title,
                        detail=item.detail,
                        already_sent=item.key in user.sent_keys,
                    )
                    for item in due
                ],
                log=list(reversed(user.log)),
                emails_left_this_hour=self._left(user, datetime.now(UTC)),
            )

    def update(
        self,
        settings: Settings,
        user_id: str,
        request: ReminderSettingsWrite,
        default_email: str | None,
    ) -> ReminderState:
        self._store_for(user_id).require_owner(user_id)
        email = request.email or default_email
        if request.enabled and not email:
            raise ReminderError("Add an email address to turn reminders on.")
        with self._lock:
            user = self._user(user_id)
            if email != user.email:
                user.sent_keys.clear()  # a new address hasn't seen anything yet
            user.enabled, user.email, user.kinds = request.enabled, email, request.kinds
        return self.state(settings, user_id, default_email)

    async def _deliver(
        self,
        settings: Settings,
        user_id: str,
        items: list[Reminder],
        trigger: Literal["scheduled", "manual", "test"],
    ) -> SentEmail:
        with self._lock:
            user = self._user(user_id)
            if not user.email:
                raise ReminderError("Add an email address first.")
            now = datetime.now(UTC)
            if self._left(user, now) == 0:
                raise ReminderError(
                    f"Penny sends at most {MAX_EMAILS_PER_HOUR} emails an hour. Try again later."
                )
            user.sends.append(now)
            to = user.email
        store = self._store_for(user_id)
        subject, text, body = render(
            items,
            store.profile_name(user_id),
            str(settings.frontend_origin).rstrip("/"),
            fictional=store.has_fictional_data(user_id),
        )
        if trigger == "test":
            subject = "Penny: test email"
            text = "This is a test. Email reminders from Penny are working.\n\n" + text
        status: Literal["sent", "preview", "failed"] = "preview"
        error = None
        if mailer.configured(settings):
            try:
                await mailer.send(settings, mailer.build_message(settings, to, subject, text, body))
                status = "sent"
            except mailer.MailError as failure:
                status, error = "failed", str(failure)
        record = SentEmail(
            id=f"{now.timestamp():.0f}-{len(items)}",
            at=now,
            to=to,
            subject=subject,
            text=text,
            status=status,
            trigger=trigger,
            error=error,
        )
        with self._lock:
            user.log.append(record)
            if status != "failed":
                user.sent_keys.update(item.key for item in items)
        return record

    async def send_test(self, settings: Settings, user_id: str) -> SentEmail:
        self._store_for(user_id).require_owner(user_id)
        return await self._deliver(settings, user_id, self._due(user_id), "test")

    async def send_now(self, settings: Settings, user_id: str) -> SentEmail:
        """Everything due right now, including items already emailed."""
        self._store_for(user_id).require_owner(user_id)
        return await self._deliver(settings, user_id, self._due(user_id), "manual")

    async def run_scheduled(self, settings: Settings) -> list[SentEmail]:
        """One background pass: email each opted-in user only the reminders they haven't had."""
        sent = []
        for user_id, user in list(self._users.items()):
            if not (user.enabled and user.email):
                continue
            with self._lock:
                fresh = [item for item in self._due(user_id) if item.key not in user.sent_keys]
            if not fresh:
                continue
            try:
                sent.append(await self._deliver(settings, user_id, fresh, "scheduled"))
            except ReminderError:
                continue  # rate limited; the next pass picks these up
        return sent
