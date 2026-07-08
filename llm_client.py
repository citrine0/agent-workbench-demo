import json
import os
from typing import Any, Dict

from openai import OpenAI


PROVIDER_CONFIG = {
    "openai": {
        "api_key_env": "OPENAI_API_KEY",
        "base_url": "https://xingwan.store/v1",
        "label": "OpenAI / GPT-5.4-mini",
    },
    "deepseek": {
        "api_key_env": "DEEPSEEK_API_KEY",
        "base_url": "https://api.deepseek.com",
        "label": "DeepSeek / deepseek-v4-pro",
    },
}


class LLMClient:
    def __init__(self, model: str, provider: str = "openai") -> None:
        if provider not in PROVIDER_CONFIG:
            raise RuntimeError(f"不支持的 LLM provider：{provider}")

        config = PROVIDER_CONFIG[provider]
        api_key_env = config["api_key_env"]
        api_key = os.getenv(api_key_env)
        if not api_key:
            raise RuntimeError(f"未检测到 {api_key_env}，无法运行实时 LLM 模式。")

        kwargs = {"api_key": api_key}
        if config["base_url"]:
            kwargs["base_url"] = config["base_url"]

        self.client = OpenAI(**kwargs)
        self.model = model
        self.provider = provider

    def chat_text(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        return response.choices[0].message.content or ""

    def chat_json(self, system_prompt: str, user_prompt: str, temperature: float = 0.2) -> Dict[str, Any]:
        text = self.chat_text(system_prompt=system_prompt, user_prompt=user_prompt, temperature=temperature)
        return parse_json_response(text)


def parse_json_response(text: str) -> Dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(cleaned[start : end + 1])
