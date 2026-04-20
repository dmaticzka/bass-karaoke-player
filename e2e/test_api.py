"""E2E API tests using Playwright's headless APIRequestContext.

All tests use the session-scoped ``api_context`` fixture (no real browser),
which resolves relative URLs against the live server's ``base_url``.
"""

from __future__ import annotations

from playwright.sync_api import APIRequestContext

from e2e.conftest import _TAGGED_ARTIST, _TAGGED_TITLE

# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class TestHealth:
    def test_returns_ok(self, api_context: APIRequestContext) -> None:
        resp = api_context.get("/api/health")
        assert resp.ok
        assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Song list
# ---------------------------------------------------------------------------


class TestSongList:
    def test_list_contains_ready_song(
        self, api_context: APIRequestContext, ready_song_id: str
    ) -> None:
        resp = api_context.get("/api/songs")
        assert resp.ok
        ids = [s["id"] for s in resp.json()["songs"]]
        assert ready_song_id in ids

    def test_list_response_schema(self, api_context: APIRequestContext) -> None:
        resp = api_context.get("/api/songs")
        assert resp.ok
        body = resp.json()
        assert "songs" in body
        assert isinstance(body["songs"], list)


# ---------------------------------------------------------------------------
# Get song
# ---------------------------------------------------------------------------


class TestGetSong:
    def test_get_ready_song_fields(
        self, api_context: APIRequestContext, ready_song_id: str
    ) -> None:
        resp = api_context.get(f"/api/songs/{ready_song_id}")
        assert resp.ok
        data = resp.json()
        assert data["id"] == ready_song_id
        assert data["status"] == "ready"
        assert set(data["stems"]) == {"vocals", "bass", "drums", "other"}

    def test_get_ready_song_has_artist_and_title_fields(
        self, api_context: APIRequestContext, ready_song_id: str
    ) -> None:
        """Song response must always include ``artist`` and ``title`` keys."""
        resp = api_context.get(f"/api/songs/{ready_song_id}")
        assert resp.ok
        data = resp.json()
        # The ready_song_id fixture does not embed metadata, so both are None.
        assert "artist" in data
        assert "title" in data
        assert data["artist"] is None
        assert data["title"] is None

    def test_get_song_with_metadata_returns_artist_and_title(
        self, api_context: APIRequestContext, ready_song_with_metadata_id: str
    ) -> None:
        """Song with pre-set metadata must expose artist and title."""
        resp = api_context.get(f"/api/songs/{ready_song_with_metadata_id}")
        assert resp.ok
        data = resp.json()
        assert data["artist"] == _TAGGED_ARTIST
        assert data["title"] == _TAGGED_TITLE

    def test_get_nonexistent_returns_404(self, api_context: APIRequestContext) -> None:
        resp = api_context.get("/api/songs/does-not-exist")
        assert resp.status == 404
        assert "detail" in resp.json()


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


class TestUpload:
    def test_upload_valid_wav_returns_201(
        self,
        api_context: APIRequestContext,
        silence_wav_bytes: bytes,
    ) -> None:
        resp = api_context.post(
            "/api/songs",
            multipart={
                "file": {
                    "name": "e2e_upload.wav",
                    "mimeType": "audio/wav",
                    "buffer": silence_wav_bytes,
                }
            },
        )
        assert resp.status == 201
        data = resp.json()
        assert data["filename"] == "e2e_upload.wav"
        assert data["status"] == "splitting"
        # Cleanup: delete the song so the data dir stays tidy
        api_context.delete(f"/api/songs/{data['id']}")

    def test_upload_unsupported_extension_returns_400(
        self, api_context: APIRequestContext
    ) -> None:
        resp = api_context.post(
            "/api/songs",
            multipart={
                "file": {
                    "name": "document.pdf",
                    "mimeType": "application/pdf",
                    "buffer": b"fake pdf content",
                }
            },
        )
        assert resp.status == 400
        assert "Unsupported file type" in resp.json()["detail"]

    def test_upload_mp3_extension_accepted(
        self,
        api_context: APIRequestContext,
        silence_wav_bytes: bytes,
    ) -> None:
        resp = api_context.post(
            "/api/songs",
            multipart={
                "file": {
                    "name": "track.mp3",
                    "mimeType": "audio/mpeg",
                    "buffer": b"\xff\xfb" + b"\x00" * 100,
                }
            },
        )
        assert resp.status == 201
        assert resp.json()["filename"] == "track.mp3"
        api_context.delete(f"/api/songs/{resp.json()['id']}")

    def test_upload_tagged_mp3_returns_embedded_metadata(
        self,
        api_context: APIRequestContext,
        tagged_mp3_bytes: bytes,
    ) -> None:
        """Uploading a tagged MP3 must parse and return artist and title."""
        resp = api_context.post(
            "/api/songs",
            multipart={
                "file": {
                    "name": "tagged_upload.mp3",
                    "mimeType": "audio/mpeg",
                    "buffer": tagged_mp3_bytes,
                }
            },
        )
        assert resp.status == 201
        data = resp.json()
        assert data["artist"] == _TAGGED_ARTIST
        assert data["title"] == _TAGGED_TITLE
        # Clean up so the data dir stays tidy
        api_context.delete(f"/api/songs/{data['id']}")


# ---------------------------------------------------------------------------
# Delete song
# ---------------------------------------------------------------------------


class TestDeleteSong:
    def test_delete_existing_song(
        self,
        api_context: APIRequestContext,
        silence_wav_bytes: bytes,
    ) -> None:
        # Upload a song to delete
        upload = api_context.post(
            "/api/songs",
            multipart={
                "file": {
                    "name": "to_delete.wav",
                    "mimeType": "audio/wav",
                    "buffer": silence_wav_bytes,
                }
            },
        )
        song_id = upload.json()["id"]

        # Delete it
        del_resp = api_context.delete(f"/api/songs/{song_id}")
        assert del_resp.status == 204

        # Confirm it's gone
        get_resp = api_context.get(f"/api/songs/{song_id}")
        assert get_resp.status == 404

    def test_delete_nonexistent_returns_404(
        self, api_context: APIRequestContext
    ) -> None:
        resp = api_context.delete("/api/songs/ghost-song-id")
        assert resp.status == 404


# ---------------------------------------------------------------------------
# Stems
# ---------------------------------------------------------------------------


class TestStems:
    def test_get_stem_returns_mp3(
        self, api_context: APIRequestContext, ready_song_id: str
    ) -> None:
        resp = api_context.get(f"/api/songs/{ready_song_id}/stems/vocals")
        assert resp.ok
        assert "audio/mpeg" in resp.headers["content-type"]

    def test_get_all_stems(
        self, api_context: APIRequestContext, ready_song_id: str
    ) -> None:
        for stem in ("vocals", "bass", "drums", "other"):
            resp = api_context.get(f"/api/songs/{ready_song_id}/stems/{stem}")
            assert resp.ok, f"Stem {stem!r} returned {resp.status}"

    def test_get_invalid_stem_returns_422(
        self, api_context: APIRequestContext, ready_song_id: str
    ) -> None:
        resp = api_context.get(f"/api/songs/{ready_song_id}/stems/guitar")
        assert resp.status == 422

    def test_get_processed_stem_identity(
        self, api_context: APIRequestContext, ready_song_id: str
    ) -> None:
        """Processed stem with pitch=0 & tempo=1 is served from pre-built cache."""
        resp = api_context.get(
            f"/api/songs/{ready_song_id}/stems/vocals/processed?pitch=0.0&tempo=1.0"
        )
        assert resp.ok
        assert "audio/mpeg" in resp.headers["content-type"]

    def test_stem_of_nonready_song_returns_409(
        self,
        api_context: APIRequestContext,
        silence_wav_bytes: bytes,
    ) -> None:
        # Upload creates a song in "splitting" state
        upload = api_context.post(
            "/api/songs",
            multipart={
                "file": {
                    "name": "pending.wav",
                    "mimeType": "audio/wav",
                    "buffer": silence_wav_bytes,
                }
            },
        )
        song_id = upload.json()["id"]
        resp = api_context.get(f"/api/songs/{song_id}/stems/vocals")
        assert resp.status == 409
        api_context.delete(f"/api/songs/{song_id}")
