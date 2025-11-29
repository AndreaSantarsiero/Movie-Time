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
