from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable


ROOT_DIR = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT_DIR / "data" / "cache" / "ocr"
VISION_OCR_SWIFT = ROOT_DIR / "scripts" / "vision_ocr.swift"
VISION_OCR_BIN = CACHE_DIR / "vision-ocr"


def ensure_vision_ocr_binary() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    needs_build = not VISION_OCR_BIN.exists()
    if not needs_build:
        needs_build = VISION_OCR_BIN.stat().st_mtime < VISION_OCR_SWIFT.stat().st_mtime
    if needs_build:
        subprocess.run(["swiftc", str(VISION_OCR_SWIFT), "-o", str(VISION_OCR_BIN)], check=True)
    return VISION_OCR_BIN


def ocr_image_path(image_path: str | Path) -> str:
    result = subprocess.run(
        [str(ensure_vision_ocr_binary()), str(Path(image_path))],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def ocr_image_path_structured(image_path: str | Path) -> list[dict[str, float | str]]:
    result = subprocess.run(
        [str(ensure_vision_ocr_binary()), "--json", str(Path(image_path))],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout or "[]")
    return payload if isinstance(payload, list) else []


def ocr_image_bytes(image_bytes: bytes, *, suffix: str = ".png") -> str:
    with tempfile.TemporaryDirectory() as temp_dir:
        image_path = Path(temp_dir) / f"ocr-source{suffix or '.png'}"
        image_path.write_bytes(image_bytes)
        return ocr_image_path(image_path)


def ocr_image_bytes_structured(image_bytes: bytes, *, suffix: str = ".png") -> list[dict[str, float | str]]:
    with tempfile.TemporaryDirectory() as temp_dir:
        image_path = Path(temp_dir) / f"ocr-source{suffix or '.png'}"
        image_path.write_bytes(image_bytes)
        return ocr_image_path_structured(image_path)


def ocr_pdf_page_path(pdf_path: str | Path, *, page_number: int) -> str:
    result = subprocess.run(
        [
            str(ensure_vision_ocr_binary()),
            "--pdf",
            str(Path(pdf_path)),
            "--page",
            str(max(int(page_number), 1)),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def ocr_pdf_page_path_structured(pdf_path: str | Path, *, page_number: int) -> list[dict[str, float | str]]:
    result = subprocess.run(
        [
            str(ensure_vision_ocr_binary()),
            "--pdf",
            str(Path(pdf_path)),
            "--page",
            str(max(int(page_number), 1)),
            "--json",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout or "[]")
    return payload if isinstance(payload, list) else []


def ocr_pdf_pages_bytes(
    pdf_bytes: bytes,
    *,
    page_numbers: Iterable[int],
    suffix: str = ".pdf",
) -> dict[int, str]:
    requested_pages = sorted({max(int(page_number), 1) for page_number in page_numbers})
    if not requested_pages:
        return {}
    with tempfile.TemporaryDirectory() as temp_dir:
        pdf_path = Path(temp_dir) / f"ocr-source{suffix or '.pdf'}"
        pdf_path.write_bytes(pdf_bytes)
        page_map: dict[int, str] = {}
        for page_number in requested_pages:
            try:
                page_map[page_number] = ocr_pdf_page_path(pdf_path, page_number=page_number)
            except Exception:
                continue
    return page_map


def ocr_pdf_pages_bytes_structured(
    pdf_bytes: bytes,
    *,
    page_numbers: Iterable[int],
    suffix: str = ".pdf",
) -> dict[int, list[dict[str, float | str]]]:
    requested_pages = sorted({max(int(page_number), 1) for page_number in page_numbers})
    if not requested_pages:
        return {}
    with tempfile.TemporaryDirectory() as temp_dir:
        pdf_path = Path(temp_dir) / f"ocr-source{suffix or '.pdf'}"
        pdf_path.write_bytes(pdf_bytes)
        page_map: dict[int, list[dict[str, float | str]]] = {}
        for page_number in requested_pages:
            try:
                page_map[page_number] = ocr_pdf_page_path_structured(pdf_path, page_number=page_number)
            except Exception:
                continue
    return page_map
