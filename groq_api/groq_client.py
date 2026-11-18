"""
groq_client.py — Groq API แบบไฟล์เดียวจบ (ไม่ต้องลง dependency ใด ๆ)
====================================================================

ดึง "เฉพาะส่วน API" ออกมาจากโปรเจกต์ binance-sever-render-main/agent/ai_providers.py
โดยตัด loguru / aiohttp / fallback chain อื่นออก เหลือแค่:
  - หมุน API key หลายตัว (GROQ_API_KEY, GROQ_API_KEY_2, ...)
  - จำกัด RPM ต่อ key (กัน 429)
  - circuit breaker: key ที่โดน 429 จะพัก 60 วินาที
  - เรียก chat/completions ที่ https://api.groq.com/openai/v1 (OpenAI-compatible)

ใช้ stdlib เท่านั้น (urllib) — รันได้ทุกเครื่องที่มี Python 3.9+

ใช้งานเร็ว:
    export GROQ_API_KEY=gsk_xxx          # Windows: set GROQ_API_KEY=gsk_xxx
    python groq_client.py "สวัสดี แนะนำตัวหน่อย"

ในโค้ด:
    from groq_client import GroqClient
    c = GroqClient()
    print(c.ask("เขียนแคปชันขายกระเป๋าหนัง 3 แบบ", system="คุณคือนักเขียนคอนเทนต์"))
    data = c.ask_json("ตอบเป็น JSON: {\"title\": str, \"tags\": [str]}")
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "openai/gpt-oss-120b"      # คุณภาพดีที่สุดในราคาถูก
FAST_MODEL = "openai/gpt-oss-20b"          # เร็ว/ถูกกว่า (~1,000 tok/s)


@dataclass
class GroqResult:
    text: str
    model: str
    latency_ms: float
    key_hint: str          # ท้าย key 6 ตัว ไว้ดูว่าใช้ตัวไหน (ไม่เปิดเผย key)


class GroqError(RuntimeError):
    """ข้อผิดพลาดที่ caller ควรจัดการ (ไม่มี key / rate limit / HTTP error)"""


class GroqClient:
    def __init__(
        self,
        api_keys: Optional[List[str]] = None,
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_BASE_URL,
        rpm_limit: int = 28,          # free tier = 30 RPM → กันไว้ 28
        cooldown_sec: int = 60,       # พัก key ที่โดน 429
        timeout_sec: int = 30,
    ) -> None:
        self.api_keys = api_keys or self._load_keys_from_env()
        if not self.api_keys:
            raise GroqError(
                "ไม่พบ GROQ_API_KEY — สมัครฟรีที่ https://console.groq.com/keys "
                "แล้วตั้งค่าใน .env หรือ environment variable"
            )
        self.model = model or os.getenv("GROQ_MODEL", DEFAULT_MODEL)
        self.base_url = base_url.rstrip("/")
        self.rpm_limit = rpm_limit
        self.cooldown_sec = cooldown_sec
        self.timeout_sec = timeout_sec
        self._hits: Dict[str, List[float]] = {k: [] for k in self.api_keys}
        self._cooldown_until: Dict[str, float] = {}

    # ---------- key management ----------
    @staticmethod
    def _load_keys_from_env() -> List[str]:
        """GROQ_API_KEY, GROQ_API_KEY_2 … GROQ_API_KEY_10"""
        keys: List[str] = []
        for i in range(1, 11):
            name = "GROQ_API_KEY" if i == 1 else f"GROQ_API_KEY_{i}"
            v = (os.getenv(name) or "").strip()
            if v:
                keys.append(v)
        return keys

    def _pick_key(self) -> Optional[str]:
        now = time.time()
        usable: List[str] = []
        for k in self.api_keys:
            if now < self._cooldown_until.get(k, 0):
                continue
            window = [t for t in self._hits[k] if now - t < 60]
            self._hits[k] = window
            if len(window) < self.rpm_limit:
                usable.append(k)
        if not usable:
            return None
        # ใช้ key ที่ถูกเรียกน้อยที่สุดก่อน (กระจายโหลด)
        usable.sort(key=lambda k: len(self._hits[k]))
        return usable[0]

    def _mark_rate_limited(self, key: str) -> None:
        self._cooldown_until[key] = time.time() + self.cooldown_sec

    # ---------- core ----------
    def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 512,
        json_mode: bool = False,
    ) -> GroqResult:
        key = self._pick_key()
        if not key:
            raise GroqError("ทุก key ติด rate limit อยู่ — รอ 60 วินาทีแล้วลองใหม่")

        model = model or self.model
        body: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if "gpt-oss" in model:
            body["reasoning_effort"] = "low"     # ลด token ที่ใช้คิด ลด latency
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=data,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "User-Agent": "groq-client/1.0",
            },
            method="POST",
        )

        self._hits.setdefault(key, []).append(time.time())
        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_sec) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                self._mark_rate_limited(key)
                raise GroqError(f"rate limit (429) ที่ key ...{key[-6:]} — พัก 60 วิ") from e
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:300]
            except Exception:
                pass
            raise GroqError(f"HTTP {e.code}: {detail}") from e
        except urllib.error.URLError as e:
            raise GroqError(f"เชื่อมต่อ api.groq.com ไม่ได้: {e.reason}") from e

        try:
            text = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise GroqError(f"รูปแบบ response ไม่คาดคิด: {str(payload)[:300]}") from e

        return GroqResult(
            text=text,
            model=model,
            latency_ms=round((time.time() - start) * 1000, 1),
            key_hint=f"...{key[-6:]}",
        )

    # ---------- helpers ----------
    def ask(
        self,
        prompt: str,
        system: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """ถามคำถามเดียว ตอบเป็นข้อความ"""
        messages: List[Dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return self.chat(messages, **kwargs).text

    def ask_json(self, prompt: str, system: Optional[str] = None, **kwargs: Any) -> Any:
        """บังคับให้ตอบเป็น JSON แล้ว parse ให้เลย (คืน dict/list)"""
        kwargs.setdefault("json_mode", True)
        raw = self.ask(prompt, system=system, **kwargs)
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise GroqError(f"คำตอบไม่ใช่ JSON: {raw[:300]}") from e


# ---------- CLI ไว้ทดสอบเร็ว ๆ ----------
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("usage: python groq_client.py \"คำถามของคุณ\"")
        raise SystemExit(1)

    try:
        client = GroqClient()
        r = client.chat([{"role": "user", "content": sys.argv[1]}])
        print(r.text)
        print(f"\n[{r.model} · {r.latency_ms} ms · key {r.key_hint}]")
    except GroqError as e:
        print(f"ผิดพลาด: {e}")
        raise SystemExit(2)
