### `single purpose`
Movie Time enables two Netflix users to watch the same movie or episode together with perfectly synchronized playback and optional peer-to-peer video chat.
The extension’s single purpose is to provide real-time playback synchronization and in-page video chat between two users while they watch Netflix.
It does this by establishing an encrypted WebRTC connection between the two browsers, synchronizing play/pause/seek actions, and rendering a floating video-chat overlay inside the Netflix page. No secondary features, no unrelated functionality, and no data collection are included.

### `storage`
Used to store temporary session data inside the popup (Offer/Answer text, active step, connection state).  
This lets users close and reopen the popup without losing progress during the manual signaling process.

### `tabs`
Required to detect and interact with the currently active Netflix tab.  
The extension only communicates with the active Netflix tab and does not access browsing history or other sites.

### `clipboardRead`
Used exclusively so the user can paste Offer/Answer codes into the popup.  
Clipboard content is only accessed when the user explicitly performs a paste action.

### Host Permission: `*://*.netflix.com/*`
Needed to inject the content script on Netflix pages.  
This allows the extension to attach the overlay, read playback state, and send play/pause/seek commands for synchronization.

The extension does not collect data, does not track users, and does not read or modify pages outside Netflix.
