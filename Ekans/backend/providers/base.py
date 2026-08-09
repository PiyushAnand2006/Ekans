from __future__ import annotations

from dataclasses import dataclass


class ProviderError(RuntimeError):
    """A provider was unavailable or returned an invalid response."""


@dataclass
class Completion:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    # Provider-specific stop reason (for example: "length" or "max_tokens").
    # Keeping this optional lets the runtime gracefully support providers that
    # do not expose it while allowing long artifact generation to continue.
    finish_reason: str = ""


class ModelProvider:
    async def complete(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> Completion:
        raise NotImplementedError
