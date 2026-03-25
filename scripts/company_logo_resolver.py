from __future__ import annotations

import base64
from email.utils import formatdate
import io
import json
import mimetypes
import re
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse, urlsplit

import requests
from bs4 import BeautifulSoup
from PIL import Image


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
LOGO_CATALOG_PATH = DATA_DIR / "logo-catalog.json"

REQUEST_HEADERS = {
    "User-Agent": "Codex/earnings-chart-generator-logo-resolver yuwan@example.com",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
    "Cache-Control": "no-cache",
}

BLOCKED_HOST_KEYWORDS = {
    "wikipedia.org",
    "wikidata.org",
    "stockanalysis.com",
    "marketwatch.com",
    "marketscreener.com",
    "macrotrends.net",
    "seekingalpha.com",
    "bloomberg.com",
    "finance.yahoo.com",
    "companiesmarketcap.com",
    "nasdaq.com",
    "reuters.com",
    "wsj.com",
    "tradingview.com",
    "investing.com",
    "fool.com",
}

IMAGE_EXTENSIONS = ("svg", "png", "webp", "jpg", "jpeg", "ico")
LOGO_HINT_RE = re.compile(r"(logo|brand|wordmark|header|navbar|masthead)", re.I)
ICON_REL_RE = re.compile(r"(apple-touch-icon|mask-icon|shortcut icon|icon)", re.I)
IMAGE_URL_RE = re.compile(
    r"""(?P<url>
        (?:https?:)?//[^\s"'()<>]+?\.(?:svg|png|webp|jpe?g|ico)
        |
        [A-Za-z0-9_./:-]+?\.(?:svg|png|webp|jpe?g|ico)
    )""",
    re.I | re.X,
)


def normalize_logo_key(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    normalized = re.sub(r"-corporate$", "", normalized)
    return normalized


def squash_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def normalize_domain(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    if "://" not in raw:
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    host = (parsed.netloc or parsed.path or "").strip().lower()
    host = host.split("@")[-1].split(":")[0]
    return host[4:] if host.startswith("www.") else host


def website_from_domain(domain: str) -> str:
    return f"https://{domain}" if domain else ""


def looks_blocked_host(host: str) -> bool:
    normalized_host = normalize_domain(host)
    return any(normalized_host == keyword or normalized_host.endswith(f".{keyword}") for keyword in BLOCKED_HOST_KEYWORDS)


def company_alias_keys(company: dict[str, Any], domain: str = "") -> set[str]:
    aliases = set()
    for raw in (
        company.get("id"),
        company.get("slug"),
        company.get("ticker"),
        domain,
        normalize_domain(company.get("domain")),
        normalize_domain(company.get("website")),
    ):
        text = str(raw or "").strip().lower()
        if not text:
            continue
        aliases.add(normalize_logo_key(text))
        aliases.add(squash_text(text))
    aliases.discard("")
    return aliases


def load_logo_catalog() -> dict[str, Any]:
    if LOGO_CATALOG_PATH.exists():
        try:
            payload = json.loads(LOGO_CATALOG_PATH.read_text(encoding="utf-8"))
        except Exception:
            payload = {}
    else:
        payload = {}
    logos = payload.get("logos")
    aliases = payload.get("aliases")
    return {
        "generatedAt": payload.get("generatedAt") or "",
        "logos": logos if isinstance(logos, dict) else {},
        "aliases": aliases if isinstance(aliases, dict) else {},
    }


def save_logo_catalog(catalog: dict[str, Any]) -> None:
    payload = {
        "generatedAt": formatdate(usegmt=True),
        "logos": catalog.get("logos") or {},
        "aliases": dict(sorted((catalog.get("aliases") or {}).items())),
    }
    LOGO_CATALOG_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def merge_aliases(catalog: dict[str, Any], canonical_key: str, aliases: set[str]) -> bool:
    changed = False
    alias_map = catalog.setdefault("aliases", {})
    for alias in sorted(aliases):
        if not alias or alias == canonical_key:
            continue
        if alias_map.get(alias) == canonical_key:
            continue
        alias_map[alias] = canonical_key
        changed = True
    return changed


def parse_svg_dimensions(svg_text: str) -> tuple[int, int]:
    width = 0
    height = 0
    width_match = re.search(r'width=["\']([0-9.]+)(?:px)?["\']', svg_text, flags=re.I)
    height_match = re.search(r'height=["\']([0-9.]+)(?:px)?["\']', svg_text, flags=re.I)
    if width_match and height_match:
        try:
            width = int(round(float(width_match.group(1))))
            height = int(round(float(height_match.group(1))))
        except Exception:
            width = 0
            height = 0
    if width > 0 and height > 0:
        return width, height
    view_box_match = re.search(r'viewBox=["\'][^"\']*?\s([0-9.]+)\s([0-9.]+)["\']', svg_text, flags=re.I)
    if view_box_match:
        try:
            width = int(round(float(view_box_match.group(1))))
            height = int(round(float(view_box_match.group(2))))
        except Exception:
            width = 0
            height = 0
    return max(width, 1), max(height, 1)


def detect_mime(content: bytes, response_mime: str, url: str) -> str:
    response_mime = str(response_mime or "").split(";")[0].strip().lower()
    if response_mime.startswith("image/"):
        return "image/svg+xml" if response_mime in {"image/svg", "image/svg+xml"} else response_mime
    guessed, _ = mimetypes.guess_type(url)
    if guessed and guessed.startswith("image/"):
        return guessed
    head = content[:256].lstrip()
    if head.startswith(b"<svg") or b"<svg" in head[:128]:
        return "image/svg+xml"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    if content[:4] == b"\x00\x00\x01\x00":
        return "image/x-icon"
    return ""


def detect_dimensions(content: bytes, mime: str) -> tuple[int, int]:
    if mime == "image/svg+xml":
        try:
            return parse_svg_dimensions(content.decode("utf-8", errors="ignore"))
        except Exception:
            return (256, 256)
    try:
        image = Image.open(io.BytesIO(content))
        return image.size
    except Exception:
        return (0, 0)


def asset_is_catalog_usable(asset: dict[str, Any] | None) -> bool:
    if not isinstance(asset, dict):
        return False
    mime = str(asset.get("mime") or "").strip().lower()
    source_kind = str(asset.get("sourceKind") or "").strip().lower()
    source_url = str(asset.get("url") or asset.get("sourceUrl") or "").strip().lower()
    width = int(asset.get("width") or 0)
    height = int(asset.get("height") or 0)
    quality_score = int(asset.get("score") or asset.get("qualityScore") or 0)
    if not mime.startswith("image/"):
        return False
    if source_url.startswith("manual://"):
        return False
    if source_kind == "conventional-fallback":
        return False
    if mime == "image/x-icon":
        return False
    if mime == "image/svg+xml":
        return quality_score >= 120
    if max(width, height) < 96:
        return False
    if "favicon" in source_url and quality_score < 132:
        return False
    return quality_score >= 108


def catalog_entry_is_usable(entry: dict[str, Any] | None) -> bool:
    if not isinstance(entry, dict) or not entry.get("dataUrl"):
        return False
    return asset_is_catalog_usable(
        {
            "mime": entry.get("mime"),
            "sourceKind": entry.get("sourceKind"),
            "sourceUrl": entry.get("sourceUrl"),
            "width": entry.get("width"),
            "height": entry.get("height"),
            "qualityScore": entry.get("qualityScore"),
        }
    )


def encode_data_url(mime: str, content: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"


def extract_asset_hosts(page_url: str, html: str) -> list[str]:
    ordered_hosts: list[str] = []

    def append_host(value: str) -> None:
        host = normalize_domain(value)
        if host and host not in ordered_hosts:
            ordered_hosts.append(host)

    append_host(page_url)
    for match in re.finditer(r'(?:https?:)?//([^/"\'\s>]+)', html, flags=re.I):
        append_host(match.group(1))
    return ordered_hosts


def extract_asset_prefixes(html: str) -> list[str]:
    prefixes: list[str] = []
    for match in IMAGE_URL_RE.finditer(html.replace("\\/", "/")):
        raw_url = match.group("url")
        if not re.match(r"^(?:https?:)?//", raw_url, flags=re.I):
            continue
        absolute_url = raw_url if raw_url.startswith("http") else f"https:{raw_url}"
        lower_url = absolute_url.lower()
        for marker in ("jfs", "babel", "imagetools", "static", "images"):
            token = f"/{marker}/"
            index = lower_url.find(token)
            if index <= 0:
                continue
            prefix = absolute_url[: index + 1]
            if prefix not in prefixes:
                prefixes.append(prefix)
    return prefixes


def srcset_urls(value: Any) -> list[str]:
    urls: list[str] = []
    for part in str(value or "").split(","):
        candidate = part.strip().split(" ")[0].strip()
        if candidate:
            urls.append(candidate)
    return urls


def build_candidate(raw_url: str, score: int, source_kind: str, context: str = "", inline_svg: str = "") -> dict[str, Any]:
    return {
        "rawUrl": str(raw_url or "").strip(),
        "score": int(score),
        "sourceKind": source_kind,
        "context": context,
        "inlineSvg": inline_svg,
    }


def collect_logo_candidates(page_url: str, html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    candidates: list[dict[str, Any]] = []

    for meta in soup.find_all("meta"):
        key = " ".join([str(meta.get("property") or ""), str(meta.get("name") or "")]).lower()
        content = str(meta.get("content") or "").strip()
        if not content:
            continue
        if "og:logo" in key:
            candidates.append(build_candidate(content, 165, "meta-logo", key))
        elif any(token in key for token in ("og:image", "twitter:image")):
            score = 140 if "logo" in content.lower() else 118
            candidates.append(build_candidate(content, score, "meta-image", key))

    for link in soup.find_all("link"):
        href = str(link.get("href") or "").strip()
        if not href:
            continue
        rel_tokens = [str(token).lower() for token in (link.get("rel") or [])]
        rel_text = " ".join(rel_tokens)
        sizes = str(link.get("sizes") or "").lower()
        if ICON_REL_RE.search(rel_text):
            score = 122 if "apple-touch-icon" in rel_text else 96
            if "mask-icon" in rel_text:
                score -= 12
            if sizes and any(size in sizes for size in ("180x180", "192x192", "256x256", "512x512")):
                score += 8
            if "favicon" in href.lower():
                score -= 16
            candidates.append(build_candidate(href, score, "link-icon", rel_text))

    for tag in soup.find_all(["img", "source"]):
        attrs = " ".join(f"{key}={value}" for key, value in tag.attrs.items()).lower()
        hint = LOGO_HINT_RE.search(attrs)
        base_score = 132 if hint else 72
        if tag.name == "source":
            base_score -= 8
        for attr_name in ("src", "data-src", "data-lazy-img", "data-original", "data-lazyload"):
            value = str(tag.get(attr_name) or "").strip()
            if value:
                candidates.append(build_candidate(value, base_score, "image-tag", attrs[:160]))
        for attr_name in ("srcset", "data-srcset"):
            for value in srcset_urls(tag.get(attr_name)):
                candidates.append(build_candidate(value, base_score + 4, "image-srcset", attrs[:160]))

    for svg in soup.find_all("svg"):
        attrs = " ".join(f"{key}={value}" for key, value in svg.attrs.items()).lower()
        if not LOGO_HINT_RE.search(attrs):
            continue
        svg_markup = str(svg)
        if "xmlns=" not in svg_markup:
            svg_markup = svg_markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
        candidates.append(build_candidate("", 172, "inline-svg", attrs[:160], inline_svg=svg_markup))

    for script in soup.find_all("script"):
        content = script.string or script.get_text(" ", strip=False)
        if not content or "logo" not in content.lower():
            continue
        normalized_content = content.replace("\\/", "/")
        for match in IMAGE_URL_RE.finditer(normalized_content):
            raw_url = match.group("url")
            window = normalized_content[max(match.start() - 140, 0) : min(match.end() + 140, len(normalized_content))].lower()
            score = 126 if "logo" in window else 92
            candidates.append(build_candidate(raw_url, score, "script-logo", window[:160]))

    normalized_html = html.replace("\\/", "/")
    for match in re.finditer(r'(logo|brand)[^<>\n\r]{0,280}', normalized_html, flags=re.I):
        window = match.group(0)
        for url_match in IMAGE_URL_RE.finditer(window):
            candidates.append(build_candidate(url_match.group("url"), 104, "html-logo-window", window[:160]))

    fallback_paths = [
        "/apple-touch-icon.png",
        "/apple-touch-icon-precomposed.png",
        "/android-chrome-512x512.png",
        "/android-chrome-192x192.png",
        "/favicon.ico",
    ]
    for path in fallback_paths:
        candidates.append(build_candidate(path, 78 if "favicon" not in path else 48, "conventional-fallback", path))

    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for candidate in candidates:
        dedupe_key = (candidate.get("inlineSvg") or "", candidate.get("rawUrl") or "")
        existing = deduped.get(dedupe_key)
        if existing is None or candidate["score"] > existing["score"]:
            deduped[dedupe_key] = candidate
    return sorted(deduped.values(), key=lambda item: item["score"], reverse=True)


def absolute_url_variants(raw_url: str, page_url: str, asset_hosts: list[str], asset_prefixes: list[str]) -> list[str]:
    value = str(raw_url or "").strip()
    if not value:
        return []
    if value.startswith("data:"):
        return [value]
    if value.startswith("//"):
        return [f"https:{value}"]
    if re.match(r"^https?://", value, flags=re.I):
        return [value]
    variants = [urljoin(page_url, value)]
    if value.startswith("/"):
        return list(dict.fromkeys(variants))
    leading_segment = value.split("/", 1)[0].lower()
    for prefix in asset_prefixes[:8]:
        if leading_segment in {"jfs", "babel", "imagetools", "static", "images"}:
            variants.append(urljoin(prefix, value))
    for host in asset_hosts[:8]:
        if not host:
            continue
        variants.append(f"https://{host}/{value.lstrip('/')}")
    return list(dict.fromkeys(variants))


def fetch_asset_from_candidate(
    session: requests.Session,
    candidate: dict[str, Any],
    page_url: str,
    asset_hosts: list[str],
    asset_prefixes: list[str],
) -> dict[str, Any] | None:
    inline_svg = str(candidate.get("inlineSvg") or "")
    if inline_svg:
        content = inline_svg.encode("utf-8")
        width, height = parse_svg_dimensions(inline_svg)
        return {
            "url": page_url,
            "mime": "image/svg+xml",
            "content": content,
            "width": width,
            "height": height,
            "score": candidate["score"] + 52,
            "sourceKind": candidate["sourceKind"],
            "context": candidate.get("context") or "",
        }

    best_result: dict[str, Any] | None = None
    for variant in absolute_url_variants(candidate.get("rawUrl") or "", page_url, asset_hosts, asset_prefixes):
        try:
            response = session.get(variant, timeout=10, headers=REQUEST_HEADERS)
        except Exception:
            continue
        if response.status_code >= 400:
            continue
        content = response.content or b""
        if not content or len(content) > 5_500_000:
            continue
        mime = detect_mime(content, response.headers.get("content-type") or "", str(response.url))
        if not mime.startswith("image/"):
            continue
        width, height = detect_dimensions(content, mime)
        if width <= 0 or height <= 0:
            continue
        if max(width, height) < 24:
            continue
        quality_bonus = 0
        if mime == "image/svg+xml":
            quality_bonus += 42
        if max(width, height) >= 512:
            quality_bonus += 24
        elif max(width, height) >= 256:
            quality_bonus += 14
        elif max(width, height) >= 128:
            quality_bonus += 8
        if "favicon" in str(response.url).lower() or mime == "image/x-icon":
            quality_bonus -= 18
        if LOGO_HINT_RE.search(str(response.url).lower()):
            quality_bonus += 10
        result = {
            "url": str(response.url),
            "mime": mime,
            "content": content,
            "width": width,
            "height": height,
            "score": candidate["score"] + quality_bonus,
            "sourceKind": candidate["sourceKind"],
            "context": candidate.get("context") or "",
        }
        if best_result is None or result["score"] > best_result["score"]:
            best_result = result
    return best_result


def resolve_logo_from_website(session: requests.Session, website_url: str) -> dict[str, Any] | None:
    response = session.get(website_url, timeout=20, headers=REQUEST_HEADERS)
    response.raise_for_status()
    html = response.text
    page_url = str(response.url)
    asset_hosts = extract_asset_hosts(page_url, html)
    asset_prefixes = extract_asset_prefixes(html)
    best_asset: dict[str, Any] | None = None
    for candidate in collect_logo_candidates(page_url, html)[:24]:
        asset = fetch_asset_from_candidate(session, candidate, page_url, asset_hosts, asset_prefixes)
        if asset is None:
            continue
        if best_asset is None or asset["score"] > best_asset["score"]:
            best_asset = asset
        if best_asset and best_asset["score"] >= 170 and best_asset["mime"] == "image/svg+xml":
            break
    return best_asset


def wikidata_entity_website(session: requests.Session, entity_id: str) -> str:
    response = session.get(
        "https://www.wikidata.org/w/api.php",
        params={
            "action": "wbgetentities",
            "format": "json",
            "ids": entity_id,
            "languages": "en|zh",
            "props": "claims|labels|descriptions|aliases",
        },
        headers=REQUEST_HEADERS,
        timeout=20,
    )
    response.raise_for_status()
    entity = (response.json().get("entities") or {}).get(entity_id) or {}
    claims = entity.get("claims") or {}
    website_claims = claims.get("P856") or []
    for claim in website_claims:
        datavalue = (((claim.get("mainsnak") or {}).get("datavalue") or {}).get("value"))
        website = str(datavalue or "").strip()
        if website:
            return website
    return ""


def score_wikidata_result(company: dict[str, Any], result: dict[str, Any]) -> int:
    label = str(result.get("label") or "")
    description = str(result.get("description") or "")
    label_key = squash_text(label)
    description_key = squash_text(description)
    names = [squash_text(company.get("nameEn")), squash_text(company.get("nameZh")), squash_text(company.get("slug"))]
    ticker = squash_text(company.get("ticker"))
    score = 0
    for name in names:
        if not name:
            continue
        if label_key == name:
            score += 120
        elif name and (name in label_key or label_key in name):
            score += 64
        elif name and name in description_key:
            score += 18
    if ticker and ticker in (label_key + description_key):
        score += 22
    if any(token in description.lower() for token in ("company", "corporation", "holding", "group", "bank", "technology", "retail", "e-commerce")):
        score += 10
    return score


def resolve_website_via_wikidata(session: requests.Session, company: dict[str, Any]) -> tuple[str, str]:
    queries = []
    for value in (
        company.get("nameEn"),
        f"{company.get('nameEn') or ''} {company.get('ticker') or ''}".strip(),
        f"{company.get('nameEn') or ''} company".strip(),
        company.get("nameZh"),
        company.get("slug"),
    ):
        value = str(value or "").strip()
        if value and value not in queries:
            queries.append(value)
    best_choice: tuple[int, str] | None = None
    for query in queries[:5]:
        response = session.get(
            "https://www.wikidata.org/w/api.php",
            params={
                "action": "wbsearchentities",
                "format": "json",
                "language": "en",
                "type": "item",
                "limit": 5,
                "search": query,
            },
            headers=REQUEST_HEADERS,
            timeout=20,
        )
        response.raise_for_status()
        results = response.json().get("search") or []
        for result in results:
            score = score_wikidata_result(company, result)
            if score <= 0:
                continue
            entity_id = str(result.get("id") or "")
            if not entity_id:
                continue
            if best_choice is None or score > best_choice[0]:
                best_choice = (score, entity_id)
        if best_choice and best_choice[0] >= 120:
            break
    if not best_choice:
        return "", ""
    website = wikidata_entity_website(session, best_choice[1])
    return website, "wikidata"


def score_search_result(company: dict[str, Any], href: str, title: str) -> int:
    host = normalize_domain(href)
    if not host or looks_blocked_host(host):
        return -1
    title_key = squash_text(title)
    score = 0
    for value in (company.get("nameEn"), company.get("slug"), company.get("nameZh")):
        key = squash_text(value)
        if not key:
            continue
        if key in title_key:
            score += 48
        if key and key in squash_text(host):
            score += 36
    ticker = squash_text(company.get("ticker"))
    if ticker and ticker in title_key:
        score += 12
    if any(token in title.lower() for token in ("official", "homepage", "investor relations", "group", "inc", "holdings")):
        score += 8
    return score


def resolve_website_via_search(session: requests.Session, company: dict[str, Any]) -> tuple[str, str]:
    search_terms = [
        f"{company.get('nameEn') or company.get('ticker') or ''} official website".strip(),
        f"{company.get('nameEn') or company.get('ticker') or ''} official site".strip(),
    ]
    best_match: tuple[int, str] | None = None
    for query in search_terms:
        if not query:
            continue
        response = session.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers=REQUEST_HEADERS,
            timeout=20,
        )
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        for link in soup.select("a.result__a"):
            href = str(link.get("href") or "").strip()
            if not href:
                continue
            parsed = urlparse(href)
            if "duckduckgo.com" in parsed.netloc and parsed.query:
                href = unquote((parse_qs(parsed.query).get("uddg") or [""])[0])
            score = score_search_result(company, href, link.get_text(" ", strip=True))
            if score < 0:
                continue
            if best_match is None or score > best_match[0]:
                best_match = (score, href)
        if best_match and best_match[0] >= 48:
            break
    return (best_match[1], "duckduckgo-search") if best_match else ("", "")


def resolve_official_website(session: requests.Session, company: dict[str, Any], catalog: dict[str, Any]) -> tuple[str, str]:
    for value in (company.get("website"), company.get("domain")):
        domain = normalize_domain(value)
        if domain:
            return website_from_domain(domain), "company-input"

    canonical_key = normalize_logo_key(company.get("id"))
    existing = (catalog.get("logos") or {}).get(canonical_key) or {}
    existing_domain = normalize_domain(existing.get("domain"))
    if existing_domain:
        return website_from_domain(existing_domain), "catalog"

    website, source = resolve_website_via_wikidata(session, company)
    if website:
        return website, source
    website, source = resolve_website_via_search(session, company)
    if website:
        return website, source
    return "", ""


def ensure_logo_catalog_entry(company: dict[str, Any], refresh: bool = False) -> dict[str, Any] | None:
    canonical_key = normalize_logo_key(company.get("id") or company.get("slug") or company.get("ticker"))
    if not canonical_key:
        return None

    catalog = load_logo_catalog()
    logos = catalog.setdefault("logos", {})
    existing = logos.get(canonical_key)
    alias_changed = merge_aliases(catalog, canonical_key, company_alias_keys(company, normalize_domain((existing or {}).get("domain"))))
    if existing and catalog_entry_is_usable(existing) and not refresh:
        if alias_changed:
            save_logo_catalog(catalog)
        return existing

    session = requests.Session()
    session.headers.update(REQUEST_HEADERS)
    try:
        website_url, website_source = resolve_official_website(session, company, catalog)
    except Exception:
        website_url, website_source = "", ""
    if not website_url:
        if alias_changed:
            save_logo_catalog(catalog)
        return existing

    try:
        asset = resolve_logo_from_website(session, website_url)
    except Exception:
        asset = None
    if not asset_is_catalog_usable(asset):
        if alias_changed:
            save_logo_catalog(catalog)
        return existing

    domain = normalize_domain(website_url)
    entry = {
        "domain": domain,
        "website": website_url,
        "websiteSource": website_source,
        "sourceUrl": asset["url"],
        "sourceKind": asset["sourceKind"],
        "mime": asset["mime"],
        "dataUrl": encode_data_url(asset["mime"], asset["content"]),
        "width": int(asset["width"]),
        "height": int(asset["height"]),
        "qualityScore": int(asset.get("score") or 0),
    }
    logos[canonical_key] = entry
    merge_aliases(catalog, canonical_key, company_alias_keys(company, domain))
    save_logo_catalog(catalog)
    return entry


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Resolve an official company logo and persist it to data/logo-catalog.json")
    parser.add_argument("--company-id", default="", help="Stable company id")
    parser.add_argument("--ticker", required=True, help="Ticker symbol")
    parser.add_argument("--name-en", default="", help="English company name")
    parser.add_argument("--name-zh", default="", help="Chinese company name")
    parser.add_argument("--slug", default="", help="Slug")
    parser.add_argument("--website", default="", help="Optional official website")
    parser.add_argument("--domain", default="", help="Optional official domain")
    parser.add_argument("--refresh", action="store_true", help="Refresh even if the logo already exists")
    args = parser.parse_args()

    company = {
        "id": args.company_id or args.slug or args.ticker.lower(),
        "ticker": args.ticker,
        "nameEn": args.name_en,
        "nameZh": args.name_zh,
        "slug": args.slug or args.ticker.lower(),
        "website": args.website,
        "domain": args.domain,
    }
    entry = ensure_logo_catalog_entry(company, refresh=args.refresh)
    print(json.dumps(entry or {}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
