# 🎬 Movie Time – P2P Netflix Synchronizer with Video Chat

Movie Time is a Chrome Extension that allows two users to synchronize Netflix playback (play, pause, and seek) and video chat directly peer-to-peer, without any central server, login, or ads. It uses WebRTC for real-time communication and synchronization, with Google STUN servers to establish a direct connection through NAT.

---------------------------------------------------------------------

## 🚀 Features

- 🔄 Sync Play / Pause / Seek between two Netflix users
- 🎥 Built-in Video Chat (audio/video stream via WebRTC)
- 🌍 Fully Peer-to-Peer – no external server, no data stored anywhere
- 🔒 Secure – direct encrypted communication between browsers
- 🧩 Simple Interface – just enable the extension and start the session
- 📺 Overlay Video Window – resizable and floating above the Netflix player
- ⚙️ Manual Sync Activation with Leader/Follower Logic (see “Video Sync Logic”)
- 🆓 Free – relies only on public STUN servers from Google

---------------------------------------------------------------------

## 🧠 How It Works

### 1. Establishing Connection

When you and your friend both open Netflix:
1) Each browser initializes a RTCPeerConnection.
2) One user creates an Offer, copies it and send it to the other user (using an external messaging application).
3) The other user pastes the Offer, generates an Answer, and sends it back.
4) Once both sides exchange Offer/Answer, a direct P2P connection is established using Google’s STUN server.

The STUN server is only used to determine each peer’s public IP and port (NAT traversal). After that, all data and media flow directly between browsers.

---------------------------------------------------------------------

### 2. Media Synchronization

Once connected:
- Both peers inject a content script into the active Netflix tab.
- The script accesses the internal netflix.appContext.state.playerApp.getAPI().videoPlayer to control playback.
- When synchronization mode is enabled, the two browsers maintain a shared playback state using the Leader/Follower model (explained below).

Synchronization is not affected by language or subtitles — only playback time.

---------------------------------------------------------------------

### 3. Video Sync Logic (Leader/Follower Model)

Synchronization activates when either user clicks the Sync button. The user who initiates Sync becomes the Leader, and the other user becomes the Follower.

Leader behavior:
- Periodically sends sync signals (e.g., current playback time and play/pause state) over the WebRTC data channel to keep playback aligned.
- If the Leader presses Play, Pause, or performs a Seek (forward/back), the Follower immediately mirrors the same action and time position.

Follower behavior:
- Applies the Leader’s updates automatically to remain synchronized.
- If the Follower interacts (Play/Pause/Seek), roles switch instantly:
  - The Follower becomes the new Leader.
  - It sends the corresponding Play/Pause/Seek to the former Leader.
  - The former Leader is demoted to Follower.

Conflict-free flow:
- If no Follower interaction occurs, control is unidirectional from Leader to Follower, avoiding conflicts and jitter.
- If the Follower interacts, control becomes bidirectional with an immediate, explicit handover of leadership, ensuring smooth collaboration without desync.

---------------------------------------------------------------------

### 4. Video Chat Overlay

When the connection is established:
- The extension injects a small floating window into the Netflix DOM (watch-video class).
- The overlay shows the remote video stream, your own video preview, and buttons:
  - 🎙️ Mute / Unmute microphone
  - 🎥 Hide / Show camera
  - ❌ Close connection

The overlay remains on top of Netflix, even in full-screen mode, and can be resized or moved freely.

---------------------------------------------------------------------

### 5. Popup Interface

The popup (popup.html) is used to:
- Start or stop a connection
- Copy or paste signaling messages
- Enable or disable synchronization mode

Once the connection is active, the popup automatically closes and the overlay takes over inside Netflix.

---------------------------------------------------------------------

## 🧩 Technologies Used

Technology | Purpose
-----------|---------
TypeScript + Vite | Modern frontend tooling and bundling
Chrome Extensions API (MV3) | Access to browser tabs, scripting, and permissions
WebRTC | Real-time peer-to-peer data and media transfer
STUN (Google) | NAT traversal for discovering public endpoints
HTML/CSS/JS | Popup UI, overlay, and player control
Netflix Player API (unofficial) | Direct access to play/pause/seek within Netflix

---------------------------------------------------------------------

## ⚙️ How to Use

1) Install the extension locally:
   - npm install
   - npm run build
   - Then load the dist/ folder into Chrome → chrome://extensions → Load unpacked.

2) Open Netflix and start a movie or episode.

3) Open the extension popup and establish the P2P session:
   - Click Start Session to generate an Offer (copy it).
   - Share it with your friend (e.g., paste in chat).
   - Your friend pastes it, generates an Answer, and sends it back.
   - Paste their Answer → connection established.

4) The video chat overlay appears on the Netflix page. You can now talk and watch together.

5) Click Enable Sync to activate synchronization:
   - The one who clicks becomes the Leader.
   - Playback actions (Play, Pause, Seek) are mirrored on the other side.
   - If the other user interacts (Play/Pause/Seek), roles switch automatically and instantly.

---------------------------------------------------------------------

## 🔍 Technical Notes

- The STUN server (stun:stun.l.google.com:19302) is used for ICE candidate gathering.
- No TURN server is used — if both peers are behind symmetric NAT, the connection may fail (rare in home networks).
- If the automatic connection fails, users can copy-paste ICE candidates manually via the popup.
- All WebRTC traffic is encrypted by design (DTLS-SRTP).
- No data or metadata ever leaves the two peers’ browsers.

---------------------------------------------------------------------

## 🧪 Future Improvements

- Automatic signaling via Firebase or WebSocket (optional)
- File sharing through WebRTC data channels
- Group watch (multiple peers)
- Persistent friend pairing (reconnect without copy-paste)
- Integrated text chat

---------------------------------------------------------------------

## 🛡️ Privacy & Security

Movie Time never collects or sends any personal data. All communication occurs directly between browsers using end-to-end encrypted WebRTC channels. You retain full control over when and with whom to connect.

---------------------------------------------------------------------

## 📄 License

This project is licensed under the GPL-3.0 License.
