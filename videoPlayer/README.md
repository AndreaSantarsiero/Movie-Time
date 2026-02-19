# Video Player

## Overview

Questo progetto fornisce un semplice server locale che trascodifica e streamma file multimediali (es. mp4, mkv) verso una web-app. L'architettura è pensata per l'uso su una singola macchina o in una rete di fiducia: un utente avvia il backend Python, apre il frontend HTML locale, seleziona un file multimediale e lo riproduce nel browser. Il backend usa `ffprobe` per scoprire tracce e durata, e `ffmpeg` per produrre un MP4 frammentato in streaming.

Il design privilegia la reattività (play/pause/seek senza dover riaprire la connessione) e una gestione per-sessione dello stato di riproduzione. Il porgetto attualmente supporta solamente sistemi Ubuntu e macOS

---

## Frontend Architecture

Il frontend è una single page application contenuta in `video-player.html`. Le responsabilità principali sono:

- Gestire la sessione con il backend (`/session`).
- Consentire all'utente di inserire o scegliere un percorso file e richiedere i metadati via `/tracks` (audio/subtitle/durata).
- Applicare le scelte di tracce con `/select_tracks` e inviare comandi di controllo (`/control`): `play`, `pause`, `seek`, `set_rate`.
- Avviare la riproduzione impostando `video.src` su `/stream?path=...&session_id=...` e aggiornare la UI facendo polling su `/status` per ottenere `computed_current_time`.

Il player include controlli standard (play/pause, seek, volume, playback rate, PiP, fullscreen) e gestisce tentativi di riconnessione se lo stream si interrompe.

---

## Backend Architecture

Il backend è implementato in `video-streamer.py` con Flask e i seguenti ruoli:

- Validazione dei percorsi locali tramite la variabile d'ambiente `MEDIA_ROOT`. Per sicurezza, impostare `MEDIA_ROOT` a una cartella limitata prima di esporre il server.
- Analisi del file con `ffprobe` per estrarre tracce audio/sottotitoli e la durata.
- Gestione per-sessione dello stato (`sessions`) con lock per la mutua esclusione: `is_playing`, `current_time`, `playback_rate`, tracce selezionate e timestamp per calcolare la posizione reale (`computed_current_time`).
- Generazione dello stream: quando il client richiede `/stream`, il server avvia `ffmpeg` (output su `pipe:1` con `-movflags frag_keyframe+empty_moov+default_base_moof`) e inoltra i byte MP4 al browser. La pausa è implementata sfruttando il backpressure: quando la sessione è in pausa il processo di lettura non consuma stdout, rallentando `ffmpeg` senza chiudere la connessione.

Endpoint principali:

- `POST /session` e `GET /session?session_id=...` — crea/verifica sessioni.
- `GET /tracks?path=...` — esegue `ffprobe` e restituisce `audio`, `subtitles`, `duration`.
- `POST /select_tracks` — imposta `selected_audio`/`selected_subtitle` nella sessione.
- `POST /control` — azioni: `play`, `pause`, `seek` (campo `time`), `set_rate` (campo `rate`).
- `GET /status?session_id=...` — restituisce stato sessione + `computed_current_time` quando in riproduzione.
- `GET /stream?path=...&session_id=...` — stream MP4 generato da `ffmpeg`.

Note operative:

- `ffmpeg` e `ffprobe` devono essere presenti nel `PATH` (installare via apt/brew).
- Impostare `MEDIA_ROOT` per limitare l'accesso ai file e ridurre rischi di esposizione del filesystem.
- Per problemi di compatibilità o prestazioni, valutare l'uso di HLS/DASH o di un sistema basato su file temporanei per sottotitoli esterni.

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
# optional: change MEDIA_ROOT default value with the following command
# export MEDIA_ROOT=/path/to/media

source .venv/bin/activate && python video-streamer.py
```

This will start the Flask server on port 5000 (host 0.0.0.0) according to the current implementation.