## Backend Architecture

The `video-streamer.py` backend is designed for single-client, reactive streaming:

- **Continuous streaming**: Video encoding and streaming happen concurrently without interruption
- **Pause/Resume without reconnection**: Pausing uses OS-level backpressure (ffmpeg blocking on stdout) instead of killing the process. The HTTP connection stays open for instant resume
- **Accurate position tracking**: Wall-clock time tracking (with pause duration compensation) provides accurate playback position via `computed_current_time` in `/status` endpoint
- **Per-session state**: Each client gets an isolated session with independent playback state (tracks, position, rate, pause status)
- **CORS-enabled**: Full cross-origin support for frontend integration

---

## Prerequisites and setup (Ubuntu / macOS)

Below are the commands to install Python, ffmpeg/ffprobe and to prepare the virtual environment.

### 1.1. Ubuntu / Debian

```bash
# update repositories
sudo apt update

# install Python 3, venv and pip
sudo apt install -y python3 python3-venv python3-pip

# install ffmpeg (includes ffprobe)
sudo apt install -y ffmpeg
```


### 1.2. macOS (with Homebrew)

```bash
# install Homebrew if not present: https://brew.sh/
brew update
brew install python ffmpeg
```


### 2. Create and activate the virtual environment (cross-platform)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip setuptools wheel && pip install -r requirements.txt
```

Note: the project requires the system binaries `ffmpeg` and `ffprobe` (installed via apt or brew above). Some distributions may ship older versions: if you need recent features, install ffmpeg from official repositories or a recent build.


### 3. Run the backend

From inside the `videoPlayer` folder (ensure the venv is active):

```bash
source .venv/bin/activate && python video-streamer.py
```

This will start the Flask server on port 5000 (host 0.0.0.0) according to the current implementation.