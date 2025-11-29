# 🎬 Movie Time – P2P Netflix Synchronizer with Video Chat

Movie Time is a Chrome Extension that allows two users to watch Netflix together with synchronized playback and built-in video chat over a direct peer-to-peer WebRTC connection. There is no central server, no login, and no tracking: audio, video, and sync messages go directly between the two browsers, using public Google STUN servers only for NAT traversal.

---------------------------------------------------------------------

## 🚀 Features

- 🔄 Sync Play / Pause / Seek between two Netflix users
- 🎥 Built-in Video Chat (audio/video stream via WebRTC)
- 🌍 Fully Peer-to-Peer – no backend, no accounts, no data stored anywhere
- 🔒 Secure – all media and data go through encrypted WebRTC channels
- 🧩 Simple UX – use the popup to connect, then control everything from an in-page overlay
- 📺 Floating Overlay Window – resizable, draggable video chat on top of the Netflix player
- ⚙️ Sync Protocol with duration check, deterministic leader/follower and heartbeat
- 🧪 NAT Self-Test – built-in network diagnostic to detect restrictive NATs before starting a session
- 🆓 Free – relies only on public STUN servers from Google

---------------------------------------------------------------------

## 🧠 How It Works

### 1. Establishing Connection

When you and your friend/partner both open Netflix in Chrome:

1. Each browser creates a `RTCPeerConnection`.
2. One user opens the extension popup and chooses whether to:
   - **Test Connection** (runs a local NAT diagnostic),  
   - **Create a Session** (generate an Offer), or  
   - **Connect to a Session** (paste a remote Offer to create an Answer).
3. The Offer is copied and sent to the other user through any external channel (chat, email, etc.).
4. The second user pastes the Offer into their popup, generates an Answer, and sends it back.
5. The first user pastes the Answer into their popup to complete the signaling.

Once Offer and Answer are exchanged on both sides, the peer connections complete ICE gathering using Google STUN servers. After that, all media streams and sync messages flow directly between the two browsers over encrypted WebRTC.

The popup’s job **ends here**: it is only responsible for signaling. Video chat, synchronization, and UI all live inside the Netflix tab.

---------------------------------------------------------------------

### 2. NAT Self-Test (Popup)

The popup includes a **NAT Test** button.  
This feature performs a STUN-based local diagnostic to estimate how P2P-friendly your network is:

- 🟢 **Green**: high chance of successful WebRTC P2P  
- 🟡 **Yellow**: may work, depends on network conditions  
- 🔴 **Red**: very unlikely to succeed (VPNs, corporate networks, CGNAT)  

The test never contacts the other peer and does not send any data outside your browser.

---------------------------------------------------------------------

### 3. Media Synchronization

After the P2P connection is established, both peers inject a content script into their active Netflix tab. This script:

- injects a small “bridge” into the Netflix page that talks directly to the **Netflix player** and the underlying `<video>` tag;
- reads playback state (current time, paused/playing, duration);
- sends periodic “ticks” from the page to the content script;
- receives commands like Play, Pause, Seek from the sync logic and forwards them to Netflix.

When synchronization is enabled, the two peers maintain a shared playback state through a dedicated WebRTC data channel. Only playback time/state is synchronized; audio/subtitles remain local.

---------------------------------------------------------------------

### 4. Video Sync Logic (Leader/Follower Model)

Synchronization is controlled entirely through the overlay inside the Netflix page:

- each user has a **Sync** toggle button;
- when enabled, the client sends an activation message to the peer;
- sync becomes active only when **both** users enable sync.

When both sides are activating:

1. Each side exchanges activation metadata.
2. Durations are compared for compatibility.
3. A deterministic **leader** and **follower** are elected.
4. A full state is sent from the leader to the follower.

Sync deactivation is symmetric:

- if one user disables sync, both sides exit the synced state,
- UI reflects that sync is off for both,
- either user may re-enable sync at any time to start a new session.

---------------------------------------------------------------------

### 5. Video Chat Overlay

When the WebRTC connection is ready, Movie Time injects a floating overlay on top of the Netflix player. It includes:

- **remote video** (large),
- **local preview** (small corner video),
- a control bar with:
  - Sync toggle + compact sync status label (phase, role, drift, compatibility),
  - Microphone toggle,
  - Camera toggle,
  - Close button.

The microphone/camera buttons toggle the local audio/video track. If the hardware is missing or permissions are denied, the toggle shows an error and remains off.

The overlay:

- is draggable,
- is resizable,
- stays visible in fullscreen thanks to automatic relocation.

---------------------------------------------------------------------

### 6. Popup Interface

The popup (popup.html) provides four functions:

- 🧪 **Test Connection** (NAT diagnostic)
- 🎬 **Create Session** (generate Offer)
- 🔗 **Connect to Session** (paste Offer → generate Answer)
- 🔁 **Apply Answer** (caller pastes Answer)

The popup stores intermediate fields so you can close and reopen it without losing text.

Once signaling is complete, the popup is no longer needed.

---------------------------------------------------------------------

## 🧩 Technologies Used

Technology | Purpose
-----------|---------
TypeScript + Vite | Modern development & bundling for MV3
Chrome Extensions API (MV3) | Popup, background SW, content scripts
WebRTC | Peer-to-peer media + data channel sync
STUN (Google) | ICE candidate discovery
HTML/CSS/JS | Overlay UI & popup UI
Netflix Player API (unofficial) + HTML `<video>` | Playback control

---------------------------------------------------------------------

## ⚙️ How to Use

1) **Install the extension locally**
   - clone the repo, install dependencies, build:
      ```bash
      npm install
      npm run build
      ```
   - if you want to release a new version:
   ```bash
      cd dist
      zip -r ../movie-time-1.2.0.zip .
   ```
   - open `chrome://extensions/`
   - enable Developer Mode
   - Load unpacked → select the `dist/` folder

2) **Open Netflix and choose a title**  
   Both users must manually navigate to the same movie or episode.

3) **Establish the P2P connection via the popup**
   - User A → Create Offer → copy it  
   - User B → Paste Offer → Generate Answer  
   - User A → Paste Answer → connect  

4) **Start the video chat**
   The overlay appears automatically.  
   If autoplay is blocked, click “start call”.

5) **Enable playback sync from the overlay**
   - both users toggle Sync ON,
   - the protocol runs compatibility checks and leader/follower election,
   - playback becomes synchronized.

You can disable sync at any moment.  
Disabling it on either side terminates the sync session for both.

---------------------------------------------------------------------

## 🔍 Technical Notes

- Uses only Google STUN (`stun:stun.l.google.com:19302`)
- No TURN server – restrictive NATs may block P2P
- All WebRTC streams are encrypted (DTLS-SRTP)
- No personal data ever sent to external servers
- Sync protocol uses deterministic leader election + heartbeat

---------------------------------------------------------------------

## 🧪 Future Improvements

- Automatic signaling via backend / WebSocket
- More than two peers
- Text chat inside overlay
- Alternative sync strategies (soft drift correction)

---------------------------------------------------------------------

## 🛡️ Privacy & Security

Movie Time does not collect, store, or transmit personal data.  
All video, audio, and sync messages stay between you and your partner over encrypted channels.

---------------------------------------------------------------------

## 📄 License

This project is licensed under the GPL-3.0 License.
