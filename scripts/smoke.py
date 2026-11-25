# Local smoke test: open a built app, collect console errors, screenshot phone and desktop.
# Usage: python3 scripts/smoke.py <app> [--seed] [hash ...]
import sys, asyncio, pathlib
from playwright.async_api import async_playwright

app = sys.argv[1]
args = sys.argv[2:]
seed = "--seed" in args
hashes = [a for a in args if a != "--seed"] or ["log"]
root = pathlib.Path(__file__).resolve().parent.parent
url = (root / "dist" / "index.html").as_uri()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errors = []
        for name, vp in [("phone", {"width": 390, "height": 844}), ("desktop", {"width": 1280, "height": 860})]:
            ctx = await b.new_context(viewport=vp)
            if seed:
                await ctx.add_init_script(path=str(root / "scripts" / f"seed-{app}.js"))
            page = await ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            for h in hashes:
                await page.goto(f"{url}#{h}")
                await page.wait_for_timeout(900)
                await page.screenshot(path=f"/tmp/shots/{app}-{name}-{h}.png", full_page=False)
            await ctx.close()
        await b.close()
        print("errors:", errors or "none")

asyncio.run(main())
