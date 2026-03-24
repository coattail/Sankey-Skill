from __future__ import annotations

import shutil
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT_DIR / "dist"
DATA_DIR = ROOT_DIR / "data"
JS_DIR = ROOT_DIR / "js"
PUBLIC_FILES = ("index.html", "style.css", "favicon.svg")
PUBLIC_DATA_FILES = ("earnings-dataset.json", "logo-catalog.json", "supplemental-components.json")


def reset_dist_dir() -> None:
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(parents=True, exist_ok=True)


def copy_public_root_files() -> None:
    for filename in PUBLIC_FILES:
        shutil.copy2(ROOT_DIR / filename, DIST_DIR / filename)

    dist_js_dir = DIST_DIR / "js"
    if dist_js_dir.exists():
        shutil.rmtree(dist_js_dir)
    shutil.copytree(JS_DIR, dist_js_dir)


def copy_public_data_files() -> None:
    dist_data_dir = DIST_DIR / "data"
    dist_cache_dir = dist_data_dir / "cache"
    dist_data_dir.mkdir(parents=True, exist_ok=True)
    dist_cache_dir.mkdir(parents=True, exist_ok=True)

    for filename in PUBLIC_DATA_FILES:
        shutil.copy2(DATA_DIR / filename, dist_data_dir / filename)

    for company_cache_path in sorted((DATA_DIR / "cache").glob("*.json")):
        shutil.copy2(company_cache_path, dist_cache_dir / company_cache_path.name)


def write_nojekyll_marker() -> None:
    (DIST_DIR / ".nojekyll").write_text("", encoding="utf-8")


def main() -> int:
    reset_dist_dir()
    copy_public_root_files()
    copy_public_data_files()
    write_nojekyll_marker()
    print(f"[pages] prepared static artifact at {DIST_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
