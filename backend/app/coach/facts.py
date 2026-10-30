"""Verified figures the coach may quote, and the check that replies quote only those.

Deterministic code registers every amount and percentage it shows the model. After the
model replies, every dollar amount and percentage in the text must match a registered
figure (or one the user typed). This lets the model talk about real numbers while keeping
all arithmetic in tested Python.
"""

import re
from dataclasses import dataclass, field

from app.coach.models import Fact

_MONEY = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d)")
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s?%")


def format_cad(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    dollars, remainder = divmod(abs(cents), 100)
    return f"{sign}${dollars:,}.{remainder:02d}"


def format_percent(basis_points: int) -> str:
    whole, remainder = divmod(basis_points, 100)
    return f"{whole}%" if remainder == 0 else f"{whole}.{remainder:02d}".rstrip("0") + "%"


def parse_cad(text: str) -> int:
    """Parse a user-supplied CAD amount such as "1,299.99" or "$45" into cents."""
    cleaned = text.strip().replace("$", "").replace(",", "").replace("CAD", "").strip()
    match = re.fullmatch(r"(\d+)(?:\.(\d{1,2}))?", cleaned)
    if not match:
        raise ValueError(f"'{text}' is not a CAD amount")
    dollars, fraction = match.groups()
    return int(dollars) * 100 + int((fraction or "0").ljust(2, "0"))


def _quoted_cents(match: re.Match[str]) -> tuple[int, bool]:
    dollars = int(match.group(1).replace(",", ""))
    fraction = match.group(2)
    return dollars * 100 + int((fraction or "0").ljust(2, "0")), fraction is not None


def _percent_basis_points(text: str) -> int:
    whole, _, fraction = text.partition(".")
    return int(whole) * 100 + int((fraction or "0")[:2].ljust(2, "0"))


@dataclass
class FactBook:
    """Collects verified figures in the order they were produced."""

    facts: list[Fact] = field(default_factory=list)
    _user_cents: set[int] = field(default_factory=set)

    def money(self, label: str, cents: int, source: str) -> str:
        display = format_cad(cents)
        self._add(Fact(label=label, display=display, cents=cents, source=source))
        return display

    def percent(self, label: str, basis_points: int, source: str) -> str:
        display = format_percent(basis_points)
        self._add(Fact(label=label, display=display, basis_points=basis_points, source=source))
        return display

    def allow_user_amounts(self, text: str) -> None:
        """Amounts the user typed may be repeated back to them."""
        self._user_cents.update(_quoted_cents(match)[0] for match in _MONEY.finditer(text))

    def _add(self, fact: Fact) -> None:
        if not any(
            item.label == fact.label and item.display == fact.display for item in self.facts
        ):
            self.facts.append(fact)

    def unverified_figures(self, text: str) -> list[str]:
        """Dollar amounts and percentages in `text` that no verified figure supports."""
        known_cents = {abs(item.cents) for item in self.facts if item.cents is not None}
        known_cents |= self._user_cents
        known_bp = {item.basis_points for item in self.facts if item.basis_points is not None}
        problems = []
        for match in _MONEY.finditer(text):
            cents, has_fraction = _quoted_cents(match)
            if cents in known_cents:
                continue
            # "$825" is an acceptable way to say $825.00 or a rounded $824.60.
            if not has_fraction and any(
                cents // 100 in (known // 100, (known + 50) // 100) for known in known_cents
            ):
                continue
            problems.append(match.group(0))
        for match in _PERCENT.finditer(text):
            quoted = _percent_basis_points(match.group(1))
            # Accept the exact value or the value rounded to a whole or one-decimal percent.
            if not any(
                quoted
                in (known, known // 100 * 100, (known + 50) // 100 * 100, (known + 5) // 10 * 10)
                for known in known_bp
            ):
                problems.append(match.group(0))
        return problems

    def cited_in(self, text: str) -> list[Fact]:
        """Facts whose display value appears in `text`, for the "numbers behind this" panel."""
        cited = []
        seen: set[str] = set()
        for fact in self.facts:
            plain = fact.display.lstrip("-")
            whole = plain.split(".")[0] if plain.endswith(".00") else None
            if (
                plain in text or (whole and re.search(re.escape(whole) + r"(?![\d.,])", text))
            ) and (fact.display not in seen):
                cited.append(fact)
                seen.add(fact.display)
        return cited
