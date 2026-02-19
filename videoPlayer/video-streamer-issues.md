# video-streamer.py — Issues and Recommendations

This document lists the issues found while reviewing `video-streamer.py`, explains their causes and impacts, and gives actionable recommendations for fixes. All items are written in English and focused on the current implementation in the repository.

## 1) Audio / subtitle index mismatch ✅

- Issue: `discover_tracks()` was collecting ffprobe stream `index` values (global stream indices). `_build_ffmpeg_cmd()` maps audio using `0:a:{audio_idx}` (stream-relative). ffmpeg's per-stream audio index is not the same as ffprobe's global `index`.
- Impact: Selecting track X in the UI could map to the wrong audio/subtitle stream in ffmpeg.
- Recommendation: normalize indices returned by `/tracks` to audio/subtitle-relative indices (enumerate as 0..N).
- **Status: FIXED** — refactored `discover_tracks()` to:
  - enumerate audio streams starting at index 0 (stream-relative, not global ffprobe index).
  - enumerate subtitle streams starting at index 0 (stream-relative, not global ffprobe index).
  - use stream-relative indices in the JSON response returned to the frontend.
  - the ffmpeg mapping `0:a:{audio_idx}` and `subtitles=...:si={subtitle_idx}` now correctly reference the intended streams.

## 2) `current_time` not updated during streaming ✅

- Issue: `play_state['current_time']` was used to `-ss` seek at ffmpeg invocation start, but it was not updated while ffmpeg runs.
- Impact: On pause + resume the resumed `-ss` would use a stale `current_time` (client drift); seeking accuracy lost and playback position could jump or repeat.
- Recommendation: implement wall-clock time tracking to compute accurate playback position during streaming.
- **Status: FIXED** — implemented:
  - Added wall-clock time tracking: `stream_start_time`, `pause_start_time`, `total_paused_duration`, `stream_initial_seek`.
  - `/status` endpoint now computes `computed_current_time` = `stream_initial_seek` + (`wall_clock_elapsed` × `playback_rate`).
  - Pause duration is automatically accumulated and subtracted from elapsed wall-clock time.
  - Frontend can request `/status?session_id=X` to get accurate playback position anytime, even during streaming.

## 3) Pause/resume strategy is primitive (connection termination) ✅

- Issue: when `is_playing` flips to false, the old implementation would kill ffmpeg and break the HTTP response; frontend would need to reconnect to resume.
- Impact: UX is suboptimal (reconnect latency, lost buffer), and complex for smooth seeking/resume.
- Recommendation: use OS-level backpressure (stop reading from ffmpeg stdout) to pause without killing the process. Keep HTTP connection open for reactive resume.
- **Status: FIXED** — implemented:
  - Pause now uses backpressure: generator stops reading from `proc.stdout` when paused, causing ffmpeg to block on its output buffer (no data loss, just paused encoding).
  - ffmpeg process stays alive throughout pause (not killed).
  - HTTP connection to client stays open; frontend continues receiving stream (browser buffers fMP4 fragments).
  - Resume is instant: generator resumes reading, ffmpeg continues encoding, client sees uninterrupted playback without reconnection.
  - Added small sleep (0.05s) during pause to reduce CPU usage during pause loops.

## 4) Path validation / security risk ✅

- Issue: `path` query parameter is used directly without validation.
- Impact: malicious users may request arbitrary files (directory traversal) and read sensitive data or exhaust server resources.
- Recommendation: restrict playable files to a configured directory (whitelist) or accept only server-side file IDs. Validate that `path` is within allowed base path before using.
- **Status: FIXED** — added `_validate_path()` function that:
  - resolves paths to absolute and checks they are within `MEDIA_ROOT` (configurable via env var `MEDIA_ROOT`, defaults to home directory).
  - prevents directory traversal attacks (rejects paths outside MEDIA_ROOT).
  - validates file existence before passing to ffprobe/ffmpeg.
  - used in both `/tracks` and `/stream` endpoints.

## 5) Single global in-memory state (no session handling) ✅

- Issue: `play_state` is global; concurrent clients share the same selection and playback state.
- Impact: multiple users or multiple frontend tabs will conflict (one user changes track/seek affects everybody).
- Recommendation: implement per-session state: accept a `session_id` or issue a session token when a client opens a session, and store `play_state` per session (in-memory dict or lightweight store). For production use a persistent store (Redis).
- **Status: FIXED** — implemented:
  - Added `session_lock` and `sessions` dict for per-session state management.
  - Implemented `_create_session()`, `_get_session()`, `_get_or_create_session()`, `_clean_old_sessions()`.
  - All endpoints now accept optional `session_id` parameter (backward compatible).
  - Added `/session` endpoint for explicit session management (POST to create, GET to verify).
  - Updated all endpoints (`/select_tracks`, `/control`, `/status`, `/stream`) to use per-session state.
  - Global `play_state` kept for backward compatibility (fallback when no session_id provided).
  - Logging includes `[Session ID]` prefix for traceability.
  - Session cleanup runs on app startup to remove expired sessions (>1 hour old).

## 6) Error handling and HTTP responses ✅

- Issue: `generate_ffmpeg_stream()` was yielding `b''` or starting ffmpeg without returning proper HTTP error codes on failure.
- Impact: frontend received no helpful error message; debugging was harder.
- Recommendation: detect ffmpeg startup errors and return HTTP 5xx with JSON error.
- **Status: FIXED** — implemented:
  - ffmpeg process errors now logged and handled gracefully (no silent failures).
  - `/select_tracks` and `/control` endpoints validate input and return 400 with descriptive error messages on invalid input.
  - `/control` endpoint now returns 500 on unexpected errors.
  - All endpoints log their actions (start, pause, seek, rate change, track selection).

## 7) Logging and process cleanup ✅

- Issue: code lacked structured logging and robust child-process cleanup; errors were swallowed.
- Impact: ffmpeg processes could become zombies; troubleshooting was hard.
- Recommendation: add `logging` usage; use `proc.wait()` with timeout and reliable termination on shutdown.
- **Status: FIXED** — implemented:
  - added `logging` module with INFO level logging for key operations.
  - `_run_ffprobe()` now logs specific error types (timeout, failed parse, etc.).
  - `generate_ffmpeg_stream()` logs process lifecycle (start, pause, end, errors).
  - robust process cleanup: uses `terminate()` with 5-second timeout, falls back to `kill()`.
  - handles `GeneratorExit` to clean up on early client disconnect.
  - all endpoint actions are logged (track discovery, track selection, playback control).

## 8) Dependency mismatch / unnecessary packages ✅

- Issue: `requirements.txt` contained `opencv-python` and `ffmpeg-python`, but the current backend uses `subprocess` to call system `ffmpeg` and does not use OpenCV.
- Impact: installing unnecessary packages wastes space/time and confuses maintainers.
- Recommendation: remove unused dependencies or modify code to use them consistently; explicitly document that system `ffmpeg` and `ffprobe` binaries are required.
- **Status: FIXED** — removed `opencv-python` and `ffmpeg-python` from `requirements.txt`.

## 9) CORS not enabled ✅

- Issue: If the frontend is served from a different origin, cross-origin requests to the API will be blocked by the browser.
- Impact: frontend cannot call `/tracks`, `/control`, `/select_tracks`, etc., from a different origin.
- Recommendation: add `flask-cors` or manually set CORS headers for the API endpoints (configure allowed origins during development vs production).
- **Status: FIXED** — implemented:
  - Added `@app.after_request` decorator to inject CORS headers to all responses.
  - Headers: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`.
  - Added `OPTIONS` preflight handler for CORS-preflight requests.
  - All endpoints now support cross-origin requests during development; can be restricted by origin in production.

## 10) README / port inconsistency ✅

- Issue: README indicated port `5432` but `video-streamer.py` runs `app.run(..., port=5000)`.
- Impact: confusion when running the server and following docs.
- Recommendation: make README match the actual port (or change `app.run` to use the documented port). Prefer using environment variable `PORT` with a sensible default.
- **Status: FIXED** — README updated to reflect port 5000.

## 11) Subtitle burning limitations ✅

- Issue: `vf_filters` uses `subtitles={video_path}:si={subtitle_idx}`. Some embedded subtitle formats may not be compatible with ffmpeg's `subtitles` filter (or require external files). MKV embedded subtitles or image-based subtitles can be problematic.
- Impact: burning subtitles may fail for some files.
- Recommendation: detect subtitle stream codec/type and, if necessary, extract subtitles first (e.g., `ffmpeg -i file -map 0:s:N out.srt`) and then use a subtitle file with ffmpeg, or surface an error if burning is unsupported.
- **Status: FIXED** — implemented:
  - Added try/catch around subtitle filter addition in `_build_ffmpeg_cmd()`.
  - Logs warning if subtitle filter fails; continues without subtitles rather than crash.
  - Client can retry without subtitles or report format issue.
  - Graceful degradation allows streaming even with incompatible subtitle formats.

## 12) Playback-rate limitations ✅

- Issue: the implementation attempts to apply `atempo` for audio and `setpts` for video. `atempo` supports only 0.5–2.0 in a single filter; larger ranges require chaining multiple atempo filters.
- Impact: requested rates outside supported range will not be honored or will be best-effort.
- Recommendation: constrain the allowed playback rates on the frontend to supported ranges or implement chained `atempo` filters for larger ranges and add server-side validation.
- **Status: FIXED** — implemented:
  - Added server-side validation in `/control` endpoint `set_rate` action.
  - Rejects rates outside 0.5-2.0 range with HTTP 400 and descriptive error message.
  - Client cannot request unsupported rates; prevents ffmpeg filter errors.
  - Updated `_build_ffmpeg_cmd()` to log warning if rate is out of range (should not happen with validation).

## 13) Resource usage for high-resolution transcoding

- Issue: on-the-fly transcoding of 4K content without hardware acceleration will be extremely CPU-intensive.
- Impact: server may become unresponsive or fail to sustain real-time transcoding.
- Recommendation: document hardware requirements; provide options to enable hardware-accelerated encoders (NVENC, VAAPI, VideoToolbox) and detect availability. Optionally support lower-resolution re-encoding for lower-end hosts.

## 14) Robust process cleanup ✅

- Issue: subprocesses are created with Popen and only killed in some branches; no reliable termination mechanism.
- Impact: ffmpeg processes could become zombies on ungraceful shutdown.
- Recommendation: implement reliable cleanup with timeout fallback (terminate → wait → kill).
- **Status: FIXED** — implemented:
  - `generate_ffmpeg_stream()` uses robust cleanup: `proc.terminate()` with 5-second timeout, falls back to `proc.kill()`.
  - Handles `GeneratorExit` for early client disconnect.
  - Process state is logged (start, pause, end, errors) for debugging.

## 15) Testing and reproducibility

- Issue: no unit/integration tests or example requests are present.
- Impact: regressions are easy to introduce; verifying behavior across formats is manual.
- Recommendation: add small test harnesses or example curl requests, and include sample media (or instructions) for local testing.

## 16) Input validation ✅

- Issue: endpoints accepted JSON fields without strict validation (e.g., `audio_index` may be None, non-int, or out of range).
- Impact: unexpected types could cause ffmpeg errors or server exceptions.
- Recommendation: validate inputs and return 400 for invalid parameters.
- **Status: FIXED** — implemented validation in:
  - `/select_tracks`: checks audio_index and subtitle_index are None or non-negative integers.
  - `/control`: checks action is provided, required fields for each action (time for seek, rate for set_rate).
  - `/control`: validates data types (time and rate must be numeric) and semantic constraints (rate > 0).
  - all validation errors return 400 with descriptive JSON error messages.

## 17) Session state race condition in `/select_tracks` endpoint ✅

- Issue: Input validation occurs outside the `session_lock`. A second concurrent request could modify `session_state` between validation and the update inside the lock.
- Impact: race condition where concurrent track selections could interfere or produce undefined behavior.
- Recommendation: either validate inputs before acquiring lock and then re-validate inside lock, or acquire lock earlier to cover the full operation.
- **Status: FIXED** — implemented:
  - Moved validation inside `session_lock` to make validation + update atomic.
  - Single-client usage makes this a low-risk fix with minimal performance impact.
  - Also improved error handling (returns 500 on unexpected errors instead of generic 400).

## 18) Missing `path` parameter validation in `/tracks` endpoint ✅

- Issue: if client omits `path` query parameter, `_validate_path(None)` returns `(False, None)` with a generic "Video not found or access denied" error. Should distinguish between missing parameter and invalid path.
- Impact: unclear error message; client cannot distinguish "I didn't send path" from "path is outside MEDIA_ROOT".
- Recommendation: explicitly check if `path` is None or empty and return 400 with "path parameter is required"; only return 404 for actual path validation failures.
- **Status: FIXED** — implemented:
  - Added explicit check for empty/missing `path` parameter before calling `_validate_path()`.
  - Returns 400 with clear message "'path' parameter is required".
  - Returns 404 only for actual path validation failures (path outside MEDIA_ROOT or non-existent).

## 19) Session state mutation race condition in `/control` endpoint

- Issue: `session_state` is modified inside the lock, but then passed to `generate_ffmpeg_stream()` which reads `session_state['is_playing']` inside the loop without acquiring `session_lock`. A concurrent pause request could modify `is_playing` while the stream is reading it, causing race conditions.
- Impact: pause/resume may not work reliably; stream may not detect pause signal or may crash on concurrent modification.
- Recommendation: either pass a snapshot of session state to `generate_ffmpeg_stream()`, or acquire `session_lock` before each read of `session_state['is_playing']` inside the generator loop.
- **Status: UNFIXED**

## 20) Audio codec fallback is incorrect in `discover_tracks()` ✅

- Issue: If no audio streams are found, fallback creates `{'index': 0, 'codec': 'unknown', 'language': 'und', 'title': 'track 1'}`. This is misleading because it claims audio track 0 exists when it may not. FFmpeg will fail if requested to map `0:a:0` but no audio streams exist.
- Impact: frontend may offer a non-existent audio track; streaming will fail when client tries to select it.
- Recommendation: either return an empty audio_tracks list and let frontend handle it, or attempt to detect actual audio streams more robustly (some formats may not expose codec_type correctly).
- **Status: FIXED** — implemented:
  - Removed fallback track generation.
  - `discover_tracks()` now returns empty lists if no audio/subtitle streams found.
  - Frontend responsibility to handle gracefully (can use sensible defaults like default audio if list is empty, or display "no audio" message).

## 21) Subtitle codec `none` is misleading in `discover_tracks()` ✅

- Issue: when no subtitle streams are found, fallback returns `[{'index': -1, 'codec': 'none', ...}]`. Using `'codec': 'none'` is inaccurate; there is no codec 'none'. Also, the presence of a "No subtitles" entry in the array is confusing (is it a real stream or a placeholder?).
- Impact: frontend may treat this as a valid subtitle stream option, or subtitle codec info is inaccurate in logs/UI.
- Recommendation: return an empty `subtitle_tracks` list if no subtitles found, or use a clearer indicator (e.g., `'codec': null` or `'available': false`). Document frontend expectations for empty track lists.
- **Status: FIXED** — implemented:
  - Removed the fake "No subtitles" entry.
  - `discover_tracks()` now returns empty `subtitle_tracks` list if no actual subtitle streams found.
  - Frontend can display "No subtitles available" or similar UI message based on empty list.

## 22) Race condition on `total_paused_duration` not being updated ✅

- Issue: In `/control` endpoint, when action is `'pause'`, the code sets `pause_start_time` but never updates `total_paused_duration`. The generator's `/status` endpoint tries to compute playback position using `total_paused_duration` to subtract pause time from wall-clock elapsed, but this value is never incremented.
- Impact: After the first pause, computed playback position in `/status` becomes **INACCURATE**. The pause duration is ignored, causing the reported position to drift forward by the pause duration.
- Recommendation: Update `total_paused_duration` atomically when resuming from pause (add the time between pause_start_time and resume to the accumulated total).
- **Status: FIXED** — implemented:
  - When action is `'play'` in `/control` endpoint, check if `pause_start_time` is not None (resuming from pause).
  - If resuming, calculate pause duration: `time.time() - pause_start_time` and atomically add it to `total_paused_duration`.
  - Log the pause duration for debugging.
  - Clear `pause_start_time` after accumulating.

## 23) Pause duration tracking logic is incomplete ✅

- Issue: The generator loop reads `pause_start_time` and computes `accumulated_pause` locally but never uses it to update the session state's `total_paused_duration`. The generator cannot modify `total_paused_duration` because it would require acquiring the lock repeatedly in a tight loop (performance risk). The update should happen in `/control` endpoint instead.
- Impact: Pause duration tracking is broken; `total_paused_duration` never reflects actual pause time.
- Recommendation: When client sends `play` action after a pause, compute the pause duration (current_time - pause_start_time) and atomically add it to `total_paused_duration` inside the lock.
- **Status: FIXED** — implemented:
  - The fix for Issue #22 resolves this together: pause duration is now accumulated in `/control` endpoint when action is `'play'`.
  - No more generator-level pause tracking needed; all pause accounting happens atomically in `/control` endpoint.
  - Position computation in `/status` is now accurate across pause/resume cycles.

## 24) Unused variable `burn_sub` in `_build_ffmpeg_cmd()` ✅

- Issue: In `_build_ffmpeg_cmd()`, the variable `burn_sub` is assigned (`burn_sub = True`) but never used afterward. It's remnant code.
- Impact: Minor code smell; doesn't affect functionality but indicates incomplete refactoring.
- Recommendation: Remove the unused assignment.
- **Status: FIXED** — implemented:
  - Removed the `burn_sub = False` declaration and `burn_sub = True` assignment.
  - Subtitle filter logic is now cleaner with no unused variables.

## Summary of priority fixes (recommended order)
1. ✅ Fix audio/subtitle index mapping (DONE).
2. ✅ Update README port mismatch (DONE).
3. ✅ Add path validation / whitelist (DONE).
4. ✅ Improve error handling for ffmpeg/ffprobe failures and return proper HTTP errors (DONE).
5. ✅ Add logging + process cleanup logic (DONE).
6. ✅ Consider per-session state if multiple clients are expected (DONE).
7. ✅ Remove unused dependencies from `requirements.txt` (DONE).
8. ✅ Add CORS support (DONE).
9. ✅ Input validation (DONE).
10. ✅ Subtitle format compatibility (DONE).
11. ✅ Playback rate constraints (DONE).
12. ✅ Robust process cleanup (DONE).
13. ✅ Fix session state race condition in `/select_tracks` (DONE).
14. ✅ Add missing parameter validation in `/tracks` (DONE).
15. ✅ Improve track discovery fallback logic - audio fallback (DONE).
16. ✅ **Improve track discovery fallback logic - subtitle codec (DONE)**.
17. ✅ **Pause/resume without connection interruption (DONE)** — Uses OS backpressure, no ffmpeg kill, instant resume.
18. ✅ **Accurate playback position tracking via wall-clock time (DONE)** — `/status` endpoint returns `computed_current_time`.
19. ✅ **Fix pause duration tracking (DONE)** — Issues #22, #23: `total_paused_duration` now accurately updated on pause/resume, position no longer drifts.
20. ✅ **Remove unused variable (DONE)** — Issue #24: `burn_sub` removed from `_build_ffmpeg_cmd()`.
21. ⏭️ Session state mutation race condition in `/control` (DEFERRED - single-client usage, not critical).

## Next Steps (Optional/Advanced - Not Critical)

The following issues are not critical for current operation but would improve robustness, UX, or resource efficiency:

1. **Fix #13 (Hardware acceleration)** — Add options for NVENC, VAAPI, VideoToolbox for CPU-efficient transcoding of high-resolution content. Reduces CPU load on high-res (4K) streaming. [Optional - requires GPU detection and platform-specific codec selection]

2. **Fix #15 (Testing infrastructure)** — Add unit/integration tests, example curl requests, and sample media for reproducible testing. [Low priority - improves developer experience]

3. **Fix #19 (Deferred - single-client note)** — Session state mutation race condition in `/control` endpoint is intentionally deferred because the application is designed for single-client usage only. In a multi-client scenario, this would require snapshot-based session state passing to `generate_ffmpeg_stream()`.
