"""API shapes for the learning game. Answer keys never appear in anything sent before an answer."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.dashboard_models import DashboardResponse
from app.learning.content import Country, QuestionKind, Tier, Topic, Unit


class LearnModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LearnProfile(LearnModel):
    country: Country | None  # None until the learner finishes onboarding
    topics: list[Topic]
    start_tier: Tier


class LearnProfileWrite(LearnModel):
    country: Country
    topics: list[Topic] = Field(min_length=1, max_length=6)
    start_tier: Tier = "easy"


class LessonCard(LearnModel):
    id: str
    topic: Topic
    tier: Tier
    title: str
    summary: str
    locked: bool
    passed: bool
    stars: int = Field(ge=0, le=3)
    xp_earned: int = Field(ge=0)
    xp_max: int = Field(gt=0)
    hearts: int = Field(gt=0)
    question_count: int = Field(gt=0)


class TopicPath(LearnModel):
    id: Topic
    label: str
    blurb: str
    selected: bool
    lessons: list[LessonCard]


class Badge(LearnModel):
    id: str
    title: str
    description: str
    earned: bool


class LearnState(LearnModel):
    profile: LearnProfile
    xp_total: int = Field(ge=0)
    level: int = Field(ge=1)
    level_xp: int = Field(ge=0)
    level_size_xp: int = Field(gt=0)
    streak_days: int = Field(ge=0)
    completed_today: bool
    topics: list[TopicPath]
    badges: list[Badge]


class LessonTask(LearnModel):
    label: str
    view: Literal["spending", "goals", "invest", "ai", "settings"]
    prompt: str | None


class LessonDetail(LearnModel):
    card: LessonCard
    cards: list[str]
    task: LessonTask | None


class QuestionOption(LearnModel):
    id: str
    text: str


class QuestionView(LearnModel):
    id: str
    kind: QuestionKind
    prompt: str
    options: list[QuestionOption]  # shuffled per attempt; empty for number questions
    unit: Unit


class AttemptView(LearnModel):
    id: str
    lesson_id: str
    hearts_total: int
    hearts_left: int
    questions: list[QuestionView]


class AnswerWrite(LearnModel):
    question_id: str = Field(min_length=1, max_length=40)
    # Option ids for choice (one), multi (any number), and order (every id, in order);
    # a single typed value such as "1,040" or "14.4" for number questions.
    choices: list[str] = Field(default_factory=list, max_length=10)
    value: str | None = Field(default=None, max_length=20)


class AttemptResult(LearnModel):
    passed: bool
    stars: int = Field(ge=0, le=3)
    mistakes: int = Field(ge=0)
    xp_awarded: int = Field(ge=0)
    level_before: int
    level_after: int
    new_badges: list[Badge]


class AnswerResult(LearnModel):
    correct: bool
    explanation: str
    # The right option ids (in order for order questions), or the expected number as text.
    correct_choices: list[str]
    correct_value: str | None
    hearts_left: int
    status: Literal["active", "passed", "failed"]
    result: AttemptResult | None = None
    # A fresh snapshot once the attempt ends, so XP and streaks update everywhere.
    dashboard: DashboardResponse | None = None
