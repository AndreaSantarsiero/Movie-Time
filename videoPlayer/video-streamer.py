from flask import Flask, request, Response, jsonify
import os
import time
import threading
import subprocess
import json
import logging
import uuid
from pathlib import Path
from functools import wraps



app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Configuration: allowed directory for playback (security)
MEDIA_ROOT = os.getenv('MEDIA_ROOT', os.path.expanduser('~'))  # default to home directory


def _validate_path(video_path):
    """Validate that video_path is within MEDIA_ROOT. Return (is_valid, absolute_path)."""
    if not video_path:
        return False, None
    try:
        # Expand user (~) then resolve to absolute path and check it's within MEDIA_ROOT
        expanded = os.path.expanduser(video_path)
        abs_path = Path(expanded).resolve()
        media_root = Path(MEDIA_ROOT).resolve()
        # Ensure the path is within media_root
        abs_path.relative_to(media_root)
        return abs_path.exists(), str(abs_path)
    except (ValueError, RuntimeError):
        # ValueError: path is not relative to MEDIA_ROOT (directory traversal attempt)
        # RuntimeError: path resolution failed
        return False, None



# Enable CORS for all routes
@app.after_request
def add_cors_headers(response):
    """Add CORS headers to allow cross-origin requests."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


@app.route('/', methods=['OPTIONS'])
def handle_options():
    """Handle preflight CORS requests."""
    return '', 204



# Session and state management (per-session playback state)
session_lock = threading.Lock()
sessions = {}  # session_id -> play_state dict


def _create_session():
    """Create a new playback session and return session_id."""
    session_id = str(uuid.uuid4())
    with session_lock:
        sessions[session_id] = {
            'is_playing': False,
            'current_time': 0.0,
            'playback_rate': 1.0,
            'selected_audio': None,
            'selected_subtitle': None,
            'created_at': time.time(),
            'stream_start_time': None,      # wall-clock when stream started (set on first play)
            'pause_start_time': None,       # wall-clock when last pause initiated
            'total_paused_duration': 0.0,   # accumulated pause duration (seconds)
            'stream_initial_seek': 0.0      # initial seek time when stream started
        }
    logger.info(f"Session created: {session_id}")
    return session_id


def _get_session(session_id):
    """Get session state or return None if invalid."""
    with session_lock:
        return sessions.get(session_id)


def _get_or_create_session(session_id):
    """Get session or create a new one if not found."""
    if session_id:
        session = _get_session(session_id)
        if session:
            return session_id, session
    # Create new session
    new_session_id = _create_session()
    return new_session_id, _get_session(new_session_id)


def _clean_old_sessions(max_age_seconds=3600):
    """Remove sessions older than max_age_seconds (cleanup old inactive sessions)."""
    current_time = time.time()
    with session_lock:
        expired = [sid for sid, state in sessions.items() 
                   if current_time - state.get('created_at', current_time) > max_age_seconds]
        for sid in expired:
            del sessions[sid]
        if expired:
            logger.info(f"Cleaned {len(expired)} expired sessions")


def _run_ffprobe(video_path):
    """Return ffprobe JSON output for the file, or None on error."""
    try:
        cmd = [
            'ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', video_path
        ]
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=10)
        return json.loads(out)
    except subprocess.TimeoutExpired:
        logger.warning(f"ffprobe timeout for file: {video_path}")
        return None
    except subprocess.CalledProcessError as e:
        logger.warning(f"ffprobe failed for file {video_path}: {e}")
        return None
    except json.JSONDecodeError as e:
        logger.warning(f"ffprobe JSON parse error for file {video_path}: {e}")
        return None
    except Exception as e:
        logger.error(f"ffprobe unexpected error for file {video_path}: {e}")
        return None


def discover_tracks(video_path):
    """Discover audio and subtitle tracks using ffprobe. Returns dict.

    Returns indices as relative to their stream type (0..N for audio, 0..M for subtitles)
    not global ffprobe indices. This ensures ffmpeg mapping 0:a:N and subtitles filter :si=N work correctly.
    
    If ffprobe unavailable or parsing fails, fall back to a single audio track.
    """
    info = _run_ffprobe(video_path)
    audio_tracks = []
    subtitle_tracks = []
    audio_idx = 0
    subtitle_idx = 0
    duration = None
    
    if info and 'streams' in info:
        for s in info['streams']:
            kind = s.get('codec_type')
            lang = s.get('tags', {}).get('language') if s.get('tags') else None
            title = s.get('tags', {}).get('title') if s.get('tags') else None
            
            if kind == 'audio':
                entry = {
                    'index': audio_idx,  # stream-relative index for this audio stream
                    'codec': s.get('codec_name'),
                    'language': lang or 'und',
                    'title': title or f'Audio track {audio_idx}'
                }
                audio_tracks.append(entry)
                audio_idx += 1
            elif kind == 'subtitle':
                entry = {
                    'index': subtitle_idx,  # stream-relative index for this subtitle stream
                    'codec': s.get('codec_name'),
                    'language': lang or 'und',
                    'title': title or f'Subtitle track {subtitle_idx}'
                }
                subtitle_tracks.append(entry)
                subtitle_idx += 1
        
        # Extract duration from format info if available
        if 'format' in info:
            try:
                duration = float(info['format'].get('duration'))
            except (ValueError, TypeError):
                duration = None

    # Return actual discovered tracks + duration
    # Frontend handles empty track lists gracefully
    return {'audio': audio_tracks, 'subtitles': subtitle_tracks, 'duration': duration}



@app.route('/session', methods=['POST', 'GET'])
def session():
    """Create a new session or retrieve existing one.
    
    POST: Create a new session, return session_id.
    GET with session_id param: Verify/retrieve session.
    """
    if request.method == 'POST':
        session_id = _create_session()
        logger.info(f"New session created: {session_id}")
        return jsonify({'session_id': session_id}), 201
    else:  # GET
        session_id = request.args.get('session_id')
        if not session_id:
            session_id = _create_session()
            return jsonify({'session_id': session_id, 'note': 'no session provided, created new'}), 200
        session_state = _get_session(session_id)
        if session_state:
            logger.info(f"Session verified: {session_id}")
            return jsonify({'session_id': session_id, 'state': session_state}), 200
        else:
            logger.warning(f"Invalid session requested: {session_id}")
            return jsonify({'error': 'Session not found'}), 404


@app.route('/tracks', methods=['GET'])
def tracks():
    video_path = request.args.get('path')
    if not video_path:
        logger.warning("tracks endpoint: missing 'path' parameter")
        return jsonify({'error': "'path' parameter is required"}), 400
    is_valid, abs_path = _validate_path(video_path)
    if not is_valid:
        logger.warning(f"Invalid path requested: {video_path}")
        return jsonify({'error': 'Video not found or access denied'}), 404
    logger.info(f"Discovering tracks for: {abs_path}")
    t = discover_tracks(abs_path)
    logger.info(f"Found {len(t['audio'])} audio and {len(t['subtitles'])} subtitle tracks")
    return jsonify(t), 200


@app.route('/select_tracks', methods=['POST'])
def select_tracks():
    data = request.json or {}
    audio_index = data.get('audio_index')
    subtitle_index = data.get('subtitle_index')
    session_id = data.get('session_id') or request.args.get('session_id')
    
    # Get or create session
    session_id, session_state = _get_or_create_session(session_id)
    
    # Validate and update session state atomically (within lock)
    try:
        with session_lock:
            # Validate indices (must be None or non-negative integers)
            if audio_index is not None and not isinstance(audio_index, int):
                return jsonify({'error': 'audio_index must be an integer or null'}), 400
            if subtitle_index is not None and not isinstance(subtitle_index, int):
                return jsonify({'error': 'subtitle_index must be an integer or null'}), 400
            if audio_index is not None and audio_index < 0:
                return jsonify({'error': 'audio_index must be non-negative'}), 400
            if subtitle_index is not None and subtitle_index < -1:
                return jsonify({'error': 'subtitle_index must be >= -1'}), 400
            
            # Update session state
            if session_state:
                session_state['selected_audio'] = audio_index
                session_state['selected_subtitle'] = subtitle_index
    except Exception as e:
        logger.error(f"select_tracks error: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    
    logger.info(f"[Session {session_id}] Tracks selected: audio={audio_index}, subtitle={subtitle_index}")
    return jsonify({'ok': True, 'session_id': session_id}), 200


@app.route('/control', methods=['POST'])
def control():
    data = request.json or {}
    action = data.get('action')
    session_id = data.get('session_id') or request.args.get('session_id')
    
    if not action:
        return jsonify({'error': 'action field is required'}), 400
    
    # Get or create session
    session_id, session_state = _get_or_create_session(session_id)
    
    try:
        with session_lock:
            if action == 'play':
                session_state['is_playing'] = True
                # If resuming from pause, accumulate pause duration
                if session_state['pause_start_time'] is not None:
                    pause_duration = time.time() - session_state['pause_start_time']
                    session_state['total_paused_duration'] += pause_duration
                    logger.info(f"[Session {session_id}] Resumed from pause (pause_duration: {pause_duration:.2f}s)")
                # If stream_start_time not set yet, this is the first play
                if session_state['stream_start_time'] is None:
                    session_state['stream_start_time'] = time.time()
                    session_state['stream_initial_seek'] = session_state['current_time']
                # Clear pause timer
                session_state['pause_start_time'] = None
                logger.info(f"[Session {session_id}] Playback started")
            elif action == 'pause':
                session_state['is_playing'] = False
                # Record pause start time for duration tracking
                session_state['pause_start_time'] = time.time()
                logger.info(f"[Session {session_id}] Playback paused")
            elif action == 'seek':
                t = data.get('time')
                if t is None:
                    return jsonify({'error': 'seek action requires time field'}), 400
                try:
                    session_state['current_time'] = float(t)
                    # Reset stream timers on seek (new stream context)
                    session_state['stream_start_time'] = None
                    session_state['pause_start_time'] = None
                    session_state['total_paused_duration'] = 0.0
                    logger.info(f"[Session {session_id}] Seeked to {session_state['current_time']:.2f}s")
                except (ValueError, TypeError):
                    return jsonify({'error': 'time must be a number'}), 400
            elif action == 'set_rate':
                r = data.get('rate')
                if r is None:
                    return jsonify({'error': 'set_rate action requires rate field'}), 400
                try:
                    rate_float = float(r)
                    if rate_float <= 0:
                        return jsonify({'error': 'rate must be positive'}), 400
                    # Constrain to supported atempo range (0.5-2.0)
                    if rate_float < 0.5 or rate_float > 2.0:
                        return jsonify({'error': f'playback rate must be between 0.5 and 2.0; requested {rate_float}x'}), 400
                    session_state['playback_rate'] = rate_float
                    logger.info(f"[Session {session_id}] Playback rate set to {rate_float}x")
                except (ValueError, TypeError):
                    return jsonify({'error': 'rate must be a number'}), 400
            else:
                return jsonify({'error': f'unknown action: {action}'}), 400
        
        return jsonify({'ok': True, 'session_id': session_id, 'state': dict(session_state)}), 200
    except Exception as e:
        logger.error(f"[Session {session_id}] control endpoint error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/status', methods=['GET'])
def status():
    session_id = request.args.get('session_id')
    
    if not session_id:
        return jsonify({'error': 'session_id parameter is required'}), 400
    
    session_state = _get_session(session_id)
    if not session_state:
        return jsonify({'error': 'Session not found'}), 404
    
    # Build response with computed current playback position
    response_state = dict(session_state)
    
    # Compute accurate current_time based on wall-clock tracking
    if session_state.get('stream_start_time') is not None and session_state.get('is_playing'):
        # Stream is active and playing: calculate elapsed time
        wall_clock_elapsed = time.time() - session_state['stream_start_time'] - session_state.get('total_paused_duration', 0.0)
        rate = session_state.get('playback_rate', 1.0)
        # current_time = initial_seek + elapsed_wall_clock * rate
        computed_time = session_state['stream_initial_seek'] + (wall_clock_elapsed * rate)
        response_state['computed_current_time'] = computed_time
        response_state['playback_position'] = computed_time  # also expose as playback_position for clarity
    elif session_state.get('pause_start_time') is not None:
        # Stream was paused: accumulate the pause duration
        pause_duration = time.time() - session_state['pause_start_time']
        response_state['pause_elapsed'] = pause_duration
    
    return jsonify({'session_id': session_id, 'state': response_state}), 200



def _build_ffmpeg_cmd(video_path, start_time, rate, audio_idx, subtitle_idx):
    # Basic command; we'll transcode video to h264 and audio to aac for browser compatibility.
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error']
    # seek
    if start_time and start_time > 0:
        cmd += ['-ss', str(start_time)]
    cmd += ['-i', video_path]

    vf_filters = []
    af_filters = []

    # playback rate handling (limited: 0.5-2.0)
    if rate and rate != 1.0:
        # video: setpts=PTS/ rate
        vf_filters.append(f"setpts=PTS/{rate}")
        # audio: atempo supports 0.5-2.0 natively
        if 0.5 <= rate <= 2.0:
            af_filters.append(f"atempo={rate}")
        else:
            logger.warning(f"Rate {rate}x outside atempo range (0.5-2.0); applying video only")

    # Subtitles: attempt to burn, but handle format incompatibility gracefully
    if subtitle_idx is not None and subtitle_idx >= 0:
        # ffmpeg subtitles filter expects a filename, and si selects subtitle stream index
        # Note: some embedded subtitle formats (ASS, image-based) may fail or produce artifacts
        # For now, we attempt to burn; on error, the client can retry without subtitles
        try:
            # will add filter like: subtitles=video_path:si=subtitle_idx
            vf_filters.append(f"subtitles={video_path}:si={subtitle_idx}")
            logger.info(f"Subtitle track {subtitle_idx} will be burned into video")
        except Exception as e:
            logger.warning(f"Failed to add subtitle filter for track {subtitle_idx}: {e}")
            # Continue without subtitles rather than fail completely

    # mapping: always map first video stream 0:v:0
    cmd += ['-map', '0:v:0']
    # audio mapping
    if audio_idx is not None:
        cmd += ['-map', f'0:a:{audio_idx}']
    else:
        # map default audio if present
        cmd += ['-map', '0:a:0']

    # codecs
    cmd += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']
    cmd += ['-c:a', 'aac', '-b:a', '128k']

    # filters
    if vf_filters:
        cmd += ['-vf', ','.join(vf_filters)]
    if af_filters:
        cmd += ['-af', ','.join(af_filters)]

    # output to fragmented mp4 via pipe
    cmd += ['-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1']
    return cmd



def generate_ffmpeg_stream(video_path, session_state):
    """Generator that runs ffmpeg with current selections and yields stdout bytes.
    
    Args:
        video_path: Path to video file
        session_state: Session state dict (REQUIRED - per-session state management)
    
    Features:
    - Pause/resume WITHOUT interrupting connection (ffmpeg uses backpressure)
    - Accurate playback position tracking via wall-clock time
    - Continuous streaming for reactive single-client playback
    """
    logger.info(f"Starting stream for: {video_path}")
    
    start_time = float(session_state.get('current_time', 0.0))
    rate = float(session_state.get('playback_rate', 1.0))
    audio_idx = session_state.get('selected_audio')
    subtitle_idx = session_state.get('selected_subtitle')

    # Ensure file exists
    if not os.path.exists(video_path):
        logger.error(f"File not found: {video_path}")
        return

    cmd = _build_ffmpeg_cmd(video_path, start_time, rate, audio_idx, subtitle_idx)
    logger.debug(f"ffmpeg command: {' '.join(cmd)}")
    
    proc = None
    
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        logger.info(f"ffmpeg process started (PID: {proc.pid})")
    except FileNotFoundError:
        logger.error("ffmpeg executable not found; ensure ffmpeg is installed and in PATH")
        return
    except Exception as e:
        logger.error(f"Failed to start ffmpeg: {e}")
        return

    try:
        while True:
            # Check pause status and update accumulated pause duration
            with session_lock:
                is_playing = session_state.get('is_playing', False)
                pause_start_time = session_state.get('pause_start_time')
                
                # If currently paused, accumulate pause duration
                if not is_playing and pause_start_time is not None:
                    accumulated_pause = pause_start_time
                else:
                    accumulated_pause = None
            
            # If paused: don't read from ffmpeg (backpressure), yield nothing, but keep loop alive
            if not is_playing:
                # Small sleep to avoid busy-wait and reduce CPU usage during pause
                time.sleep(0.05)
                continue
            
            # Playing: read and yield chunk from ffmpeg
            chunk = proc.stdout.read(8192)
            if not chunk:
                logger.info(f"ffmpeg EOF reached (PID: {proc.pid})")
                break
            yield chunk
            
    except GeneratorExit:
        logger.info(f"Stream generator closed by client (PID: {proc.pid})")
    except Exception as e:
        logger.error(f"Error during streaming (PID: {proc.pid}): {e}")
    finally:
        # Ensure ffmpeg process is properly terminated with robust cleanup
        if proc:
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    logger.warning(f"ffmpeg process did not terminate in time, killing (PID: {proc.pid})")
                    proc.kill()
                    proc.wait()
            except Exception as e:
                logger.warning(f"Error terminating ffmpeg process (PID: {proc.pid}): {e}")
        logger.info(f"Stream ended (PID: {proc.pid if proc else 'unknown'})")



@app.route('/stream', methods=['GET'])
def stream():
    video_path = request.args.get('path')
    session_id = request.args.get('session_id')
    
    # Validate path
    is_valid, abs_path = _validate_path(video_path)
    if not is_valid:
        return jsonify({'error': 'Video not found or access denied'}), 404
    
    # session_id is REQUIRED (no fallback to legacy global state)
    if not session_id:
        return jsonify({'error': 'session_id parameter is required'}), 400
    
    # Get session state
    session_state = _get_session(session_id)
    if not session_state:
        return jsonify({'error': 'Session not found'}), 404
    
    logger.info(f"[Session {session_id}] Streaming requested for: {abs_path}")
    
    # Note: we stream as MP4 bytes produced by ffmpeg; browser must handle progressive mp4
    return Response(generate_ffmpeg_stream(abs_path, session_state), mimetype='video/mp4')



if __name__ == '__main__':
    # Clean up any old sessions on startup
    _clean_old_sessions(max_age_seconds=3600)
    logger.info("Starting Flask app on port 5000")
    app.run(host='0.0.0.0', port=5000)