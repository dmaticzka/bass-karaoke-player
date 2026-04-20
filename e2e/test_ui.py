"""E2E browser UI tests using Playwright's full browser automation.

These tests verify the frontend JavaScript behaviour: page load, song list
rendering, player section reveal, and stem card creation.  The ``page``
fixture (from pytest-playwright) provides a real Chromium page whose
``base_url`` is the live server started by ``conftest.py``.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from e2e.conftest import _TAGGED_ARTIST, _TAGGED_TITLE

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
    def test_ready_song_appears_in_list(self, page: Page, ready_song_id: str) -> None:
        page.goto("/")
        # The JS fetches /api/songs on load; wait for a real song-item to appear
        expect(page.locator(".song-item")).to_be_visible()

    def test_ready_song_shows_ready_badge(self, page: Page, ready_song_id: str) -> None:
        page.goto("/")
        expect(page.locator(".status-ready")).to_be_visible()

    def test_ready_song_has_load_button(self, page: Page, ready_song_id: str) -> None:
        page.goto("/")
        expect(page.locator(".song-item .btn-primary").first).to_be_visible()

    def test_refresh_button_present(self, page: Page) -> None:
        page.goto("/")
        expect(page.locator("#refresh-btn")).to_be_visible()

    def test_song_without_metadata_shows_unknown_artist(
        self, page: Page, ready_song_id: str
    ) -> None:
        """A song with no embedded tags must display 'Unknown Artist' and filename stem."""
        page.goto("/")
        song_item = page.locator(f'.song-item[data-id="{ready_song_id}"]')
        expect(song_item.locator(".song-artist")).to_have_text("Unknown Artist")
        expect(song_item.locator(".song-title")).to_have_text("test_song")

    def test_song_with_metadata_shows_artist_and_title(
        self, page: Page, ready_song_with_metadata_id: str
    ) -> None:
        """A song with embedded tags must display the correct artist and title."""
        page.goto("/")
        song_item = page.locator(f'.song-item[data-id="{ready_song_with_metadata_id}"]')
        expect(song_item.locator(".song-artist")).to_have_text(_TAGGED_ARTIST)
        expect(song_item.locator(".song-title")).to_have_text(_TAGGED_TITLE)


# ---------------------------------------------------------------------------
# Player
# ---------------------------------------------------------------------------


class TestPlayerSection:
    @pytest.fixture()
    def loaded_player(self, page: Page, ready_song_id: str) -> Page:
        """Navigate to the app and click Load on the *ready_song_id* song."""
        page.goto("/")
        # Target the specific song row by data-id to be robust when
        # multiple songs are present in the test session data directory.
        song_item = page.locator(f'.song-item[data-id="{ready_song_id}"]')
        load_btn = song_item.locator(".btn-primary")
        expect(load_btn).to_be_visible()
        load_btn.click()
        return page

    def test_player_becomes_visible(self, loaded_player: Page) -> None:
        player = loaded_player.locator("#player-section")
        expect(player).not_to_have_class("card hidden")
        expect(player).to_be_visible()

    def test_player_title_shows_filename_stem_without_metadata(
        self, loaded_player: Page
    ) -> None:
        """Without embedded tags, the title falls back to the filename stem."""
        title = loaded_player.locator("#player-title")
        expect(title.locator(".song-artist")).to_have_text("Unknown Artist")
        # Filename is test_song.mp3 → title fallback strips the extension
        expect(title.locator(".song-title")).to_have_text("test_song")

    def test_player_title_shows_metadata_when_available(
        self, page: Page, ready_song_with_metadata_id: str
    ) -> None:
        """When a song has embedded tags the player title shows artist and title."""
        page.goto("/")
        song_item = page.locator(f'.song-item[data-id="{ready_song_with_metadata_id}"]')
        load_btn = song_item.locator(".btn-primary")
        expect(load_btn).to_be_visible()
        load_btn.click()
        title = page.locator("#player-title")
        expect(title.locator(".song-artist")).to_have_text(_TAGGED_ARTIST)
        expect(title.locator(".song-title")).to_have_text(_TAGGED_TITLE)

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
        """Navigate to the app, load the ready song, then open the EQ tab."""
        page.goto("/")
        song_item = page.locator(f'.song-item[data-id="{ready_song_id}"]')
        load_btn = song_item.locator(".btn-primary")
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
