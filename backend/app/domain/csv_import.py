"""Parse transaction history exported from a bank or another budgeting app.

Accepted columns (case-insensitive, any order):
- date: YYYY-MM-DD (also YYYY/MM/DD). Day-first or month-first dates are rejected as ambiguous.
- description (or name, merchant, payee, memo)
- amount: signed, where negative is money out; or separate debit/withdrawal and
  credit/deposit columns
- optional category and type ("income"/"in" or "spending"/"out", overriding the sign)
"""

import csv
import io
import re
from dataclasses import dataclass
from datetime import date

MAX_ROWS = 2_000
_DATE_COLUMNS = ("date", "transaction date", "posted date")
_DESCRIPTION_COLUMNS = ("description", "name", "merchant", "payee", "memo", "details")
_AMOUNT = re.compile(r"^\(?(-)?\$?\s*(\d[\d,]*)(?:\.(\d{1,2}))?\)?$")


@dataclass(frozen=True, slots=True)
class ParsedRow:
    line: int
    occurred_on: date
    description: str
    amount_cents: int
    kind: str
    category: str | None


def _cents(text: str) -> int | None:
    """Signed cents from "12.50", "-$1,200", or "(45.00)" (parentheses mean negative)."""
    cleaned = text.strip().replace(" ", "")
    if not cleaned:
        return None
    match = _AMOUNT.match(cleaned)
    if not match:
        raise ValueError(f"'{text}' is not an amount")
    sign, whole, fraction = match.groups()
    cents = int(whole.replace(",", "")) * 100 + int((fraction or "0").ljust(2, "0"))
    negative = sign is not None or (cleaned.startswith("(") and cleaned.endswith(")"))
    return -cents if negative else cents


def _date(text: str) -> date:
    match = re.fullmatch(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", text.strip())
    if not match:
        raise ValueError(f"'{text}' is not a YYYY-MM-DD date")
    return date(*(int(part) for part in match.groups()))


def _pick(header: dict[str, int], names: tuple[str, ...]) -> int | None:
    return next((header[name] for name in names if name in header), None)


def parse_transactions_csv(text: str, today: date) -> tuple[list[ParsedRow], list[str]]:
    """Valid rows plus human-readable problems (line numbers match the file)."""
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))
    try:
        header_row = next(reader)
    except StopIteration:
        return [], ["The file is empty"]
    header = {name.strip().casefold(): index for index, name in enumerate(header_row)}
    date_col = _pick(header, _DATE_COLUMNS)
    desc_col = _pick(header, _DESCRIPTION_COLUMNS)
    amount_col = _pick(header, ("amount",))
    debit_col = _pick(header, ("debit", "withdrawal", "money out"))
    credit_col = _pick(header, ("credit", "deposit", "money in"))
    category_col = _pick(header, ("category",))
    type_col = _pick(header, ("type", "kind"))
    if date_col is None or desc_col is None or (amount_col is None and debit_col is None):
        return [], ["Needs date, description, and amount (or debit/credit) columns"]

    rows: list[ParsedRow] = []
    errors: list[str] = []
    for line, values in enumerate(reader, start=2):
        if not any(value.strip() for value in values):
            continue
        if len(rows) >= MAX_ROWS:
            errors.append(f"Stopped after {MAX_ROWS} rows")
            break

        def cell(index: int | None, row: list[str] = values) -> str:
            return row[index].strip() if index is not None and index < len(row) else ""

        try:
            occurred_on = _date(cell(date_col))
            if occurred_on > today:
                raise ValueError("date is in the future")
            if amount_col is not None:
                signed = _cents(cell(amount_col))
            else:
                debit, credit = _cents(cell(debit_col)) or 0, _cents(cell(credit_col)) or 0
                signed = abs(credit) - abs(debit)
            if not signed:
                raise ValueError("amount is missing or zero")
            description = cell(desc_col)[:160]
            if not description:
                raise ValueError("description is missing")
            kind = "income" if signed > 0 else "spending"
            type_text = cell(type_col).casefold()
            if type_text in ("income", "in", "credit", "money in"):
                kind = "income"
            elif type_text in ("spending", "expense", "out", "debit", "money out"):
                kind = "spending"
        except ValueError as error:
            errors.append(f"Line {line}: {error}")
            continue
        rows.append(
            ParsedRow(line, occurred_on, description, abs(signed), kind, cell(category_col) or None)
        )
    return rows, errors
