# Product Specification — Video Streamer

## Overview
This project uses a two-file architecture: a Python backend (`video-streamer.py`) that performs all media processing and exposes HTTP APIs, and a separate frontend (`video-player.html`) that consumes those APIs and plays the streamed output. The backend supports large files (MP4, MKV, AVI when possible), high resolutions (including 4K), multiple audio and subtitle tracks when present, and remote playback control (play/pause/seek/rate).

The backend is designed for **single-client, reactive streaming**:
- **Per-session state**: Each client gets an isolated session with independent playback state
- **Pause/resume without reconnection**: Uses OS-level backpressure instead of killing ffmpeg; HTTP connection stays open
- **Accurate position tracking**: Wall-clock time with pause duration compensation via `/status` endpoint
- **Instant controls**: Play/pause/seek/rate changes are responsive with no connection interruption

This specification documents the current implementation in `video-streamer.py` version 2.0.

## Architecture and rationale
- Two-file design (backend + frontend). The backend does heavy processing (transcode, select tracks, burn subtitles) and serves a single browser-friendly media stream; the frontend is responsible for UI and control.
- Use system `ffprobe` to discover streams and `ffmpeg` to transcode/produce a fragmented MP4 stream on-the-fly. Python controls these processes and streams stdout to the HTTP response.
- **Per-session state management**: Each client receives a unique `session_id` and maintains isolated playback state (selected tracks, position, rate, play/pause). Supports multiple simultaneous clients (though optimized for single-client).
- **Continuous streaming architecture**: ffmpeg stays alive throughout pause. Pause uses OS backpressure (stop reading stdout) instead of killing the process, enabling instant resume.

Rationale: offloading decoding/transcoding to the backend enables playback of formats/codecs not supported by the browser, allows server-side subtitle burning, and centralizes heavy CPU/GPU work on the host. Per-session state allows clean multi-client support if needed in future. Continuous streaming provides superior UX with no reconnection latency on pause/resume.

## Backend responsibilities
- Manage per-session playback state (tracks, position, rate, pause status).
- Inspect a media file and report available audio and subtitle tracks, along with total duration.
- Accept and persist audio and subtitle selection from the frontend (per-session).
- Accept playback control commands (play, pause, seek, set_rate) and update per-session state.
- Track accurate playback position using wall-clock time with pause duration compensation.
- Stream a single, browser-compatible fragmented MP4 (H.264 + AAC) reflecting the selected audio and subtitle choices; support playback-rate transforms where feasible.
- Provide real-time status information so the frontend can reflect current playback state and position without polling.

## Detailed API (implemented)

### Session Management

**1) POST /session**
   - Purpose: create a new playback session and receive a unique `session_id`.
   - Response: `{ "session_id": "<uuid>" }` with HTTP 201.
   - Use: Frontend should call this once on page load to get a session, then include `session_id` in all subsequent API calls.

**2) GET /session?session_id={session_id}**
   - Purpose: verify that a session exists and retrieve its current state.
   - Response: `{ "session_id": "<uuid>", "state": {...} }` with HTTP 200, or `{ "error": "Session not found" }` with HTTP 404.
   - Note: POST without session_id also creates a new session if needed; GET without session_id returns a newly created session for convenience.

### Track Discovery

**3) GET /tracks?path={path}**
   - Purpose: return available audio and subtitle tracks for the file at `path`, including total duration.
   - Parameters: 
     - `path` (required): file path. The frontend may provide an absolute path or a user-style path beginning with `~`; the backend expands `~` to the user's home directory and then validates the resolved absolute path is inside `MEDIA_ROOT` (env var, defaults to home directory). Requests for paths outside `MEDIA_ROOT` are rejected for security.
   - Operation: runs `ffprobe` to extract format metadata (duration) and parse streams. Response JSON: `{ "audio": [...], "subtitles": [...], "duration": <float|null> }`.
     - Each audio track: `{ "index": <int>, "codec": <string>, "language": <string>, "title": <string> }`
     - Each subtitle track: `{ "index": <int>, "codec": <string>, "language": <string>, "title": <string> }`
     - Indices are relative to stream type (audio 0..N, subtitle 0..M), not global ffprobe indices.
     - `duration`: total duration in seconds (float), or `null` if unknown. Frontend should use this as source of truth for seek bar calculations.
   - Fallback: if `ffprobe` fails or no tracks are present, returns `{ "audio": [], "subtitles": [], "duration": null }` (empty lists, null duration).
   - Error responses:
     - 400: `{ "error": "'path' parameter is required" }` if path is missing.
     - 404: `{ "error": "Video not found or access denied" }` if path is invalid or outside `MEDIA_ROOT`.

### Track Selection

**4) POST /select_tracks**
   - Purpose: set desired audio and subtitle tracks for subsequent streaming (per-session).
   - Parameters:
     - `session_id` (optional): include in request body or as query param; if omitted, a new session is created.
     - `audio_index` (optional, int|null): index of audio stream to select (from `/tracks`).
     - `subtitle_index` (optional, int|null): index of subtitle stream to select; use -1 for "no subtitles".
   - Request body (JSON): `{ "audio_index": <int|null>, "subtitle_index": <int|null>, "session_id": "<uuid>" }` (session_id can also be query param).
   - Operation: validate inputs (must be non-negative integers or null) and store values in per-session state.
   - Response: `{ "ok": true, "session_id": "<uuid>" }` with HTTP 200.
   - Error responses:
     - 400: `{ "error": "<validation error>" }` if audio_index/subtitle_index are invalid types or out of range.
     - 500: `{ "error": "Internal server error" }` on unexpected failure.

### Playback Control

**5) POST /control**
   - Purpose: update playback state (play, pause, seek, rate) for a session.
   - Parameters:
     - `session_id` (optional): include in request body or as query param.
     - `action` (required): one of `"play"`, `"pause"`, `"seek"`, `"set_rate"`.
     - `time` (required for `seek` action): seconds as float.
     - `rate` (required for `set_rate` action): float >= 0.5 and <= 2.0.
   - Request body (JSON): `{ "action": "play", "session_id": "<uuid>" }` etc.
   - Operation:
     - `play`: sets `is_playing = true`. If resuming from pause, atomically accumulates pause duration into `total_paused_duration` for accurate position tracking.
     - `pause`: sets `is_playing = false` and records pause start time.
     - `seek`: sets `current_time` and resets stream timing state (new stream context).
     - `set_rate`: sets `playback_rate` (validated to 0.5–2.0 range; `atempo` filter limit).
   - Response: `{ "ok": true, "session_id": "<uuid>", "state": {...} }` with HTTP 200.
   - Error responses:
     - 400: `{ "error": "<validation error>" }` if action is missing or parameters are invalid.
     - 500: `{ "error": "Internal server error" }` on unexpected failure.

### Status and Position

**6) GET /status?session_id={session_id}**
   - Purpose: retrieve current playback state and accurate playback position.
   - Parameters:
     - `session_id` (required): unique session identifier.
   - Response: 
     ```json
     {
       "session_id": "<uuid>",
       "state": {
         "is_playing": <bool>,
         "current_time": <float>,
         "playback_rate": <float>,
         "selected_audio": <int|null>,
         "selected_subtitle": <int|null>,
         "computed_current_time": <float> (if playing; wall-clock computed position),
         "playback_position": <float> (alias for computed_current_time),
         "pause_elapsed": <float> (if paused; seconds since pause started),
         ...
       }
     }
     ```
   - **Key feature**: `computed_current_time` is calculated from wall-clock time with pause duration compensation:
     - `computed_current_time = stream_initial_seek + (wall_clock_elapsed - total_paused_duration) × playback_rate`
     - Accurate across multiple pause/resume cycles.
   - Error responses:
     - 400: `{ "error": "session_id parameter is required" }` if session_id is missing.
     - 404: `{ "error": "Session not found" }` if session_id is invalid.

### Streaming

**7) GET /stream?path={path}&session_id={session_id}**
   - Purpose: produce the media stream consumed by the browser.
   - Parameters:
     - `path` (required): file path. The backend accepts absolute paths or paths beginning with `~`; it expands and resolves the path and enforces that the file resides inside `MEDIA_ROOT` to prevent directory traversal or access to sensitive files.
     - `session_id` (required): unique session identifier (no fallback).
   - Operation: builds an `ffmpeg` command using the current per-session state:
     - If `current_time` is set, passes `-ss {current_time}` to seek into the file.
     - Maps video stream `0:v:0` (first video stream).
     - Maps audio: selected audio index via `0:a:{audio_index}` or default `0:a:0`.
     - If `selected_subtitle >= 0`: burns subtitles into video using `-vf subtitles={path}:si={subtitle_index}`.
     - Applies rate filters when `playback_rate != 1.0`: video `setpts=PTS/{rate}` and audio `atempo={rate}` (0.5–2.0 only).
     - Transcodes video to `libx264` (fast preset, CRF 23) and audio to `aac` 128kbps.
     - Outputs fragmented MP4 via `-f mp4 -movflags frag_keyframe+empty_moov+default_base_moof` suitable for progressive/streaming playback.
   - **Pause/Resume behavior**: 
     - When `is_playing` becomes false: generator stops reading ffmpeg stdout (OS backpressure), ffmpeg blocks on output buffer but **remains alive**.
     - HTTP connection to client remains open.
     - Browser buffers fMP4 fragments; no reconnection needed.
     - When `is_playing` becomes true (resume): generator resumes reading, ffmpeg continues, playback resumes instantly.
     - Position tracking: `total_paused_duration` automatically updated on play (after pause), so `/status` position is accurate.
   - Response: HTTP `video/mp4` stream with chunks read from ffmpeg stdout (8KB chunks).
   - Error responses:
     - 404: `{ "error": "Video not found or access denied" }` if path is invalid.
     - 400: `{ "error": "session_id parameter is required" }` if session_id is missing.
     - 404: `{ "error": "Session not found" }` if session_id is invalid.

## Security

- **Path Validation**: `path` parameter is validated to be within `MEDIA_ROOT` (prevents directory traversal attacks). Default `MEDIA_ROOT` is user's home directory; override via env var.
- **Per-session isolation**: Each client's playback state is isolated; no cross-session interference.
- **Input Validation**: All numeric and string parameters are validated before use.

## Edge cases, limits and fallbacks

- **No tracks**: If `ffprobe` or `ffmpeg` are missing, endpoints return 404/500 errors. Frontend should display an error message.
- **Empty track lists**: `/tracks` returns `{ "audio": [], "subtitles": [] }` if file has no audio or subtitle streams. Frontend must handle empty lists (e.g., show "No audio available" or use sensible defaults).
- **Playback rate**: Limited to 0.5–2.0 (ffmpeg `atempo` filter limitation). Rates outside range are rejected with HTTP 400.
- **Subtitle burning**: Some embedded subtitle formats (image-based, ASS) may not be compatible with ffmpeg subtitles filter. If burning fails, streaming continues without subtitles; client can retry without selecting subtitles.
- **Session cleanup**: Sessions older than 1 hour are automatically cleaned up on app startup. Expired sessions return 404 on subsequent requests.

## Operational notes

- **System requirements**: `ffmpeg` and `ffprobe` binaries must be installed on the host (via apt/brew/etc).
- **Performance**: 
  - On **Ryzen 5 5500U + 16GB DDR4**: 1080p MKV streams smoothly, 30-50% CPU usage.
  - On **Mac 5-7 years old (Intel i5/i7)**: 1080p is slow (20-25 fps, 80-90% CPU). Recommend reducing preset to "ultrafast" or 720p resolution.
  - On **Mac recent (Apple Silicon M1/M2/M3)**: 1080p streams excellently with hardware acceleration (10-20% CPU).
- **Architecture notes**: Single-threaded Flask app (suitable for single-client prototype); production should use WSGI server (gunicorn, etc.) and consider multi-worker or async streaming if multi-client support is needed.

## Next steps

- **Frontend**: Create `video-player.html` that:
  - Calls `/session` (POST) to create a session.
  - Calls `/tracks?path=...` to discover available tracks.
  - Renders track selection UI and posts to `/select_tracks`.
  - Implements playback controls (play/pause/seek/rate) via `/control` endpoint.
  - Polls `/status?session_id=X` for current position and pause state.
  - Sets `<video>` element `src` to `/stream?path=...&session_id=X` for playback.
  - Handles empty track lists gracefully (show "No audio" or default to first available).

- **Hardware acceleration** (optional): Add `-c:v hevc_nvenc` (NVIDIA), `-c:v h264_vaapi` (Linux Intel), or `-c:v h264_videotoolbox` (Apple) for efficient transcoding on high-end systems.

- **Advanced streaming** (optional): Implement HLS/DASH for better multi-client support and bandwidth efficiency, though current fragmented MP4 approach works well for single-client.

---

**This Product Specification reflects the current implementation in `video-streamer.py` version 2.0, revised February 2026.**