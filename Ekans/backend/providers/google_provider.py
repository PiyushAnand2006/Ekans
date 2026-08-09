"""Google Gemini Model Provider."""

from __future__ import annotations

import asyncio
import logging
import re
import httpx

from backend.providers.base import (
    CompletionRequest,
    CompletionResponse,
    ModelProvider,
)

logger = logging.getLogger("ekans.providers.google")

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GoogleProvider(ModelProvider):
    """Google AI (Gemini) API adapter using httpx REST calls."""

    provider_name = "google"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=120.0)

    async def complete(self, request: CompletionRequest) -> CompletionResponse:
        # Default model to gemini-3.6-flash if not specified or invalid for google
        model = request.model
        if not model.startswith("gemini"):
            model = "gemini-3.6-flash"

        # Separate system instruction from messages
        system_text = ""
        contents = []
        for m in request.messages:
            if m.role == "system":
                system_text += m.content + "\n"
            else:
                role = "user" if m.role in ("user", "system") else "model"
                contents.append({
                    "role": role,
                    "parts": [{"text": m.content}]
                })

        # Ensure at least one user message
        if not contents:
            contents.append({"role": "user", "parts": [{"text": "Hello"}]})

        max_tokens = max(request.max_tokens or 8192, 8192)

        body: dict = {
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": max_tokens,
            }
        }

        if system_text.strip():
            body["systemInstruction"] = {
                "parts": [{"text": system_text.strip()}]
            }

        url = f"{GEMINI_API_URL}/{model}:generateContent?key={self.api_key}"

        try:
            resp = None
            for attempt in range(4):
                resp = await self.client.post(
                    url,
                    json=body,
                    headers={"Content-Type": "application/json"},
                )
                if resp.status_code == 429 and attempt < 3:
                    err_text = resp.text
                    match = re.search(r"retry in ([\d\.]+)s", err_text, re.IGNORECASE)
                    if match:
                        wait_time = float(match.group(1)) + 1.0
                    else:
                        wait_time = 10.0 * (attempt + 1)
                    wait_time = min(wait_time, 60.0)
                    logger.warning(
                        "Google AI API rate limit (429) hit for %s. Pausing %.1fs before retry %d/3...",
                        model, wait_time, attempt + 1
                    )
                    await asyncio.sleep(wait_time)
                    continue

                if resp.status_code == 404 and model != "gemini-3.6-flash":
                    logger.warning("Model '%s' returned 404. Retrying with gemini-3.6-flash...", model)
                    model = "gemini-3.6-flash"
                    url = f"{GEMINI_API_URL}/{model}:generateContent?key={self.api_key}"
                    continue

                break

            if resp is None or resp.status_code != 200:
                err_text = resp.text if resp else "No response"
                try:
                    if resp:
                        err_json = resp.json()
                        err_text = err_json.get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                raise RuntimeError(f"Google AI API error ({resp.status_code if resp else 500}): {err_text}")

            data = resp.json()

            content = ""
            finish_reason = "stop"
            candidates = data.get("candidates", [])
            if candidates:
                c0 = candidates[0]
                finish_reason_raw = c0.get("finishReason", "STOP")
                finish_reason = finish_reason_raw.lower()
                parts = c0.get("content", {}).get("parts", [])
                for p in parts:
                    content += p.get("text", "")

                if finish_reason_raw in ("MAX_TOKENS", "LENGTH") and content:
                    logger.warning("Google Gemini hit MAX_TOKENS, requesting continuation...")
                    cont_contents = list(contents)
                    cont_contents.append({"role": "model", "parts": [{"text": content}]})
                    cont_contents.append({"role": "user", "parts": [{"text": "Continue writing from where you left off. Do not repeat text already written."}]})
                    body["contents"] = cont_contents
                    try:
                        c_resp = await self.client.post(url, json=body, headers={"Content-Type": "application/json"})
                        if c_resp.status_code == 200:
                            c_data = c_resp.json()
                            c_cands = c_data.get("candidates", [])
                            if c_cands:
                                for p in c_cands[0].get("content", {}).get("parts", []):
                                    content += p.get("text", "")
                    except Exception as ce:
                        logger.warning("Continuation request failed: %s", ce)

            usage = data.get("usageMetadata", {})

            return CompletionResponse(
                content=content,
                model=model,
                input_tokens=usage.get("promptTokenCount", 0),
                output_tokens=usage.get("candidatesTokenCount", 0),
                finish_reason=finish_reason,
                raw=data,
            )
        except Exception as e:
            logger.error("Google completion failed: %s", e)
            raise

    async def is_available(self) -> bool:
        return bool(self.api_key)

    def supports_model(self, model: str) -> bool:
        return "gemini" in model.lower()
