# Documentation Overview

This folder contains detailed technical explanations of the main subsystems that power the Movie Time Chrome Extension. Each document focuses on a specific core module and describes how it integrates with the rest of the architecture.

- **popup.txt**  
  Describes the popup interface used for signaling, including connection testing, Offer/Answer exchange, autosave behavior, and user-flow logic for creating or joining a P2P session.

- **videoChat.txt**  
  Explains how the video chat works inside the Netflix page, covering fake/real media handling, overlay behavior, user controls (camera, microphone, close), and how the WebRTC streams are managed.

- **sync.txt**  
  Details the synchronization protocol for coordinated playback, including activation handshake, compatibility checks, leader/follower election, heartbeat messages, manual events, drift rules, and degraded-mode behavior.
