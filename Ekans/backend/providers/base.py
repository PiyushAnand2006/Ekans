from __future__ import annotations

from dataclasses import dataclass


class ProviderError(RuntimeError):
    """A provider was unavailable or returned an invalid response."""


@dataclass
class Completion:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0


class ModelProvider:
    async def complete(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> Completion:
        raise NotImplementedError
