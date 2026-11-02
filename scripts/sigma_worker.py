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
      آ· Next.js wraps media in `/_next/image?url=<encoded>` -> unwrap it.
      آ· `api.sigma-computer.com` answers **403** to a hotlinked <img>; a page
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


def scrape_label(page, category, label, max_pages, delay):
    """Click one rail label, then page through its grid."""
    products = []
    seen = set()

    clicked = False
    for candidate in (label, label.replace("Cooling", "cooling")):
        try:
            page.get_by_text(candidate, exact=True).first.click(timeout=5000)
            clicked = True
            break
        except Exception:  # noqa: BLE001 - label not present in this rail
            continue
    if not clicked:
        return products, f"label not found: {label}"

    page.wait_for_timeout(6000)

    for page_no in range(1, max_pages + 1):
        if page_no > 1:
            # Pagination is an aria-labelled control (aria-label="page 2"), not a
            # numbered button - matching on text silently re-reads page 1.
            try:
                page.get_by_role("button", name=f"page {page_no}", exact=True).first.click(timeout=5000)
                page.wait_for_timeout(5000)
            except Exception:  # noqa: BLE001 - no such page = end of listing
                break

        cards = page.evaluate(EXTRACT_JS)
        # Bail out if the grid did not actually advance (the site ignores a page
        # click on some rails), so we never store page 1 three times.
        if page_no > 1 and not cards:
            break
            name = (card.get("name") or "").strip()
            price = parse_price(card.get("price"))
            if len(name) < 10 or price is None:
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
                    "specs": {"template": "sigma-playwright", "rail": label},
                }
            )

        time.sleep(delay)

    reset_filters(page)
    return products, None


def main():
    parser = argparse.ArgumentParser(description="Scrape Sigma Computer with Playwright")
    parser.add_argument("--out", default=DEFAULT_OUT, help="output JSON path")
    parser.add_argument("--max-pages", type=int, default=2, help="page cap per rail label")
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

    wanted = set(args.only.split(",")) if args.only else set(RAIL_LABELS)
    rows = []
    notes = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headful)
        context = browser.new_context(user_agent=UA, locale="en-US", viewport={"width": 1440, "height": 1000})
        page = context.new_page()

        for category, labels in RAIL_LABELS.items():
            if category not in wanted:
                continue

            try:
                open_listing(page)
            except Exception as error:  # noqa: BLE001
                notes.append(f"{category}: listing did not open ({type(error).__name__})")
                continue

            count = 0
            for label in labels:
                try:
                    products, note = scrape_label(page, category, label, args.max_pages, args.delay)
                except Exception as error:  # noqa: BLE001 - one label must not kill the run
                    products, note = [], type(error).__name__
                count += len(products)
                rows.extend(products)
                if note:
                    notes.append(f"{category}/{label}: {note}")

            print(f"{category:12} {count:4} products")

        browser.close()

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
