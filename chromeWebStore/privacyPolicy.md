# Privacy Policy – Movie Time

_Last updated: 29/11/2025_

Movie Time is a Chrome extension that allows two users to watch Netflix together with synchronized playback and optional peer-to-peer video chat.  
Your privacy is extremely important to us.  
This policy explains what data is collected, how it is used, and how your information is protected.

---

## 1. Summary

- Movie Time does **not** collect, store, or share any personal data.  
- No data is sent to any external server.  
- All communication (video, audio, sync messages) happens **directly between the two users’ browsers** over encrypted WebRTC.  
- You remain in full control of what is shared, when the connection starts, and when it ends.

---

## 2. Information We Do Not Collect

Movie Time does **not** collect, store, track, or transmit:

- Names or email addresses  
- IP addresses  
- Netflix account data  
- Browsing history  
- Playback choices, subtitles, or preferences  
- Video or audio streams  
- Any identifiers or analytics  
- Cookies or session information  

The extension includes **no telemetry, no analytics, no logging to remote servers**, and no code that attempts to identify or track users.

---

## 3. Information Processed Locally on Your Device

The following data is handled **only inside your browser** and never leaves your device unless you manually share it.

### Peer Connection Data (Offer/Answer)
To establish a peer-to-peer WebRTC session, the popup generates an Offer or Answer.  
These are:
- kept locally in memory,
- optionally stored in local extension storage,
- shared **only** if you manually copy and paste them.

Movie Time never uploads this data anywhere.

### Playback Information
The extension reads the local Netflix video player’s:
- current time  
- paused/playing state  
- media duration  

This information is used **solely** to synchronize playback with the remote peer over the WebRTC data channel.  
It is not logged or stored.

### Camera and Microphone
If you enable video chat, the browser may request permission to access:
- your camera  
- your microphone  

These streams are:
- used only for real-time video chat,
- transmitted directly to the peer via encrypted WebRTC,
- never recorded,
- never sent to a server,
- never stored by the extension.

Disabling the camera or microphone stops transmission immediately.

---

## 4. Peer-to-Peer Communication (WebRTC)

Video chat, audio chat, and playback sync use WebRTC.  
This means:

- Data flows **directly** between the two users’ devices whenever possible.
- All communication is encrypted using DTLS-SRTP.
- The only external service used is Google’s public STUN server for NAT traversal:  
  `stun:stun.l.google.com:19302`
- No TURN or relay servers are used.  
- No third party ever sees your media or data.

---

## 5. Chrome Permissions

Movie Time requests only the minimum permissions needed:

### `storage`
Stores temporary session state (locally only).

### `tabs`
Used to detect and interact with the active Netflix tab.

### `clipboardRead`
Allows pasting Offer/Answer codes into the popup.

### Host Permission: `*://*.netflix.com/*`
Required to inject the overlay and control playback sync on Netflix pages.

Movie Time does not run on other domains and does not access any other sites.

---

## 6. Data Sharing

Movie Time does **not** share any data with:
- third parties  
- advertisers  
- analytics platforms  
- remote servers  

All data either stays on your device or goes directly to the peer you manually choose to connect with.

---

## 7. Children’s Privacy

Movie Time is not marketed to children and collects no data from users of any age.

---

## 8. Security

Because Movie Time operates entirely peer-to-peer:
- no servers store user data,
- no logs are kept,
- no central system can be compromised.

Users remain responsible for choosing who they connect with and what they share.

---

## 9. Changes to This Policy

This policy may be updated periodically.  
Any updates will be reflected on this page, and the “Last updated” date will be modified accordingly.

---

## 10. Contact

For questions, suggestions, or concerns related to privacy, please contact:

- **[Dev email](dev.movietime@gmail.com)**
