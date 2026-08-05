"""Provider registry. Keys are supplied per run and are never persisted."""

from __future__ import annotations

from typing import Any
import httpx

from backend.providers.base import Completion, ModelProvider, ProviderError


class OpenAICompatibleProvider(ModelProvider):
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1") -> None:
        self.api_key, self.base_url = api_key, base_url.rstrip("/")

    async def complete(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> Completion:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(f"{self.base_url}/chat/completions", headers=headers, json={"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}], "temperature": temperature, "max_tokens": max_tokens})
                response.raise_for_status()
                data = response.json()
            usage = data.get("usage", {})
            return Completion(data["choices"][0]["message"]["content"], usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
        except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"OpenAI-compatible provider: {exc}") from exc


class AnthropicProvider(ModelProvider):
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def complete(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> Completion:
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post("https://api.anthropic.com/v1/messages", headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, json={"model": model, "system": system, "messages": [{"role": "user", "content": prompt}], "temperature": temperature, "max_tokens": max_tokens})
                response.raise_for_status()
                data = response.json()
            usage = data.get("usage", {})
            return Completion(data["content"][0]["text"], usage.get("input_tokens", 0), usage.get("output_tokens", 0))
        except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"Anthropic provider: {exc}") from exc


class GeminiProvider(ModelProvider):
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def complete(self, *, model: str, system: str, prompt: str, temperature: float, max_tokens: int) -> Completion:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(url, json={"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens}})
                response.raise_for_status()
                data = response.json()
            usage = data.get("usageMetadata", {})
            return Completion(data["candidates"][0]["content"]["parts"][0]["text"], usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0))
        except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"Google provider: {exc}") from exc


def provider_for(name: str, keys: dict[str, Any], api_key: str = "") -> ModelProvider:
    normalized = name.lower().replace("_", "-")
    if normalized == "openai": return OpenAICompatibleProvider(api_key or str(keys.get("openai", "")))
    if normalized == "anthropic": return AnthropicProvider(api_key or str(keys.get("anthropic", "")))
    if normalized in {"google", "gemini"}: return GeminiProvider(api_key or str(keys.get("google", "")))
    if normalized == "ollama":
        base_url = str(keys.get("ollama_url") or "http://localhost:11434").rstrip("/")
        return OpenAICompatibleProvider("", base_url if base_url.endswith("/v1") else f"{base_url}/v1")
    if normalized in {"openai-compatible", "openai-compatible-api"}: return OpenAICompatibleProvider(api_key or str(keys.get("openai_compatible_key", "")), str(keys.get("openai_compatible_url", "")))
    raise ProviderError(f"Unsupported provider: {name}")
