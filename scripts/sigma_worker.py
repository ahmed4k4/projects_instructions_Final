"""Sigma Computer scraper - Playwright worker.

WHY A SEPARATE WORKER
    Sigma is a Next.js App Router storefront whose catalogue is rendered from
    React Server Components. The served HTML carries no product markup, no
    JSON-LD, and its own API (`api.sigma-computer.com/api/stores/v1/products`)
    answers 403 Unauthorized. A headless browser that renders the page is the
    only reliable source of names, prices and images.

    A headless browser cannot run inside a serverless function (Vercel or
    Supabase Edge), so this worker runs on a schedule somewhere else and writes
    a JSON file the app reads as a fallback:

        python scripts/sigma_worker.py --out public/data/sigma_products.json

    The app fetches `public/data/sigma_products.json` when Supabase has no
    Sigma rows (see `src/services/retailers/sigmaFeed.ts`). Nothing in the
    browser scrapes.

WHAT WAS MEASURED (2026-11-02)
    /en/category/<slug>                    -> rewrites to a search page that
                                              renders the generic error state
    /en/search?filters={"category_id":[..]} -> same error state
    /en/search                              -> a real, paginated grid   <-- used
    The grid is filtered by clicking a leaf label in the category rail
    ("Nvidia GeForce", "AMD CPU", ...), which is how a shopper narrows it.

POLITENESS
    one page at a time, --delay seconds apart (2.5 s default), an identifying
    User-Agent, a hard page cap. It refuses to invent prices: a card without a
    name and an exact "N NNN EGP" price is dropped, and an empty run is written
    as `status: "blocked"` rather than silently reporting zero.

Usage
    python scripts/sigma_worker.py
    python scripts/sigma_worker.py --only gpu,cpu --max-pages 2 --headful
    node scripts/snapshot-retailers.mjs --from public/data/sigma_products.json

Exit codes
    0  products written
    1  no products found (blocked / markup changed) - the file still says why
    2  Playwright is not installed
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

BASE = "https://sigma-computer.com"
SEARCH = f"{BASE}/en/search"
DEFAULT_OUT = os.path.join("public", "data", "sigma_products.json")

# ASCII only: a Windows console defaults to cp1252 and chokes on typography.
UA = "NexusPCBuilderBot/1.0 (+https://nexus-pc-builder.example/bot)"

# Products that are NOT PC components. Sigma's rail mixes accessories into the
# hardware categories (a 149 EGP mouse appeared under "Nvidia GeForce"), and a
# mouse in a GPU comparison is a wrong price for a GPU.
ACCESSORY_RE = re.compile(
    r"\b(mouse|mice|keyboard|headset|headphone|earbuds|speaker|webcam|microphone|"
    r"gamepad|controller|chair|desk|monitor|laptop|tablet|printer|router|cable|"
    r"adapter|hub|dock|bag|stand|tripod)\b",
    re.I,
)

# Name-based category, used to CORRECT the rail label (Sigma's rails overlap).
NAME_CATEGORY = (
    ("cpu", re.compile(r"\b(cpu|processor|ryzen|core i[3579]|core ultra|threadripper|xeon)\b", re.I)),
    ("psu", re.compile(r"\b(psu|power supply|\d{3,4}\s?w\b|80\s?plus|modular)\b", re.I)),
    ("gpu", re.compile(r"\b(gpu|graphics card|geforce|radeon|rtx|gtx|arc a\d|vga)\b", re.I)),
    ("motherboard", re.compile(r"\b(motherboard|mainboard|b650|x670|z790|b760|a620|chipset)\b", re.I)),
    ("storage", re.compile(r"\b(nvme|ssd|hdd|hard drive|solid state)\b", re.I)),
    ("ram", re.compile(r"\b(ddr[345]|dimm|memory kit)\b", re.I)),
    ("case", re.compile(r"\b(case|chassis|tower)\b", re.I)),
    ("cooling", re.compile(r"\b(cooler|aio|liquid cooling|heatsink|fan)\b", re.I)),
)


def category_of_name(name):
    """Best-guess category from the product NAME, or None when unclear."""
    for category, pattern in NAME_CATEGORY:
        if pattern.search(name):
            return category
    return None

# A printed price on a product card.
PRICE_RE = re.compile(r"(\d[\d,]{2,})\s*(?:EGP|\.E|L\.E)", re.I)

# Model identifiers, used only as a fallback id when the URL carries none.
SKU_RE = re.compile(r"\b(?:9S7|83[A-Z]{2}\d|GV-N|RTX|RX|B\d{3}|X\d{3}|Z\d{3})[A-Z0-9-]*\b", re.I)

# Image URLs that are store chrome, not product photos.
PLACEHOLDER_IMG = re.compile(r"(placeholder|no_image|noimage|spacer|blank|logo|curv|footer)", re.I)

# Catalogue category -> Sigma rail labels. Measured on the live site: these are
# the exact leaf entries in the "Categories" filter (2026-11-02).
RAIL_LABELS = {
    "gpu": ["Nvidia GeForce", "AMD RADEON"],
    "cpu": ["AMD CPU", "Intel CPU"],
    "motherboard": ["AMD Motherboard", "Intel Motherboard"],
    "ram": ["PC Memory", "Laptop Memory"],
    "storage": ["Internal SSD", "Internal HDD", "External SSD"],
    "psu": ["Full modular", "Non modular"],
    "case": ["Case", "Mid Tower", "Mini Tower", "Full Tower"],
    "cooling": ["AIR Cooler", "Liquid Cooler", "Fans"],
}

# One rendered card: an "/en/item?id=..." anchor (name), a price <p>, an image.
EXTRACT_JS = r"""
() => {
  const PRICE = /^(\d[\d,]*)\s*EGP$/i;
  const priceEls = [...document.querySelectorAll('p')].filter((el) => PRICE.test((el.innerText || '').trim()));
  const cards = [];
  for (const priceEl of priceEls) {
    let card = priceEl;
    for (let i = 0; i < 6 && card.parentElement; i += 1) {
      card = card.parentElement;
      if (card.querySelector('a[href*="/en/item"]') && card.querySelector('img')) break;
    }
    const link = card.querySelector('a[href*="/en/item"]');
    const img = card.querySelector('img');
    if (!link) continue;
    cards.push({
      name: (link.innerText || '').trim(),
      href: link.getAttribute('href'),
      price: priceEl.innerText.trim(),
      image: img ? img.getAttribute('src') : null,
      text: (card.innerText || '').slice(0, 400),
    });
  }
  return cards;
}
"""

PAGINATION_JS = r"""
() => [...document.querySelectorAll('button')]
  .filter((b) => /^\d+$/.test((b.innerText || '').trim()))
  .map((b) => Number((b.innerText || '').trim()))
"""


def parse_price(raw):
    match = re.search(r"(\d[\d,]*)", raw or "")
    if not match:
        return None
    value = float(match.group(1).replace(",", ""))
    return value if value > 100 else None  # a 1 EGP card is a placeholder, not a price


def absolute(url):
    if not url:
        return None
    return url if url.startswith("http") else BASE + url


def real_image(src):
    """Return an image URL a browser can actually load.

    Two problems, both measured:
      · Next.js wraps media in `/_next/image?url=<encoded>` -> unwrap it.
      · `api.sigma-computer.com` answers **403** to a hotlinked <img>; a page
        request (which does carry a Referer) gets 200. A browser cannot set a
        Referer on an image, so the URL is emitted through the site's own image
        proxy, which serves the media for us.
    """
    if not src:
        return None

    if "/_next/image" in src and "url=" in src:
        from urllib.parse import parse_qs, quote, urlparse

        query = parse_qs(urlparse(src).query)
        inner = (query.get("url") or [None])[0]
        if not inner:
            return None
        return f"{BASE}/_next/image?url={quote(inner, safe='')}&w=384&q=75"

    url = absolute(src)
    if url and "api.sigma-computer.com" in url:
        from urllib.parse import quote

        return f"{BASE}/_next/image?url={quote(url, safe='')}&w=384&q=75"

    return url


def open_listing(page):
    page.goto(SEARCH, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(7000)
    for _ in range(3):
        if page.query_selector('p:text-matches("^\\\\d[\\\\d,]* EGP$")'):
            return
        page.wait_for_timeout(3000)


def reset_filters(page):
    try:
        page.get_by_text("Reset", exact=True).first.click(timeout=4000)
        page.wait_for_timeout(4000)
    except Exception:  # noqa: BLE001 - no filters selected yet
        pass


def expand_rail(page):
    """Open the collapsed sub-menus in the category rail.

    The leaf labels shipped at `opacity-50` and a click on them does nothing
    until their section is expanded — measured: clicking "Nvidia GeForce" left
    the grid byte-identical, which is why every category reported 0 products.
    """
    for section in ("Hardware Components", "PC Components", "Components"):
        try:
            header = page.get_by_text(section, exact=True).first
            if header.count() == 0:
                continue
            header.click(timeout=3000)
            page.wait_for_timeout(1500)
            return True
        except Exception:  # noqa: BLE001 - try the next candidate
            continue
    return False


def scrape_listing(page, max_pages, delay):
    """Page through /en/search once and classify every card by its NAME.

    The category rail is NOT usable: its leaf items are inert `<p>` elements —
    clicking "Nvidia GeForce" leaves the grid byte-identical (measured). The
    listing itself shows every product, so one pass plus `category_of_name()`
    covers all eight categories, and accessories are dropped rather than filed
    under whichever rail happened to be open.
    """
    products = []
    seen = set()

    for page_no in range(1, max_pages + 1):
        if page_no > 1:
            before = {(c.get("href") or "") for c in page.evaluate(EXTRACT_JS)}
            try:
                page.get_by_role("button", name=f"page {page_no}", exact=True).first.click(timeout=5000)
                page.wait_for_timeout(5000)
            except Exception:  # noqa: BLE001 - no such page = end of listing
                break

            # The grid APPENDS rather than replacing, so the check is "did any NEW
            # card arrive" — comparing whole sets treated append as 'no change'
            # and stopped the crawl at page 1.
            after = {(c.get("href") or "") for c in page.evaluate(EXTRACT_JS)}
            if not (after - before):
                break

        added = 0
        for card in page.evaluate(EXTRACT_JS):
            name = (card.get("name") or "").strip()
            price = parse_price(card.get("price"))
            if len(name) < 10 or price is None:
                continue

            # Accessories are not components: never publish a mouse as a GPU.
            if ACCESSORY_RE.search(name):
                continue

            category = category_of_name(name)
            # No component word in the name means it is not a PC part we model.
            if category is None:
                continue

            key = (name[:70], price)
            if key in seen:
                continue
            seen.add(key)

            href = absolute(card.get("href"))
            products.append(
                {
                    "retailerId": "sigma",
                    "externalId": (href or "").split("id=")[-1][:120] or name[:60],
                    "name": name,
                    "category": category,
                    "priceEgp": price,
                    "originalPriceEgp": None,
                    "stockStatus": "in_stock",
                    "productUrl": href or SEARCH,
                    "imageUrl": real_image(card.get("image")),
                    "specs": {"template": "sigma-playwright"},
                }
            )
            added += 1

        print(f"  page {page_no:2}: {added:3} components")
        if added == 0 and page_no > 1:
            break
        time.sleep(delay)

    return products


def main():
    parser = argparse.ArgumentParser(description="Scrape Sigma Computer with Playwright")
    parser.add_argument("--out", default=DEFAULT_OUT, help="output JSON path")
    parser.add_argument("--max-pages", type=int, default=40, help="page cap for /en/search")
    parser.add_argument("--delay", type=float, default=2.5, help="seconds between pages")
    parser.add_argument("--only", default=None, help="comma separated categories (gpu,cpu,...)")
    parser.add_argument("--headful", action="store_true", help="show the browser")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "playwright is not installed.\n"
            "  pip install playwright && python -m playwright install chromium",
            file=sys.stderr,
        )
        return 2

    wanted = set(args.only.split(",")) if args.only else None
    rows = []
    notes = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headful)
        context = browser.new_context(user_agent=UA, locale="en-US", viewport={"width": 1440, "height": 1000})
        page = context.new_page()

        try:
            open_listing(page)
            rows = scrape_listing(page, args.max_pages, args.delay)
        except Exception as error:  # noqa: BLE001
            notes.append(f"listing did not open: {type(error).__name__}")

        browser.close()

    if wanted:
        rows = [row for row in rows if row["category"] in wanted]

    counts = {}
    for row in rows:
        counts[row["category"]] = counts.get(row["category"], 0) + 1
    for category, count in sorted(counts.items()):
        print(f"{category:12} {count:4} products")

    payload = {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "source": "scripts/sigma_worker.py",
        "retailer": "sigma",
        "status": "ok" if rows else "blocked",
        "notes": notes,
        "retailers": ["sigma"],
        "products": rows,
    }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    with_images = sum(1 for row in rows if row.get("imageUrl"))
    print(f"\n{len(rows)} products ({with_images} with images) -> {args.out}")
    if not rows:
        print("No products parsed. Sigma may have changed its markup or blocked the bot.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
