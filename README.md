# Field

Consented study log. One tap starts a session: this phone records audio, a live transcript (when the browser allows it), and location metadata until you stop. A visible REC indicator stays on. No hidden mic.

Conversations are split after 45 seconds of silence. Transcripts are analyzed on-device. Audio stays in IndexedDB on this device.

No account. No Field server. Export JSON from Settings (audio blobs stay on the phone).

## Install

- iPhone: Safari, Share, Add to Home Screen. Keep Field open while recording (iOS suspends background capture in a PWA).
- Android: browser menu, Add to Home screen.

Live captions may use Apple or Google speech services. Prefer Chrome for on-screen transcript.

## Pages

Vite base is ./ so a project site works. CI builds on push to main.
