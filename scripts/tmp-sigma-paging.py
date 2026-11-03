"""How does Sigma's /en/search paginate — numbered buttons or infinite scroll?"""
import sys

sys.path.insert(0, "scripts")
import sigma_worker as w
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    context = browser.new_context(user_agent=w.UA, locale="en-US", viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    w.open_listing(page)

    print("cards page 1:", len(page.evaluate(w.EXTRACT_JS)))

    controls = page.evaluate(
        """() => [...document.querySelectorAll('button,a')]
             .map(e => ({ text: (e.innerText||'').trim().slice(0,20), aria: e.getAttribute('aria-label') }))
             .filter(c => c.text || c.aria)
             .slice(-30)"""
    )
    print("controls:", controls)

    # Scroll to the bottom repeatedly — infinite scroll?
    for i in range(3):
        page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(3000)
        print(f"after scroll {i + 1}: {len(page.evaluate(w.EXTRACT_JS))} cards")

    browser.close()
