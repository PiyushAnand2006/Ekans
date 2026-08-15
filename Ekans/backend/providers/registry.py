"""Provider registry. Keys are supplied per run and are never persisted."""

from __future__ import annotations

import asyncio
from typing import Any
import httpx

from backend.providers.base import Completion, ModelProvider, ProviderError


_REQUEST_SEMAPHORES: dict[tuple[str, str, str], asyncio.Semaphore] = {}


def _semaphore_for(provider: str, api_key: str, base_url: str = "") -> asyncio.Semaphore:
    normalized_provider = provider.lower().replace("_", "-")
    lock_key = (normalized_provider, api_key, base_url.rstrip("/"))
    sem = _REQUEST_SEMAPHORES.get(lock_key)
    if sem is None:
        sem = asyncio.Semaphore(5)
        _REQUEST_SEMAPHORES[lock_key] = sem
    return sem


async def _request_with_retry(make_request, provider_label: str) -> httpx.Response:
    delay = 2.0
    response: httpx.Response | None = None
    for attempt in range(4):
        response = await make_request()
        if response.status_code not in {429, 500, 502, 503, 504}:
            return response
        if attempt == 3:
            break
        retry_after = response.headers.get("Retry-After")
        try:
            wait_seconds = max(float(retry_after), 2.0) if retry_after else delay
        except ValueError:
            wait_seconds = delay
        await asyncio.sleep(wait_seconds)
        delay = min(delay * 2, 12.0)
    assert response is not None
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ProviderError(f"{provider_label}: rate limited or rejected the request ({response.status_code})") from exc
    return response


class OpenAICompatibleProvider(ModelProvider):
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1", extra_headers: dict[str, str] | None = None) -> None:
        self.api_key, self.base_url, self.extra_headers = api_key, base_url.rstrip("/"), extra_headers or {}

    async def complete(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> Completion:
        headers = {"Content-Type": "application/json", **self.extra_headers}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with _semaphore_for("openai-compatible", self.api_key, self.base_url):
                    response = await _request_with_retry(
                        lambda: client.post(
                            f"{self.base_url}/chat/completions",
                            headers=headers,
                            json={"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}], "temperature": temperature, "max_tokens": max_tokens},
                        ),
                        "OpenAI-compatible provider",
                    )
                response.raise_for_status()
                data = response.json()
            usage = data.get("usage", {})
            choice = data["choices"][0]
            return Completion(
                choice["message"].get("content") or "",
                usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0),
                str(choice.get("finish_reason") or ""),
            )
        except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"OpenAI-compatible provider: {exc}") from exc


class OpenRouterProvider(OpenAICompatibleProvider):
    def __init__(self, api_key: str) -> None:
        super().__init__(
            api_key,
            "https://openrouter.ai/api/v1",
            extra_headers={
                "HTTP-Referer": "http://localhost",
                "X-Title": "Ekans AI Workforce Builder",
            },
        )


class AnthropicProvider(ModelProvider):
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def complete(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> Completion:
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with _semaphore_for("anthropic", self.api_key):
                    response = await _request_with_retry(
                        lambda: client.post(
                            "https://api.anthropic.com/v1/messages",
                            headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                            json={"model": model, "system": system, "messages": [{"role": "user", "content": prompt}], "temperature": temperature, "max_tokens": max_tokens},
                        ),
                        "Anthropic provider",
                    )
                response.raise_for_status()
                data = response.json()
            usage = data.get("usage", {})
            return Completion(
                data["content"][0]["text"], usage.get("input_tokens", 0), usage.get("output_tokens", 0),
                str(data.get("stop_reason") or ""),
            )
        except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"Anthropic provider: {exc}") from exc


class GeminiProvider(ModelProvider):
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def complete(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> Completion:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with _semaphore_for("google", self.api_key, "https://generativelanguage.googleapis.com"):
                    response = await _request_with_retry(
                        lambda: client.post(
                            url,
                            json={"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens}},
                        ),
                        "Google provider",
                    )
                response.raise_for_status()
                data = response.json()
            usage = data.get("usageMetadata", {})
            candidate = data["candidates"][0]
            return Completion(
                candidate["content"]["parts"][0]["text"],
                usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0),
                str(candidate.get("finishReason") or ""),
            )
        except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"Google provider: {exc}") from exc


def provider_for(name: str, keys: dict[str, Any], api_key: str = "") -> ModelProvider:
    normalized = name.lower().replace("_", "-")
    if normalized == "openai": return OpenAICompatibleProvider(api_key or str(keys.get("openai", "")))
    if normalized == "anthropic": return AnthropicProvider(api_key or str(keys.get("anthropic", "")))
    if normalized in {"google", "gemini"}: return GeminiProvider(api_key or str(keys.get("google", "")))
    if normalized == "openrouter": return OpenRouterProvider(api_key or str(keys.get("openrouter", "")))
    if normalized == "ollama":
        base_url = str(keys.get("ollama_url") or "http://localhost:11434").rstrip("/")
        return OpenAICompatibleProvider("", base_url if base_url.endswith("/v1") else f"{base_url}/v1")
    if normalized in {"openai-compatible", "openai-compatible-api"}: return OpenAICompatibleProvider(api_key or str(keys.get("openai_compatible_key", "")), str(keys.get("openai_compatible_url", "")))
    raise ProviderError(f"Unsupported provider: {name}")
