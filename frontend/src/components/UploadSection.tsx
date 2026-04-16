import { useRef, useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { api } from "../api/client";

const ACCEPTED = ".mp3,.wav,.flac,.ogg,.m4a,.aac";

export function UploadSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadProgress = usePlayerStore((s) => s.uploadProgress);
  const uploadStatus = usePlayerStore((s) => s.uploadStatus);
  const setUploadProgress = usePlayerStore((s) => s.setUploadProgress);
  const setUploadStatus = usePlayerStore((s) => s.setUploadStatus);
  const updateSong = usePlayerStore((s) => s.updateSong);
  const setSongs = usePlayerStore((s) => s.setSongs);

  const startPolling = (songId: string) => {
    const timer = setInterval(async () => {
      try {
        const song = await api.getSong(songId);
        updateSong(song);
        if (song.status === "ready" || song.status === "error") {
          clearInterval(timer);
          setUploadProgress(null);
          if (song.status === "error") {
            setUploadStatus(`❌ Stem splitting failed: ${song.error_message ?? ""}`);
          }
        }
      } catch {
        // keep polling
      }
    }, 2000);
  };

  const uploadFile = async (file: File) => {
    setUploadProgress(0);
    setUploadStatus(`Uploading ${file.name}…`);
    try {
      const song = await api.uploadSong(file, (pct) => setUploadProgress(pct));
      setUploadStatus(`✅ Uploaded! Splitting stems for "${song.filename}"…`);
      // Refresh song list
      const data = await api.getSongs();
      setSongs(data.songs);
      startPolling(song.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadStatus(`❌ ${msg}`);
      setUploadProgress(null);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (files?.[0]) void uploadFile(files[0]);
  };

  return (
    <section id="upload-section">
      <h3 className="sub-section-heading">Upload Song</h3>

      <div
        id="drop-zone"
        className={`upload-area${dragOver ? " drag-over" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer?.files ?? null);
        }}
        role="button"
        tabIndex={0}
        aria-label="Drop audio file here or click to browse"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
      >
        <p>Drag &amp; drop an audio file here, or click to select</p>
        <p className="hint">
          Supported: MP3, WAV, FLAC, OGG, M4A, AAC · Max 300 MB
        </p>
        <button
          id="browse-btn"
          className="btn btn-primary"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          type="button"
        >
          Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          id="file-input"
          accept={ACCEPTED}
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploadProgress !== null && (
        <div className="upload-progress" id="upload-progress">
          <progress id="upload-bar" value={uploadProgress} max={100} />
          <span id="upload-status">{uploadStatus}</span>
        </div>
      )}
      {uploadProgress === null && uploadStatus && (
        <div className="upload-progress" id="upload-progress">
          <span id="upload-status">{uploadStatus}</span>
        </div>
      )}

    </section>
  );
}
