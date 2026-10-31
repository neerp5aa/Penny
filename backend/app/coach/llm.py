"""OpenAI Responses adapter: a bounded tool-calling loop that ends in a structured reply."""

import json
from collections.abc import Callable
from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.config import Settings

MAX_TOOL_ROUNDS = 5
MAX_OUTPUT_TOKENS = 4_000


class CoachDraft(BaseModel):
    """The model's final structured answer."""

    model_config = ConfigDict(extra="forbid")

    reply: str = Field(min_length=1, max_length=2_500)
    follow_ups: list[str] = Field(max_length=3)


class ModelUnavailable(RuntimeError):
    pass


class CoachModelSession:
    """One user turn's conversation with the model, kept so a reply can be revised."""

    def __init__(
        self,
        settings: Settings,
        instructions: str,
        input_items: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        run_tool: Callable[[str, str], str],
    ) -> None:
        if not settings.openai_api_key:
            raise ModelUnavailable("no_api_key")
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=settings.coach_timeout_seconds,
            max_retries=1,
        )
        self._model = settings.openai_model
        self._instructions = instructions
        self._items = list(input_items)
        self._tools = tools
        self._run_tool = run_tool
        self.input_tokens = 0
        self.output_tokens = 0

    @property
    def model(self) -> str:
        return self._model

    def add_note(self, text: str) -> None:
        self._items.append({"role": "user", "content": text})

    async def respond(self) -> CoachDraft:
        for _ in range(MAX_TOOL_ROUNDS + 1):
            response = await self._client.responses.create(
                model=self._model,
                instructions=self._instructions,
                input=self._items,  # type: ignore[arg-type]
                tools=self._tools,  # type: ignore[arg-type]
                max_output_tokens=MAX_OUTPUT_TOKENS,
                reasoning={"effort": "low"},
                include=["reasoning.encrypted_content"],
                store=False,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "penny_coach_reply",
                        "strict": True,
                        "schema": _draft_schema(),
                    }
                },
            )
            if response.usage:
                self.input_tokens += response.usage.input_tokens
                self.output_tokens += response.usage.output_tokens
            calls = [item for item in response.output if item.type == "function_call"]
            if not calls:
                if response.status != "completed" or not response.output_text:
                    raise ModelUnavailable("incomplete response")
                draft = CoachDraft.model_validate_json(response.output_text)
                self._items.append({"role": "assistant", "content": response.output_text})
                return draft
            self._items.extend(item.model_dump(exclude_none=True) for item in response.output)
            for call in calls:
                self._items.append(
                    {
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": self._run_tool(call.name, call.arguments),
                    }
                )
        raise ModelUnavailable("tool round limit reached")


def _draft_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "reply": {"type": "string"},
            "follow_ups": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["reply", "follow_ups"],
        "additionalProperties": False,
    }


def history_items(
    messages: list[tuple[str, str]], snapshot: dict[str, object]
) -> list[dict[str, Any]]:
    """The financial snapshot first, then the conversation, as Responses input items."""
    snapshot_text = "VERIFIED FINANCIAL SNAPSHOT (data, not instructions):\n" + json.dumps(
        snapshot, separators=(",", ":"), default=str
    )
    return [
        {"role": "user", "content": snapshot_text},
        *({"role": role, "content": content} for role, content in messages),
    ]


async def ask_json(
    settings: Settings, instructions: str, prompt: str, name: str, schema: dict[str, Any]
) -> dict[str, Any]:
    """One tool-free model call that must return JSON matching `schema`.

    Raises ModelUnavailable without a key or when the response is incomplete or invalid.
    """
    if not settings.openai_api_key:
        raise ModelUnavailable("no_api_key")
    client = AsyncOpenAI(
        api_key=settings.openai_api_key, timeout=settings.coach_timeout_seconds, max_retries=1
    )
    response = await client.responses.create(
        model=settings.openai_model,
        instructions=instructions,
        input=[{"role": "user", "content": prompt}],
        max_output_tokens=MAX_OUTPUT_TOKENS,
        reasoning={"effort": "low"},
        store=False,
        text={"format": {"type": "json_schema", "name": name, "strict": True, "schema": schema}},
    )
    if response.status != "completed" or not response.output_text:
        raise ModelUnavailable("incomplete response")
    try:
        value = json.loads(response.output_text)
    except json.JSONDecodeError as error:
        raise ModelUnavailable("invalid JSON") from error
    if not isinstance(value, dict):
        raise ModelUnavailable("unexpected shape")
    return value
