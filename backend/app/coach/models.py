from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.dashboard_models import DashboardResponse

MAX_HISTORY_MESSAGES = 12


class CoachModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Fact(CoachModel):
    """One verified figure: either an amount in cents or a ratio in basis points."""

    label: str
    display: str
    cents: int | None = None
    basis_points: int | None = None
    source: str


class ChatMessage(CoachModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4_000)


class ChatRequest(CoachModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_HISTORY_MESSAGES)

    @model_validator(mode="after")
    def _ends_with_user_question(self) -> "ChatRequest":
        last = self.messages[-1]
        if last.role != "user" or len(last.content) > 600:
            raise ValueError("The last message must be a user question of at most 600 characters")
        return self


class Proposal(CoachModel):
    """A change Penny suggested. Nothing is applied until the user approves it."""

    id: str
    version: str
    kind: Literal["goal_contribution", "budget_limit"]
    title: str
    reason: str
    target_id: str
    target_name: str
    current_cents: int
    proposed_cents: int


class ToolUse(CoachModel):
    name: str
    label: str


class Usage(CoachModel):
    input_tokens: int = 0
    output_tokens: int = 0
    elapsed_ms: int = 0


class ChatResponse(CoachModel):
    reply: str
    follow_ups: list[str]
    facts: list[Fact]
    tools_used: list[ToolUse]
    proposal: Proposal | None
    source: Literal["ai", "built_in"]
    fallback_reason: Literal["no_api_key", "model_error", "timeout", "unverified_numbers"] | None
    model: str | None
    usage: Usage


class Signal(CoachModel):
    """A deterministic observation about the user's month, like a daily check-in item."""

    id: str
    tone: Literal["positive", "watch", "alert"]
    title: str
    detail: str
    prompt: str


class BriefResponse(CoachModel):
    greeting: str
    month_label: str
    signals: list[Signal]
    suggested_questions: list[str]


class ApprovalRequest(CoachModel):
    approved: Literal[True]
    version: str


class ApprovalResponse(CoachModel):
    message: str
    dashboard: DashboardResponse
