"""Deterministic rules for the learning game: grading, hearts, stars, XP, unlocks, and badges.

Grading happens here, on the server, so answer keys never reach the browser before an answer
is locked in, and XP can't be claimed without passing.
"""

import random
import re
import secrets
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal

from app.learning.content import (
    LESSONS_BY_ID,
    TIERS,
    TOPICS,
    Country,
    LessonContent,
    Question,
    Tier,
    Topic,
    lessons_for,
)
from app.learning.models import (
    AnswerWrite,
    AttemptView,
    Badge,
    LearnProfile,
    LearnState,
    LessonCard,
    LessonDetail,
    LessonTask,
    QuestionOption,
    QuestionView,
    TopicPath,
)

LEVEL_SIZE_XP = 150
HEARTS: dict[Tier, int] = {"easy": 3, "medium": 3, "hard": 2}
BASE_XP: dict[Tier, int] = {"easy": 30, "medium": 50, "hard": 80}
MAX_STARS = 3
MAX_OPEN_ATTEMPTS = 50
_NUMBER = re.compile(r"^-?\d+(\.\d+)?$")


class AnswerError(ValueError):
    """The answer can't be graded (wrong shape, unknown option). It costs no heart."""


# ------------------------------------------------------------------ pure rules


def stars_for(mistakes: int) -> int:
    """3 stars for a flawless run, 2 for one mistake, 1 for anything else that passes."""
    return max(1, MAX_STARS - mistakes)


def xp_for(tier: Tier, stars: int) -> int:
    return BASE_XP[tier] * stars // MAX_STARS


def parse_number(text: str) -> Decimal:
    """Reads "1,040", "$1040.00", "14.4%" or "9 years" as a number; rejects anything else."""
    cleaned = re.sub(r"[\s,$%]|years?$", "", text.strip().casefold())
    if not _NUMBER.match(cleaned):
        raise AnswerError("Enter a number, like 480 or 14.4")
    try:
        return Decimal(cleaned)
    except InvalidOperation as error:  # pragma: no cover - the regex already guards this
        raise AnswerError("Enter a number") from error


def grade(question: Question, answer: AnswerWrite) -> bool:
    """True when the answer is right. Raises AnswerError when it can't be graded."""
    if question.kind == "number":
        if answer.value is None or question.number is None:
            raise AnswerError("Enter a number")
        given = parse_number(answer.value)
        return abs(given - Decimal(question.number)) <= Decimal(question.tolerance)
    valid = {option.id for option in question.options}
    if not answer.choices or any(choice not in valid for choice in answer.choices):
        raise AnswerError("Pick from the options shown")
    if question.kind == "choice":
        if len(answer.choices) != 1:
            raise AnswerError("Pick one option")
        return answer.choices[0] == question.answer[0]
    if question.kind == "multi":
        return set(answer.choices) == set(question.answer)
    if sorted(answer.choices) != sorted(valid):
        raise AnswerError("Place every item in order")
    return tuple(answer.choices) == question.answer


def unlocked(tier: Tier, start_tier: Tier, passed_tiers: set[Tier]) -> bool:
    """A tier is open from the chosen starting level, or once the tier before it is passed."""
    index = TIERS.index(tier)
    return index <= TIERS.index(start_tier) or TIERS[index - 1] in passed_tiers


def longest_streak(days: set[date]) -> int:
    best = 0
    for day in days:
        if day - timedelta(days=1) in days:
            continue
        length = 1
        while day + timedelta(days=length) in days:
            length += 1
        best = max(best, length)
    return best


def current_streak(days: set[date], today: date) -> int:
    """Consecutive days with a passed lesson, ending today or yesterday."""
    cursor = today if today in days else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


# ------------------------------------------------------------------ learner state


@dataclass
class LessonResult:
    stars: int
    xp_earned: int
    first_passed: date


@dataclass
class Attempt:
    id: str
    lesson_id: str
    hearts_left: int
    view: AttemptView
    answered: set[str] = field(default_factory=set)
    mistakes: int = 0
    status: Literal["active", "passed", "failed"] = "active"


BADGES: tuple[tuple[str, str, str], ...] = (
    ("first-steps", "First steps", "Pass your first lesson."),
    ("flawless", "Flawless", "Earn 3 stars without losing a heart."),
    ("brain-power", "Brain power", "Pass a Hard lesson."),
    ("topic-master", "Topic master", "Pass Easy, Medium, and Hard in one topic."),
    ("on-a-roll", "On a roll", "Learn 3 days in a row."),
    ("week-warrior", "Week warrior", "Learn 7 days in a row."),
    ("border-crosser", "Border crosser", "Pass country lessons for both Canada and the US."),
)


class Learner:
    """One learner's profile, results, and open attempts. The store guards it with its lock."""

    def __init__(self) -> None:
        self.profile = LearnProfile(
            country=None, topics=[t for t, _, _ in TOPICS], start_tier="easy"
        )
        self.results: dict[str, LessonResult] = {}
        self.activity_days: set[date] = set()
        self.attempts: dict[str, Attempt] = {}

    # The lessons on offer before onboarding: Canada, matching the rest of the demo.
    @property
    def country(self) -> Country:
        return self.profile.country or "CA"

    def set_profile(self, profile: LearnProfile) -> None:
        self.profile = profile

    # -------------------------------------------------------------- reading state

    def _passed_tiers(self, country: Country, topic: Topic) -> set[Tier]:
        return {
            lesson.tier
            for lesson in lessons_for(country)
            if lesson.topic == topic and lesson.id in self.results
        }

    def is_unlocked(self, lesson: LessonContent) -> bool:
        if lesson.country not in (None, self.country):
            return False
        passed = self._passed_tiers(self.country, lesson.topic)
        return unlocked(lesson.tier, self.profile.start_tier, passed)

    def card(self, lesson: LessonContent) -> LessonCard:
        result = self.results.get(lesson.id)
        return LessonCard(
            id=lesson.id,
            topic=lesson.topic,
            tier=lesson.tier,
            title=lesson.title,
            summary=lesson.summary,
            locked=not self.is_unlocked(lesson),
            passed=result is not None,
            stars=result.stars if result else 0,
            xp_earned=result.xp_earned if result else 0,
            xp_max=xp_for(lesson.tier, MAX_STARS),
            hearts=HEARTS[lesson.tier],
            question_count=len(lesson.questions),
        )

    def lesson_xp(self) -> int:
        return sum(result.xp_earned for result in self.results.values())

    def next_lesson(self) -> LessonContent | None:
        """The first open, unpassed lesson in the learner's topics, easiest tier first."""
        chosen = set(self.profile.topics)
        options = [
            lesson
            for lesson in lessons_for(self.country)
            if lesson.topic in chosen and lesson.id not in self.results and self.is_unlocked(lesson)
        ]
        return min(options, key=lambda lesson: TIERS.index(lesson.tier), default=None)

    def badges(self, today: date) -> list[Badge]:
        passed = [LESSONS_BY_ID[lesson_id] for lesson_id in self.results]
        topics_mastered = any(
            {
                lesson.tier
                for lesson in passed
                if lesson.topic == topic and lesson.country in (None, country)
            }
            == set(TIERS)
            for topic, _, _ in TOPICS
            for country in ("CA", "US")
        )
        best = longest_streak(self.activity_days)
        earned = {
            "first-steps": bool(passed),
            "flawless": any(result.stars == MAX_STARS for result in self.results.values()),
            "brain-power": any(lesson.tier == "hard" for lesson in passed),
            "topic-master": topics_mastered,
            "on-a-roll": best >= 3,
            "week-warrior": best >= 7,
            "border-crosser": {lesson.country for lesson in passed} >= {"CA", "US"},
        }
        return [Badge(id=i, title=t, description=d, earned=earned[i]) for i, t, d in BADGES]

    def state(self, mission_xp: int, today: date) -> LearnState:
        xp = mission_xp + self.lesson_xp()
        chosen = set(self.profile.topics)
        lessons = lessons_for(self.country)
        return LearnState(
            profile=self.profile,
            xp_total=xp,
            level=1 + xp // LEVEL_SIZE_XP,
            level_xp=xp % LEVEL_SIZE_XP,
            level_size_xp=LEVEL_SIZE_XP,
            streak_days=current_streak(self.activity_days, today),
            completed_today=today in self.activity_days,
            topics=[
                TopicPath(
                    id=topic,
                    label=label,
                    blurb=blurb,
                    selected=topic in chosen,
                    lessons=[self.card(lesson) for lesson in lessons if lesson.topic == topic],
                )
                for topic, label, blurb in TOPICS
            ],
            badges=self.badges(today),
        )

    def detail(self, lesson: LessonContent) -> LessonDetail:
        return LessonDetail(
            card=self.card(lesson),
            cards=list(lesson.cards),
            task=LessonTask(
                label=lesson.task.label, view=lesson.task.view, prompt=lesson.task.prompt
            )
            if lesson.task
            else None,
        )

    # -------------------------------------------------------------- playing

    def start(self, lesson: LessonContent) -> AttemptView:
        """A fresh attempt: full hearts, options shuffled so position gives nothing away."""
        shuffle = random.Random(secrets.randbits(64))
        questions = []
        for question in lesson.questions:
            options = [QuestionOption(id=o.id, text=o.text) for o in question.options]
            shuffle.shuffle(options)
            if question.kind == "order" and [o.id for o in options] == list(question.answer):
                options.reverse()  # never hand out an ordering question already solved
            questions.append(
                QuestionView(
                    id=question.id,
                    kind=question.kind,
                    prompt=question.prompt,
                    options=options,
                    unit=question.unit,
                )
            )
        attempt_id = secrets.token_urlsafe(12)
        view = AttemptView(
            id=attempt_id,
            lesson_id=lesson.id,
            hearts_total=HEARTS[lesson.tier],
            hearts_left=HEARTS[lesson.tier],
            questions=questions,
        )
        if len(self.attempts) >= MAX_OPEN_ATTEMPTS:
            self.attempts.pop(next(iter(self.attempts)))
        self.attempts[attempt_id] = Attempt(attempt_id, lesson.id, HEARTS[lesson.tier], view)
        return view

    def answer(self, attempt: Attempt, answer: AnswerWrite) -> tuple[Question, bool]:
        """Grades one answer, once. Wrong answers cost a heart; running out ends the attempt."""
        if attempt.status != "active":
            raise AnswerError("This attempt is over. Start the lesson again.")
        lesson = LESSONS_BY_ID[attempt.lesson_id]
        question = next((q for q in lesson.questions if q.id == answer.question_id), None)
        if question is None:
            raise AnswerError("Unknown question")
        if question.id in attempt.answered:
            raise AnswerError("You already answered this question")
        correct = grade(question, answer)
        attempt.answered.add(question.id)
        if not correct:
            attempt.mistakes += 1
            attempt.hearts_left -= 1
        if attempt.hearts_left <= 0:
            attempt.status = "failed"
        elif len(attempt.answered) == len(lesson.questions):
            attempt.status = "passed"
        return question, correct

    def record_pass(self, attempt: Attempt, today: date) -> tuple[int, int]:
        """Saves the best result. Returns (stars, XP newly awarded); replays only add the gain."""
        lesson = LESSONS_BY_ID[attempt.lesson_id]
        stars = stars_for(attempt.mistakes)
        earned = xp_for(lesson.tier, stars)
        previous = self.results.get(lesson.id)
        awarded = max(0, earned - (previous.xp_earned if previous else 0))
        self.results[lesson.id] = LessonResult(
            stars=max(stars, previous.stars if previous else 0),
            xp_earned=max(earned, previous.xp_earned if previous else 0),
            first_passed=previous.first_passed if previous else today,
        )
        self.activity_days.add(today)
        return stars, awarded
