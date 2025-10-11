# 🎬 Movie Time – Peer-to-Peer Netflix Synchronizer with Video Chat

Movie Time is a Chrome Extension that allows two users to synchronize Netflix playback (play, pause, and seek) and video chat directly peer-to-peer, without any central server, login, or ads.  
It uses WebRTC for real-time communication and synchronization, with Google STUN servers to establish a direct connection through NAT.

---------------------------------------------------------------------

## 🚀 Features

- 🔄 Sync Play / Pause / Seek between two Netflix users  
- 🎥 Built-in Video Chat (audio/video stream via WebRTC)  
- 🌍 Fully Peer-to-Peer – no external server, no data stored anywhere  
- 🔒 Secure – direct encrypted communication between browsers  
- 🧩 Simple Interface – just enable the extension and start the session  
- 📺 Overlay Video Window – resizable and floating above the Netflix player  
- ⚙️ Manual Sync Activation  
- 🆓 Free – relies only on public STUN servers from Google  

---------------------------------------------------------------------

## 🧠 How It Works

### 1. Establishing Connection

When you and your friend both open Netflix:
1. Each browser initializes a RTCPeerConnection with:
   new RTCPeerConnection({
     iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
   });
2. One user creates an Offer and copies it (base64 or JSON text).
3. The other user pastes the Offer, generates an Answer, and sends it back.
4. Once both sides exchange Offer/Answer (via copy-paste or a shared link), a direct P2P connection is established using Google’s STUN server.

The STUN server is only used to determine each peer’s public IP and port (NAT traversal).  
After that, all data and media flow directly between browsers.

---------------------------------------------------------------------

### 2. Media Synchronization

Once connected:
- Both peers inject a content script into the active Netflix tab.
- The script accesses the internal netflix.appContext.state.playerApp.getAPI().videoPlayer
  to control playback.
- Whenever a peer presses Play, Pause, or seeks to a new timestamp,
  the current playback time is sent through the WebRTC data channel.
- The remote peer updates its Netflix player accordingly to stay in sync.

Synchronization is not affected by language or subtitles — only playback time.

---------------------------------------------------------------------

### 3. Video Chat Overlay

When the connection is established:
- The extension injects a small floating window into the Netflix DOM (watch-video class).  
- The overlay shows the remote video stream, your own video preview, and buttons:
  - 🎙️ Mute / Unmute microphone  
  - 🎥 Hide / Show camera  
  - ❌ Close connection

The overlay remains on top of Netflix, even in full-screen mode,  
and can be resized or moved freely.

---------------------------------------------------------------------

### 4. Popup Interface

The popup (popup.html) is only used to:
- Start or stop a connection
- Copy or paste signaling messages
- Enable or disable sync mode

Once the connection is active, the popup automatically closes  
and the overlay takes over inside Netflix.

---------------------------------------------------------------------

## 🧩 Technologies Used

| Technology | Purpose |
|-------------|----------|
| TypeScript + Vite | Modern frontend tooling and bundling |
| Chrome Extensions API (MV3) | Access to browser tabs, scripting, and permissions |
| WebRTC | Real-time peer-to-peer data and media transfer |
| STUN (Google) | NAT traversal for discovering public endpoints |
| HTML/CSS/JS | Popup UI, overlay, and player control |
| Netflix Player API (unofficial) | Direct access to play/pause/seek within Netflix |

---------------------------------------------------------------------

## ⚙️ How to Use

1. Install the extension locally:
   npm install
   npm run build
   Then load the dist/ folder into Chrome → chrome://extensions → Load unpacked.

2. Open Netflix and choose a movie or episode.

3. Open the extension popup:
   - Click Start Session to generate an Offer (copy it).
   - Share it with your friend (e.g., paste in chat).
   - Your friend pastes it, generates an Answer, and sends it back.
   - Paste their Answer → connection established.

4. 🎥 Video chat window appears on the Netflix page.  
   You can now talk and watch together!

5. 🔄 Press Enable Sync if you want both players to stay synchronized.

---------------------------------------------------------------------

## 🔍 Technical Notes

- The STUN server (stun:stun.l.google.com:19302) is used for ICE candidate gathering.
- No TURN server is used — if both peers are behind symmetric NAT, the connection may fail (rare in home networks).
- If the automatic connection fails, users can always copy-paste the ICE candidates manually via the popup.
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

Movie Time never collects or sends any personal data.  
All communication occurs directly between browsers using end-to-end encrypted WebRTC channels.  
You retain full control over when and with whom to connect.

---------------------------------------------------------------------

## 📄 License

This project is licensed under the GPL-3.0 License.
