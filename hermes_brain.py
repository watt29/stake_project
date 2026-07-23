import json
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd
import requests

from _account_paths import account_file, normalize_config_name

# Force UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

_CONFIG_REF = normalize_config_name(sys.argv[1]) if len(sys.argv) > 1 else "config.json"

HISTORY_FILE = account_file("dice_history.csv", _CONFIG_REF)
STATS_FILE = account_file("dice_stats.json", _CONFIG_REF)
SKILLS_FILE = account_file("ai_skills.json", _CONFIG_REF)
MEMORY_FILE = account_file("MARKET_MEMORY.md", _CONFIG_REF)
MODEL_STATE_FILE = account_file("hermes_model_state.json", _CONFIG_REF)
API_FILE = "api.txt"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODELS = ["llama-3.1-8b-instant", "openai/gpt-oss-20b"]

DEFAULT_SKILLS = {
    "isolated_wins_threshold": 18,
    "loss_streak_threshold": 3,
    "sawtooth_length": 6,
    "loss_streak_escape_wins": 2,
    "loss_streak_mid_step": 8,
    "loss_streak_mid_threshold": 3,
    "loss_streak_mid_escape_wins": 2,
    "loss_streak_high_step": 14,
    "loss_streak_high_threshold": 1,
    "loss_streak_high_escape_wins": 2,
    "loss_streak_high_min_virtual_rolls": 16,
    "hard_virtual_step": 14,
    "hard_virtual_escape_wins": 2,
    "hard_virtual_min_rolls": 20,
}


def clamp(value, low, high):
    return max(low, min(int(value), high))


def atomic_write_json(path, data):
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp_path, path)


def load_api_keys_from_file(path=API_FILE):
    """Load local API keys from api.txt without requiring them in the repo."""
    if not os.path.exists(path):
        return

    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            lines = f.readlines()
    except Exception as e:
        print(f"API key file could not be read: {e}")
        return

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        key_name = None
        key_value = line
        if "=" in line:
            key_name, key_value = [part.strip() for part in line.split("=", 1)]
        elif ":" in line and not line.lower().startswith(("http://", "https://")):
            key_name, key_value = [part.strip() for part in line.split(":", 1)]

        upper_name = (key_name or "").upper()
        if upper_name in {"GROQ_API_KEY", "OPENROUTER_API_KEY", "GROQ_MODELS", "GROQ_MODEL"}:
            os.environ.setdefault(upper_name, key_value)
        elif key_value.startswith("gsk_"):
            os.environ.setdefault("GROQ_API_KEY", key_value)
        elif key_value.startswith("sk-or-"):
            os.environ.setdefault("OPENROUTER_API_KEY", key_value)


def get_groq_models():
    raw = os.environ.get("GROQ_MODELS") or os.environ.get("GROQ_MODEL")
    if not raw:
        return DEFAULT_GROQ_MODELS
    models = [part.strip() for part in raw.split(",") if part.strip()]
    return models or DEFAULT_GROQ_MODELS


def choose_next_groq_model():
    models = get_groq_models()
    state = {"last_index": -1}
    if os.path.exists(MODEL_STATE_FILE):
        try:
            with open(MODEL_STATE_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                state.update(loaded)
        except Exception:
            pass

    next_index = (int(state.get("last_index", -1)) + 1) % len(models)
    atomic_write_json(MODEL_STATE_FILE, {
        "last_index": next_index,
        "last_model": models[next_index],
        "models": models,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    })
    return models[next_index], models


def clamp_skill(key, value):
    ranges = {
        "isolated_wins_threshold": (8, 24),
        "loss_streak_threshold": (3, 8),
        "sawtooth_length": (4, 10),
        "loss_streak_escape_wins": (2, 4),
        "loss_streak_mid_step": (8, 12),
        "loss_streak_mid_threshold": (2, 4),
        "loss_streak_mid_escape_wins": (2, 5),
        "loss_streak_high_step": (14, 16),
        "loss_streak_high_threshold": (1, 2),
        "loss_streak_high_escape_wins": (2, 5),
        "loss_streak_high_min_virtual_rolls": (8, 24),
        "hard_virtual_step": (0, 22),
        "hard_virtual_escape_wins": (2, 6),
        "hard_virtual_min_rolls": (20, 40),
    }
    low, high = ranges[key]
    return clamp(value, low, high)


def apply_llm_safely(rule_skills, llm_skills):
    """Merge only risk-control suggestions that are at least as strict as local rules."""
    merged = rule_skills.copy()
    lower_is_stricter = {
        "loss_streak_threshold",
        "sawtooth_length",
        "loss_streak_mid_threshold",
        "loss_streak_high_threshold",
    }
    higher_is_stricter = {
        "loss_streak_escape_wins",
        "loss_streak_mid_escape_wins",
        "loss_streak_high_escape_wins",
        "loss_streak_high_min_virtual_rolls",
        "hard_virtual_escape_wins",
        "hard_virtual_min_rolls",
    }

    for key, value in llm_skills.items():
        if key not in DEFAULT_SKILLS or isinstance(value, bool):
            continue
        try:
            proposed = clamp_skill(key, value)
        except Exception:
            continue

        if key in lower_is_stricter:
            merged[key] = min(merged[key], proposed)
        elif key in higher_is_stricter:
            merged[key] = max(merged[key], proposed)
        elif key == "hard_virtual_step":
            if merged[key] > 0 and proposed > 0:
                merged[key] = min(merged[key], proposed)
            elif merged[key] == 0:
                merged[key] = proposed
        elif key == "isolated_wins_threshold":
            merged[key] = proposed

    return merged


def ask_groq_for_skills(rule_skills, report):
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return None, "GROQ_API_KEY not set"
    groq_model, groq_models = choose_next_groq_model()

    prompt = {
        "risk_report": report,
        "rule_based_skills": rule_skills,
        "selected_model": groq_model,
        "model_rotation": groq_models,
        "allowed_skill_keys": list(DEFAULT_SKILLS.keys()),
        "instruction": (
            "Return only JSON with keys: risk_mode, reason, skills. "
            "skills may only include allowed risk-control keys. "
            "Never change base_bet, balance, token, cookies, simulate, fib_step, or bankroll. "
            "For dangerous conditions, prefer stricter virtual pause settings."
        ),
    }
    try:
        response = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": groq_model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are Hermes Risk Brain. Return strict valid JSON only.",
                    },
                    {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
                ],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            },
            timeout=25,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        llm_skills = parsed.get("skills", {})
        if not isinstance(llm_skills, dict):
            return None, "LLM response did not contain a skills object"
        merged = apply_llm_safely(rule_skills, llm_skills)
        return {
            "risk_mode": parsed.get("risk_mode", report["risk_mode"]),
            "reason": parsed.get("reason", ""),
            "skills": merged,
            "raw_skills": llm_skills,
            "model": groq_model,
            "model_rotation": groq_models,
        }, None
    except Exception as e:
        return None, str(e)


def loss_streak_lengths(results):
    if results.empty:
        return pd.Series(dtype=int)
    groups = (results != results.shift()).cumsum()
    streak_df = results.groupby(groups).agg(value="first", length="size")
    return streak_df[streak_df["value"] == "LOSS"]["length"]


def ww_gaps(results):
    if len(results) < 2:
        return pd.Series(dtype=int)
    ww_mask = (results == "WIN") & (results.shift(-1) == "WIN")
    ww_indices = pd.Series(results.index[ww_mask])
    if len(ww_indices) <= 1:
        return pd.Series(dtype=int)
    return (ww_indices.diff().dropna() - 2).clip(lower=0)


def classify_risk(recent_real):
    if recent_real.empty:
        return "NORMAL"
    recent_max_step = int(recent_real["step"].max())
    recent_loss_streaks = loss_streak_lengths(recent_real["result"])
    recent_max_loss = int(recent_loss_streaks.max()) if not recent_loss_streaks.empty else 0

    if recent_max_step >= 20 or recent_max_loss >= 8:
        return "CRISIS"
    if recent_max_step >= 14 or recent_max_loss >= 6:
        return "DANGER"
    if recent_max_step >= 10 or recent_max_loss >= 5:
        return "ELEVATED"
    return "NORMAL"


def build_skills(real_df, all_df):
    recent_real = real_df.tail(1500).copy()
    recent_all = all_df.tail(2000).copy()

    global_gaps = ww_gaps(real_df["result"])
    recent_gaps = ww_gaps(recent_real["result"])
    gap_source = recent_gaps if len(recent_gaps) >= 20 else global_gaps
    if gap_source.empty:
        isolated_wins = DEFAULT_SKILLS["isolated_wins_threshold"]
        max_gap = 0
    else:
        isolated_wins = clamp(np.ceil(gap_source.quantile(0.95)), 12, 24)
        max_gap = int(gap_source.max())

    global_losses = loss_streak_lengths(real_df["result"])
    recent_losses = loss_streak_lengths(recent_real["result"])
    loss_source = recent_losses if len(recent_losses) >= 20 else global_losses
    p95_loss = int(np.ceil(loss_source.quantile(0.95))) if not loss_source.empty else 5
    max_recent_step = int(recent_real["step"].max()) if not recent_real.empty else 0
    max_recent_loss = int(recent_losses.max()) if not recent_losses.empty else 0
    risk_mode = classify_risk(recent_real)

    skills = DEFAULT_SKILLS.copy()
    skills["isolated_wins_threshold"] = isolated_wins

    # Low steps stay close to the user's rule. In a crisis, enter virtual mode one loss earlier.
    skills["loss_streak_threshold"] = 3

    if risk_mode == "NORMAL":
        skills["hard_virtual_step"] = 0
        skills["loss_streak_mid_threshold"] = 3
        skills["loss_streak_mid_escape_wins"] = 2
        skills["loss_streak_high_escape_wins"] = 2
        skills["loss_streak_high_min_virtual_rolls"] = 8
    elif risk_mode == "ELEVATED":
        skills["hard_virtual_step"] = 18
        skills["loss_streak_mid_threshold"] = 3
        skills["loss_streak_mid_escape_wins"] = 2
        skills["loss_streak_high_escape_wins"] = 2
        skills["loss_streak_high_min_virtual_rolls"] = 10
    elif risk_mode == "DANGER":
        skills["hard_virtual_step"] = 16
        skills["loss_streak_mid_threshold"] = 2
        skills["loss_streak_mid_escape_wins"] = 2
        skills["loss_streak_high_escape_wins"] = 2
        skills["loss_streak_high_min_virtual_rolls"] = 12
    else: # CRISIS MODE (AI Lockdown)
        skills["hard_virtual_step"] = 12
        skills["loss_streak_mid_threshold"] = 2
        skills["loss_streak_mid_escape_wins"] = 2
        skills["loss_streak_high_escape_wins"] = 2
        skills["loss_streak_high_min_virtual_rolls"] = 16
        skills["hard_virtual_escape_wins"] = 2
        skills["hard_virtual_min_rolls"] = 20

    virtual_counts = recent_all["mode"].value_counts().to_dict() if not recent_all.empty else {}
    return skills, {
        "risk_mode": risk_mode,
        "p95_loss": p95_loss,
        "max_recent_loss": max_recent_loss,
        "max_recent_step": max_recent_step,
        "isolated_wins": isolated_wins,
        "max_gap": max_gap,
        "virtual_counts": virtual_counts,
        "recent_real_count": len(recent_real),
        "total_real_count": len(real_df),
    }


def analyze_and_learn():
    print("[Hermes AI Brain] Starting risk-management loop...")
    load_api_keys_from_file()

    if not os.path.exists(HISTORY_FILE):
        print(f"Error: {HISTORY_FILE} not found.")
        return 1

    try:
        df = pd.read_csv(
            HISTORY_FILE,
            header=None,
            low_memory=False,
            names=[
                "timestamp",
                "mode",
                "step",
                "bet",
                "target",
                "condition",
                "payout",
                "profit",
                "result",
                "streak_count",
                "streak_type",
            ],
        )
    except Exception as e:
        print(f"Error reading data: {e}")
        return 1

    df["step"] = pd.to_numeric(df["step"], errors="coerce").fillna(0).astype(int)
    df["result"] = df["result"].astype(str).str.upper()
    df["mode"] = df["mode"].astype(str)

    real_df = df[df["mode"].str.contains("REAL", na=False)].copy()
    if len(real_df) < 100:
        print("Not enough real bet data to learn from.")
        return 0

    skills, report = build_skills(real_df, df)
    llm_report, llm_error = ask_groq_for_skills(skills, report)
    if llm_report:
        skills = llm_report["skills"]
        report["risk_mode"] = llm_report["risk_mode"]
        report["llm_model"] = llm_report["model"]
        report["llm_model_rotation"] = llm_report["model_rotation"]
        report["llm_reason"] = llm_report["reason"]
        report["llm_raw_skills"] = llm_report["raw_skills"]
        report["llm_status"] = "used"
    else:
        report["llm_status"] = f"fallback_rule_based: {llm_error}"
    report["llm_reason"] = report.get("llm_reason") or "none"
    atomic_write_json(SKILLS_FILE, skills)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    memory_content = f"""# Stake Market Memory (Hermes AI)

This file stores persistent facts and risk adjustments generated by Hermes.

## Latest Risk Status
* Timestamp: {timestamp}
* Risk Mode: {report["risk_mode"]}
* Total Real Bets Analyzed: {report["total_real_count"]:,}
* Recent Real Bets Used: {report["recent_real_count"]:,}
* Max Recent Step: {report["max_recent_step"]}
* Max Recent Loss Streak: {report["max_recent_loss"]}
* P95 Loss Streak: {report["p95_loss"]}
* W-W Gap Threshold: {report["isolated_wins"]}
* Worst W-W Gap Observed: {report["max_gap"]}
* Recent Mode Counts: {report["virtual_counts"]}
* LLM Status: {report["llm_status"]}
* LLM Model: {report.get("llm_model", "none")}
* LLM Rotation: {report.get("llm_model_rotation", [])}
* LLM Reason: {report.get("llm_reason", "")}

## Active ai_skills.json
```json
{json.dumps(skills, indent=4, ensure_ascii=False)}
```

## Guardrails
* Hermes only changes risk-control thresholds.
* Hermes does not change base_bet, balance, token, cookies, or simulate mode.
* Step 14+ remains protected by 1 real loss -> virtual mode.
"""
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        f.write(memory_content)

    print(f"Skills updated. Risk={report['risk_mode']} MaxStep={report['max_recent_step']} MaxLoss={report['max_recent_loss']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(analyze_and_learn())
