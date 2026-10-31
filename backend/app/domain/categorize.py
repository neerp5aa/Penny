"""Rule-based expense categorization and need-versus-want labelling.

Rules are ordered keyword matches on the merchant description, so every result is explainable
("matched 'transit'") and reproducible. Nothing here calls a model.
"""

import re
from dataclasses import dataclass
from typing import Literal

Necessity = Literal["need", "want"]

# (category id, keywords). Earlier rules win, so specific phrases come before broad ones.
# fmt: off
_CATEGORY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("cat-eating-out", ("uber eats", "doordash", "skip the dishes", "tim hortons", "starbucks")),
    ("cat-housing", ("rent", "housing", "residence", "landlord", "tenant insurance")),
    ("cat-phone", ("mobile", "phone", "wireless", "rogers", "bell", "telus", "fido", "koodo")),
    ("cat-transport", ("transit", "presto", "bus pass", "uber", "lyft", "parking", "gas",
                       "petro", "esso", "shell", "via rail")),
    ("cat-school", ("tuition", "course", "textbook", "campus store", "student fee")),
    ("cat-health", ("pharmacy", "shoppers drug", "clinic", "dental", "physio", "optometr", "gym",
                    "fitness", "goodlife")),
    ("cat-groceries", ("market", "grocer", "sobeys", "loblaws", "superstore", "no frills",
                       "metro", "costco", "walmart")),
    ("cat-eating-out", ("café", "cafe", "coffee", "restaurant", "pizza", "sushi", "burger",
                        "bakery", "takeout", "mcdonald", "subway")),
    ("cat-fun", ("movie", "cinema", "netflix", "spotify", "streaming", "disney", "concert",
                 "ticket", "festival", "game", "steam", "bar", "pub", "event", "outing")),
)
_INCOME_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("cat-scholarship", ("scholarship", "bursary", "grant", "osap", "student aid")),
    ("cat-gift", ("gift", "birthday", "e-transfer from")),
    ("cat-allowance", ("allowance",)),
    ("cat-benefits", ("pension", "benefit", "gst", "hst credit", "ccb", "ei ", "cerb")),
    ("cat-refund", ("refund", "rebate", "cashback", "cash back")),
    ("cat-income", ("pay", "payroll", "salary", "wage", "paycheque", "paycheck", "deposit")),
)

# Categories that are essential by default, plus description words that mark a want anyway.
NEED_CATEGORIES = frozenset(
    {"cat-housing", "cat-food", "cat-groceries", "cat-transport", "cat-phone", "cat-school",
     "cat-health"}
)
_WANT_WORDS = ("café", "cafe", "coffee", "restaurant", "uber eats", "doordash", "skip the dishes",
               "tim hortons", "starbucks", "pizza", "sushi", "burger", "bakery", "streaming",
               "netflix", "spotify", "disney")
# fmt: on


@dataclass(frozen=True, slots=True)
class Categorization:
    category_id: str | None
    matched: str | None


def _contains(text: str, keyword: str) -> bool:
    return re.search(rf"(?<![a-z]){re.escape(keyword)}(?![a-z])", text) is not None


def categorize(description: str, kind: str) -> Categorization:
    text = f" {description.casefold()} "
    rules = _INCOME_RULES if kind == "income" else _CATEGORY_RULES
    for category_id, keywords in rules:
        for keyword in keywords:
            if _contains(text, keyword):
                return Categorization(category_id, keyword)
    return Categorization(None, None)


def necessity(description: str, category_id: str | None) -> Necessity:
    """Groceries are a need; café runs and streaming are wants even inside need categories."""
    text = description.casefold()
    if any(_contains(text, word) for word in _WANT_WORDS):
        return "want"
    return "need" if category_id in NEED_CATEGORIES else "want"
