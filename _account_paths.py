import os


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ACCOUNT_HISTORY_ROOT = os.path.join(BASE_DIR, "account_history")

ACCOUNT_ID_BY_CONFIG = {
    "config.json": "ACC01",
    "config_account2.json": "ACC02",
    "config_account3.json": "ACC03",
    "config_account4.json": "ACC04",
    "config_account5.json": "ACC05",
    "config_account6.json": "ACC06",
    "config_account7.json": "ACC07",
    "config_account8.json": "ACC08",
}

CONFIG_BY_ACCOUNT_ID = {value: key for key, value in ACCOUNT_ID_BY_CONFIG.items()}


def normalize_config_name(config_ref=None):
    if not config_ref:
        return "config.json"

    value = os.path.basename(str(config_ref).strip())

    if value.startswith("-"):
        return "config.json"

    if value in ACCOUNT_ID_BY_CONFIG:
        return value

    if value in CONFIG_BY_ACCOUNT_ID:
        return value

    if value.startswith("_"):
        candidate = f"config{value}.json"
        if candidate in ACCOUNT_ID_BY_CONFIG:
            return candidate

    if value.startswith("ACC"):
        return CONFIG_BY_ACCOUNT_ID.get(value, "config.json")

    if not value.endswith(".json"):
        candidate = f"{value}.json"
        if candidate in ACCOUNT_ID_BY_CONFIG:
            return candidate
        return candidate

    return value


def get_account_id_for_config(config_ref=None):
    config_name = normalize_config_name(config_ref)
    return ACCOUNT_ID_BY_CONFIG.get(config_name, "ACCXX")


def get_account_dir(config_ref=None):
    return os.path.join(ACCOUNT_HISTORY_ROOT, get_account_id_for_config(config_ref))


def ensure_account_dir(config_ref=None):
    path = get_account_dir(config_ref)
    os.makedirs(path, exist_ok=True)
    return path


def account_file(filename, config_ref=None):
    return os.path.join(ensure_account_dir(config_ref), filename)
