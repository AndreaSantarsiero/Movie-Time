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
- 🆓 Free – relies only on public STUN servers from Google

---------------------------------------------------------------------

## 🧠 How It Works

### 1. Establishing Connection

When you and your friend/partner both open Netflix in Chrome:

1. Each browser creates a `RTCPeerConnection`.
2. One user opens the extension popup and creates an **Offer** (local SDP).
3. That Offer is copied and sent to the other user through any external channel (chat, email, etc.).
4. The second user pastes the Offer into their popup, generates an **Answer**, and sends it back.
5. The first user pastes the Answer into their popup.

Once Offer and Answer are exchanged on both sides, the peer connections complete ICE gathering using Google STUN servers. After that, all media streams and sync messages flow directly between the two browsers over encrypted WebRTC.

The popup’s job ends here: it is only responsible for WebRTC signaling (Offer/Answer exchange). Everything else (video chat UI, sync controls, status) is handled inside the Netflix tab by the in-page overlay.

---------------------------------------------------------------------

### 2. Media Synchronization

After the P2P connection is established, both peers inject a content script into their active Netflix tab. This script:

- injects a small “bridge” script into the page that talks to the **Netflix player** and to the underlying HTML `<video>` element;
- reads playback state (current time, paused/playing, duration) from the video element;
- sends periodic “ticks” from the page context to the content script;
- receives commands like Play, Pause, Seek from the sync logic and forwards them to the Netflix player.

When synchronization mode is enabled, the two browsers maintain a shared playback state through a dedicated WebRTC **data channel**. Only playback time and state are synchronized; language, audio track and subtitles remain independent for each user.

---------------------------------------------------------------------

### 3. Video Sync Logic (Leader/Follower Model)

Synchronization is controlled entirely from the overlay inside the Netflix page. Each user has a **Sync** button. The sync protocol is explicitly designed for the case “two users on the same Netflix page watching the same title.”

When a user turns on sync, their client enters an “activating” phase and sends an activation message to the peer. Sync becomes fully active only when both sides have:

- enabled sync,
- exchanged each other’s activation message.

At that point, each side independently checks if the media are compatible. The two durations are compared using a relative difference; if that difference exceeds a configurable ratio (for example 1%), the content is considered incompatible and sync is not established. If durations are compatible, the protocol begins to sinchronize the two players.

Sync deactivation is fully symmetric. When a user disables sync in the overlay, their client sends a deactivation message to the peer, stops generating sync messages, and stops reacting to incoming sync messages. The peer, upon receiving deactivation, leaves the synced state and returns to normal, independent playback, without altering the current position any more than necessary. If either user later re-enables sync, the protocol runs a full setup again and eventually begins to sinchronize the two players.

---------------------------------------------------------------------

### 4. Video Chat Overlay

When the WebRTC connection is established and the page has access to the camera and microphone, Movie Time injects a compact floating overlay on top of the Netflix player. This overlay contains two video elements: a larger one for the **remote** stream and a smaller preview for the **local** webcam, usually shown in a corner.

The overlay includes a control bar that appears when the user moves the mouse over the window or focuses it via keyboard. The bar provides:

- a **Sync** toggle button that enables or disables playback synchronization for that user;
- a short **status label** showing a compact view of the sync state (phase, role, compatibility, drift);
- a **microphone button** to mute or unmute the local audio tracks;
- a **camera button** to enable or disable the local video tracks;
- a **close button** to remove the overlay from the page.

The microphone and camera buttons directly toggle the enabled state of the corresponding local media tracks. When a track type is disabled, the button is visually marked as “off” so that it is obvious whether you are currently sending audio or video. The close button removes the overlay UI from the current page; the underlying WebRTC connection itself remains established until the tab is closed or reloaded.

The overlay window is fully draggable and resizable, you can drag it by clicking and holding on any non-interactive area. A relocation mechanism monitors fullscreen changes and ensures that the overlay stays visible even when Netflix enters fullscreen.

---------------------------------------------------------------------

### 5. Popup Interface

The popup (popup.html) is intentionally minimal and focused on signaling only. It is used to:

- start or join a P2P session by generating an Offer,
- paste a remote Offer to generate an Answer,
- paste a remote Answer to complete the WebRTC negotiation,
- display basic error messages related to signaling.

The popup doesn't control video chat or playback synchronization. Once the connection is established and the overlay is visible in the Netflix tab, you can safely close the popup and ignore it for the rest of the session.

---------------------------------------------------------------------

## 🧩 Technologies Used

Technology | Purpose
-----------|---------
TypeScript + Vite | Modern development experience and bundling for MV3
Chrome Extensions API (MV3) | Content scripts, background service worker, popup, permissions
WebRTC | Real-time peer-to-peer media and data (video, audio, sync messages)
STUN (Google) | NAT traversal and ICE candidate discovery
HTML/CSS/JS | Popup UI, overlay UI, and in-page integration
Netflix Player API (unofficial) + HTML `<video>` | Playback control (play/pause/seek) and accurate timing/duration

---------------------------------------------------------------------

## ⚙️ How to Use

1) **Install the extension locally**
   - clone this repository, open a terminal in the root folder and type
      ```bash
      npm install
      npm run build
      ```
   - Open `chrome://extensions/` in Chrome  
   - Enable “Developer mode”  
   - Click **Load unpacked** and select the `dist/` folder.

2) **Open Netflix and choose a title**

   - Both users should open Netflix in Chrome.
   - Each user manually navigates to the same movie or episode.

3) **Establish the P2P connection via the popup**

   - User A opens the Movie Time popup and clicks to create an **Offer**.
   - User A copies the Offer text and sends it to User B (e.g. via chat).
   - User B pastes the Offer into their popup and generates an **Answer**.
   - User B sends the Answer back to User A.
   - User A pastes the Answer into the popup to complete the connection.

4) **Start the video chat**

   - Once signaling is complete and `getUserMedia` is granted, the overlay appears on top of Netflix.
   - You should see your own camera in the small preview and your partner’s video in the main area.
   - If the remote video does not autoplay, click the “start call” button that appears inside the overlay.

5) **Enable playback sync from the overlay**

   - Each user can click the **Sync** button in the overlay to enable sync.
   - When both sides have sync enabled and the durations match, the protocol runs:
     - duration compatibility check,
     - deterministic leader/follower election based on activation timestamps,
     - initial full state from leader to follower for a hard lock-on.
   - After that, the leader sends periodic heartbeat updates and both sides can generate manual sync events by interacting with the Netflix player.
   - You can toggle sync off at any time; playback on both sides will continue independently from that point.

---------------------------------------------------------------------

## 🔍 Technical Notes

- The extension uses Google’s public STUN server (`stun:stun.l.google.com:19302`) for ICE candidate gathering.
- No TURN server is used; in rare cases of very restrictive or symmetric NATs, the peer-to-peer connection might fail.
- All WebRTC traffic (media and data channel) is encrypted by design using DTLS-SRTP.
- All messages travel over a WebRTC data channel; there is no central relay.
- The extension does not send any data to external servers.

---------------------------------------------------------------------

## 🧪 Future Improvements

Planned or possible future improvements include:

- Automatic signaling via a lightweight backend or WebSocket service.
- Group watch for more than two peers sharing the same session.
- Integrated text chat in the overlay alongside the video chat.
- Additional sync profiles (for example “strict” vs “relaxed”) tuned for different network conditions and devices.
- More advanced “soft” correction strategies that gradually compensate small drift instead of relying only on hard seek thresholds.

---------------------------------------------------------------------

## 🛡️ Privacy & Security

Movie Time does not collect, store, or transmit personal data to any third-party server. All communication happens directly between the two browsers over end-to-end encrypted WebRTC channels. You are always in control of when to start or stop a session, who you share your Offer/Answer with, and when to enable or disable video, audio, and synchronization.

---------------------------------------------------------------------

## 📄 License

This project is licensed under the GPL-3.0 License.
