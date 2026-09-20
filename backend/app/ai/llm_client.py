"""LLM Client provider abstraction for BugBuster AI Engine.

Architecture Goals:
- Abstract interface (LLMClient) so underlying providers (Gemini, OpenAI, Anthropic,
  Ollama, vLLM) can be swapped seamlessly without modifying analyzer or patch generator logic.
- Credentials loaded exclusively from environment variables (never hardcoded).
- Full timeout and error isolation (converting network/API errors into AILLMError/AITimeoutError).
- Structured logging that guarantees API keys are NEVER logged.
- Native support for both Gemini API and OpenAI-compatible endpoints.
- Included MockLLMClient for testing and offline development.
"""

from __future__ import annotations

import abc
import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, Optional

from .response_parser import AILLMError, AITimeoutError

logger = logging.getLogger("bugbuster.ai.llm_client")


class LLMClient(abc.ABC):
    """Abstract base class defining the LLM provider contract."""

    @abc.abstractmethod
    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        """Synchronously invokes the LLM and returns the raw string completion."""
        pass

    @abc.abstractmethod
    async def generate_async(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        """Asynchronously invokes the LLM for FastAPI integration."""
        pass


def mask_secret(secret: Optional[str]) -> str:
    """Safely masks credentials for logging output."""
    if not secret:
        return "[NOT SET]"
    if len(secret) <= 8:
        return "***"
    return f"{secret[:3]}...{secret[-4:]}"


class GeminiLLMClient(LLMClient):
    """Native Google Gemini REST client using urllib (no external SDK required)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 45.0,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.model = model or os.getenv("LLM_MODEL") or "gemini-2.5-flash"
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", str(timeout)))

        logger.info(
            "Initialized GeminiLLMClient [Model: %s, Key: %s, Timeout: %.1fs]",
            self.model,
            mask_secret(self.api_key),
            self.timeout,
        )

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        if not self.api_key:
            raise AILLMError("GEMINI_API_KEY environment variable is missing.")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {
                    "parts": [{"text": user_prompt}]
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "responseMimeType": "application/json",
            },
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                resp_body = resp.read().decode("utf-8")
                parsed = json.loads(resp_body)
                candidates = parsed.get("candidates", [])
                if not candidates:
                    raise AILLMError("Gemini returned empty candidate list (possible safety filter block).")
                parts = candidates[0].get("content", {}).get("parts", [])
                if not parts:
                    raise AILLMError("Gemini candidate contains no text parts.")
                return parts[0].get("text", "")
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="replace") if hasattr(err, "read") else str(err)
            logger.error("Gemini HTTP %d Error: %s", err.code, err_msg)
            raise AILLMError(f"Gemini API returned HTTP {err.code}: {err_msg}") from err
        except urllib.error.URLError as err:
            if isinstance(err.reason, TimeoutError) or "timed out" in str(err.reason).lower():
                raise AITimeoutError(f"Gemini request timed out after {self.timeout}s") from err
            raise AILLMError(f"Network error communicating with Gemini: {err.reason}") from err
        except TimeoutError as err:
            raise AITimeoutError(f"Gemini request timed out after {self.timeout}s") from err
        except Exception as err:
            if isinstance(err, (AILLMError, AITimeoutError)):
                raise
            raise AILLMError(f"Unexpected error calling Gemini: {err}") from err

    async def generate_async(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        loop = asyncio.get_running_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, self.generate, system_prompt, user_prompt, temperature, max_tokens),
                timeout=self.timeout + 2.0,
            )
        except asyncio.TimeoutError as exc:
            raise AITimeoutError(f"Async Gemini request timed out after {self.timeout}s") from exc


class OpenAILikeLLMClient(LLMClient):
    """Universal HTTP client supporting OpenAI-compatible chat completion endpoints.
    
    Compatible with OpenAI, vLLM, Ollama, Groq, Together AI, etc.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 45.0,
    ) -> None:
        self.api_key = api_key or os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
        self.base_url = (base_url or os.getenv("LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
        self.model = model or os.getenv("LLM_MODEL") or "gpt-4o-mini"
        self.timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", str(timeout)))

        logger.info(
            "Initialized OpenAILikeLLMClient [Model: %s, BaseURL: %s, Key: %s, Timeout: %.1fs]",
            self.model,
            self.base_url,
            mask_secret(self.api_key),
            self.timeout,
        )

    def _prepare_payload(
        self, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int
    ) -> dict[str, Any]:
        return {
            "model": self.model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
        }

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        url = f"{self.base_url}/chat/completions"
        payload = self._prepare_payload(system_prompt, user_prompt, temperature, max_tokens)
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key or ''}",
        }

        logger.debug("Sending LLM request to %s (model: %s)", url, self.model)
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                resp_body = resp.read().decode("utf-8")
                parsed = json.loads(resp_body)
                content = parsed["choices"][0]["message"]["content"]
                return content
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="replace") if hasattr(err, "read") else str(err)
            logger.error("LLM Provider HTTP %d Error: %s", err.code, err_msg)
            raise AILLMError(f"LLM Provider returned HTTP {err.code}: {err_msg}") from err
        except urllib.error.URLError as err:
            if isinstance(err.reason, TimeoutError) or "timed out" in str(err.reason).lower():
                raise AITimeoutError(f"LLM request timed out after {self.timeout}s") from err
            raise AILLMError(f"Network error communicating with LLM provider: {err.reason}") from err
        except TimeoutError as err:
            raise AITimeoutError(f"LLM request timed out after {self.timeout}s") from err
        except Exception as err:
            if isinstance(err, (AILLMError, AITimeoutError)):
                raise
            raise AILLMError(f"Unexpected LLM invocation error: {err}") from err

    async def generate_async(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        loop = asyncio.get_running_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(None, self.generate, system_prompt, user_prompt, temperature, max_tokens),
                timeout=self.timeout + 2.0,
            )
        except asyncio.TimeoutError as exc:
            raise AITimeoutError(f"Async LLM request timed out after {self.timeout}s") from exc


class MockLLMClient(LLMClient):
    """Deterministic Mock LLM client for unit tests and local sandbox integration."""

    def __init__(
        self,
        canned_response: Optional[str] = None,
        response_factory: Optional[Callable[[str, str], str]] = None,
        should_timeout: bool = False,
        should_fail: bool = False,
        error_message: str = "Simulated LLM API failure",
    ) -> None:
        self.canned_response = canned_response or "{}"
        self.response_factory = response_factory
        self.should_timeout = should_timeout
        self.should_fail = should_fail
        self.error_message = error_message
        self.call_history: list[dict[str, Any]] = []

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        self.call_history.append({
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "temperature": temperature,
            "max_tokens": max_tokens,
        })
        if self.should_timeout:
            raise AITimeoutError("Mock LLM timed out.")
        if self.should_fail:
            raise AILLMError(self.error_message)
        if self.response_factory:
            return self.response_factory(system_prompt, user_prompt)
        return self.canned_response

    async def generate_async(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
    ) -> str:
        return self.generate(system_prompt, user_prompt, temperature, max_tokens)


def get_default_llm_client() -> LLMClient:
    """Factory creating the configured LLM client from environment settings.
    
    Priority:
    1. If BUGBUSTER_OFFLINE_MODE is set -> MockLLMClient
    2. If OPENAI_API_KEY or LLM_API_KEY is set -> OpenAILikeLLMClient
    3. If GEMINI_API_KEY is set -> GeminiLLMClient
    4. Fallback -> OpenAILikeLLMClient
    """
    if os.getenv("BUGBUSTER_OFFLINE_MODE", "false").lower() in ("true", "1", "yes"):
        logger.info("BUGBUSTER_OFFLINE_MODE enabled. Using MockLLMClient.")
        return MockLLMClient()

    if os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY"):
        return OpenAILikeLLMClient()

    if os.getenv("GEMINI_API_KEY"):
        return GeminiLLMClient()

    return OpenAILikeLLMClient()
