"""E2E offline playback tests using the Service Worker.

These tests verify that:
1. The app shell (HTML, CSS, JS) loads from the SW precache when offline.
2. The song list renders from the cached ``/api/songs`` response when offline.
3. Previously-loaded stem audio plays offline (SW CacheFirst for stems).

Test flow for each scenario:
    a. Navigate to the app (installs & activates the SW, warms all caches).
    b. Set the browser context offline.
    c. Reload the page.
    d. Assert the expected UI is visible / functional.

A fresh Playwright browser context is used per test so each test starts with a
clean SW registration.  The ``live_server`` session fixture provides the server
URL for all tests without restarting the server.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Browser, BrowserContext, Page, expect


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _wait_for_sw_ready(page: Page) -> None:
    """Block until the page's Service Worker is installed and controlling.

    Resolves ``navigator.serviceWorker.ready``, which settles only when a
    SW is active and controlling the page.  Also waits a short extra period
    for the SW to finish precaching all shell assets.
    """
    page.evaluate("() => navigator.serviceWorker.ready")
    # Give Workbox a moment to finish the precache install (network-bound).
    page.wait_for_timeout(3_000)


# ---------------------------------------------------------------------------
# App-shell offline test
# ---------------------------------------------------------------------------


class TestOfflineShell:
    """The app shell (HTML + JS + CSS) must load offline after one online visit."""

    @pytest.fixture()
    def fresh_context(self, browser: Browser, live_server: str) -> BrowserContext:
        """Yield a fresh browser context and ensure the SW is primed."""
        ctx = browser.new_context(base_url=live_server)
        yield ctx
        ctx.set_offline(False)
        ctx.close()

    def test_shell_loads_offline_after_online_visit(
        self, fresh_context: BrowserContext, live_server: str
    ) -> None:
        """Reload in offline mode must still show the app shell."""
        page = fresh_context.new_page()

        # First visit – registers SW and warms the precache.
        page.goto("/")
        _wait_for_sw_ready(page)
        expect(page.locator("h1")).to_contain_text("Bass Karaoke Player")

        # Go offline and reload.
        fresh_context.set_offline(True)
        page.reload()

        # App shell must still be visible (served from SW precache).
        expect(page.locator("h1")).to_contain_text("Bass Karaoke Player")

    def test_offline_badge_shown_when_api_unreachable(
        self, fresh_context: BrowserContext, live_server: str
    ) -> None:
        """The Offline badge must appear when the health endpoint is unreachable."""
        page = fresh_context.new_page()

        # Prime the SW cache with an online visit.
        page.goto("/")
        _wait_for_sw_ready(page)

        # Go offline and reload.
        fresh_context.set_offline(True)
        page.reload()

        # The useOnlineStatus hook will detect the API is unreachable and
        # surface the offline badge.
        expect(page.locator(".offline-badge")).to_be_visible(timeout=10_000)


# ---------------------------------------------------------------------------
# Song list offline test
# ---------------------------------------------------------------------------


class TestOfflineSongList:
    """The song list must render from the SW cache when the server is unreachable."""

    @pytest.fixture()
    def fresh_context(self, browser: Browser, live_server: str) -> BrowserContext:
        """Yield a fresh browser context and ensure the SW is primed."""
        ctx = browser.new_context(base_url=live_server)
        yield ctx
        ctx.set_offline(False)
        ctx.close()

    def test_song_list_visible_offline(
        self,
        fresh_context: BrowserContext,
        live_server: str,
        ready_song_id: str,
    ) -> None:
        """Song list must show cached songs when the API is offline."""
        page = fresh_context.new_page()

        # Online visit: load the song list and warm the /api/songs cache.
        page.goto("/")
        _wait_for_sw_ready(page)
        # Confirm the song list is populated while online.
        expect(page.locator(".song-item").first).to_be_visible()

        # Go offline and reload.
        fresh_context.set_offline(True)
        page.reload()

        # Song list must still render from the NetworkFirst SW cache.
        expect(page.locator(".song-item").first).to_be_visible(timeout=10_000)


# ---------------------------------------------------------------------------
# Stem playback offline test
# ---------------------------------------------------------------------------


class TestOfflineStemPlayback:
    """Previously-loaded stems must play offline via the SW CacheFirst cache."""

    @pytest.fixture()
    def fresh_context(self, browser: Browser, live_server: str) -> BrowserContext:
        """Yield a fresh browser context and ensure the SW is primed."""
        ctx = browser.new_context(base_url=live_server)
        yield ctx
        ctx.set_offline(False)
        ctx.close()

    def test_stems_play_offline_after_prior_load(
        self,
        fresh_context: BrowserContext,
        live_server: str,
        ready_song_id: str,
    ) -> None:
        """After loading a song once, stems must play offline on reload."""
        page = fresh_context.new_page()

        # Online visit: register SW and load a song to cache its stems.
        page.goto("/")
        _wait_for_sw_ready(page)

        song_item = page.locator(f'.song-item[data-id="{ready_song_id}"]')
        expect(song_item).to_be_visible()
        load_btn = song_item.locator(".btn-primary")
        load_btn.click()

        # Wait for the player to become visible (stems loaded).
        expect(page.locator("#player-section")).not_to_have_class(
            "card hidden", timeout=10_000
        )

        # Allow SW to finish caching all stem responses.
        page.wait_for_timeout(1_000)

        # Set offline and reload.
        fresh_context.set_offline(True)
        page.reload()

        # App shell must load from precache.
        expect(page.locator("h1")).to_contain_text("Bass Karaoke Player")

        # Song list must load from /api/songs cache.
        expect(page.locator(".song-item").first).to_be_visible(timeout=10_000)

        # Load the song again – stems come from SW cache (no network needed).
        song_item_offline = page.locator(f'.song-item[data-id="{ready_song_id}"]')
        expect(song_item_offline).to_be_visible(timeout=5_000)
        load_btn_offline = song_item_offline.locator(".btn-primary")
        load_btn_offline.click()

        # Player must become visible, confirming cached stems were decoded.
        expect(page.locator("#player-section")).not_to_have_class(
            "card hidden", timeout=15_000
        )
