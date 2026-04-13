"""E2E browser UI tests using Playwright's full browser automation.

These tests verify the frontend JavaScript behaviour: page load, song list
rendering, player section reveal, and stem card creation.  The ``page``
fixture (from pytest-playwright) provides a real Chromium page whose
``base_url`` is the live server started by ``conftest.py``.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect


# ---------------------------------------------------------------------------
# Page load
# ---------------------------------------------------------------------------


class TestPageLoad:
    def test_title_is_correct(self, page: Page) -> None:
        page.goto("/")
        expect(page).to_have_title("Bass Karaoke Player")

    def test_header_text_visible(self, page: Page) -> None:
        page.goto("/")
        # The <h1> has the emoji prefix "🎵 Bass Karaoke Player"
        expect(page.locator("h1")).to_contain_text("Bass Karaoke Player")

    def test_upload_section_visible(self, page: Page) -> None:
        page.goto("/")
        expect(page.locator("#browse-btn")).to_be_visible()
        expect(page.locator("#drop-zone")).to_be_visible()

    def test_player_hidden_initially(self, page: Page) -> None:
        page.goto("/")
        player = page.locator("#player-section")
        # The player section starts with class "card hidden"
        expect(player).to_have_class("card hidden")

    def test_pitch_slider_present(self, page: Page) -> None:
        page.goto("/")
        expect(page.locator("#pitch-slider")).to_be_attached()

    def test_tempo_slider_present(self, page: Page) -> None:
        page.goto("/")
        expect(page.locator("#tempo-slider")).to_be_attached()


# ---------------------------------------------------------------------------
# Song list
# ---------------------------------------------------------------------------


class TestSongList:
    def test_ready_song_appears_in_list(
        self, page: Page, ready_song_id: str
    ) -> None:
        page.goto("/")
        # The JS fetches /api/songs on load; wait for a real song-item to appear
        expect(page.locator(".song-item")).to_be_visible()

    def test_ready_song_shows_ready_badge(
        self, page: Page, ready_song_id: str
    ) -> None:
        page.goto("/")
        expect(page.locator(".status-ready")).to_be_visible()

    def test_ready_song_has_load_button(
        self, page: Page, ready_song_id: str
    ) -> None:
        page.goto("/")
        expect(page.locator(".song-item .btn-primary").first).to_be_visible()

    def test_refresh_button_present(self, page: Page) -> None:
        page.goto("/")
        expect(page.locator("#refresh-btn")).to_be_visible()


# ---------------------------------------------------------------------------
# Player
# ---------------------------------------------------------------------------


class TestPlayerSection:
    @pytest.fixture()
    def loaded_player(self, page: Page) -> Page:
        """Navigate to the app and click Load on the ready song."""
        page.goto("/")
        # Wait for the song list to render and click the first Load button
        load_btn = page.locator(".song-item .btn-primary").first
        expect(load_btn).to_be_visible()
        load_btn.click()
        return page

    def test_player_becomes_visible(self, loaded_player: Page) -> None:
        player = loaded_player.locator("#player-section")
        expect(player).not_to_have_class("card hidden")
        expect(player).to_be_visible()

    def test_player_title_shows_filename(self, loaded_player: Page) -> None:
        title = loaded_player.locator("#player-title")
        expect(title).to_have_text("test_song.mp3")

    def test_stem_cards_created(self, loaded_player: Page) -> None:
        # Four stem cards should be created for the ready song
        expect(loaded_player.locator(".stem-card")).to_have_count(4)

    def test_playback_controls_visible(self, loaded_player: Page) -> None:
        expect(loaded_player.locator("#play-pause-btn")).to_be_visible()
        expect(loaded_player.locator("#stop-btn")).to_be_visible()

    def test_pitch_and_tempo_controls_visible(self, loaded_player: Page) -> None:
        expect(loaded_player.locator("#pitch-slider")).to_be_visible()
        expect(loaded_player.locator("#tempo-slider")).to_be_visible()
        expect(loaded_player.locator("#apply-btn")).to_be_visible()
        expect(loaded_player.locator("#reset-btn")).to_be_visible()


# ---------------------------------------------------------------------------
# Equalizer
# ---------------------------------------------------------------------------


class TestEqualizer:
    @pytest.fixture()
    def eq_panel(self, page: Page, ready_song_id: str) -> Page:
        """Navigate to the app, load a song, then open the EQ tab."""
        page.goto("/")
        load_btn = page.locator(".song-item .btn-primary").first
        expect(load_btn).to_be_visible()
        load_btn.click()
        # Navigate to the EQ tab via BottomNav
        eq_tab = page.locator(".bottom-nav-tab", has_text="EQ")
        expect(eq_tab).to_be_visible()
        eq_tab.click()
        return page

    def test_eq_section_visible(self, eq_panel: Page) -> None:
        expect(eq_panel.locator("#eq-section")).to_be_visible()

    def test_eq_has_five_band_sliders(self, eq_panel: Page) -> None:
        expect(eq_panel.locator(".eq-slider")).to_have_count(5)

    def test_eq_preset_selector_present(self, eq_panel: Page) -> None:
        expect(eq_panel.locator(".eq-preset-select")).to_be_visible()


# ---------------------------------------------------------------------------
# Mobile navigation
# ---------------------------------------------------------------------------


class TestBottomNav:
    def test_bottom_nav_visible(self, page: Page) -> None:
        page.goto("/")
        expect(page.locator(".bottom-nav")).to_be_visible()

    def test_library_tab_active_initially(self, page: Page) -> None:
        page.goto("/")
        library_tab = page.locator(".bottom-nav-tab.active")
        expect(library_tab).to_contain_text("Library")

    def test_player_tab_disabled_without_song(self, page: Page) -> None:
        page.goto("/")
        player_tab = page.locator(".bottom-nav-tab.disabled", has_text="Player")
        expect(player_tab).to_be_visible()
