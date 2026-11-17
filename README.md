# Image Hider

**Make the images on your website disappear.**

Image Hider is a lightweight Chrome extension that stops images from loading on the sites you choose. Instead of hiding images after they arrive, it blocks the requests at the network layer — saving data, speeding up pages, and cutting off image-based tracking pixels.

## Features

- **One-click blocking for the current site** — flip the main toggle and reload.
- **Add to list** — keep a site blocked on every visit. Turning on a new site blocks it temporarily until you add it.
- **Per-site controls** — pause or resume blocking for any saved site without deleting the record.
- **Light and dark themes** — starts in light mode; the toggle in the header remembers your choice.
- **Syncs with your browser** — your list follows your Chrome profile, so it is there on your other signed-in devices.
- **No data collection** — no analytics, accounts, or third-party services.

## Install in your browser

Image Hider is not on the Chrome Web Store yet. You can install it from source in under a minute.

1. **Download the code** — click **Code → Download ZIP** on this repository, then extract the archive. You can also clone the repository with Git.
2. Open your browser's extensions page:
   - Chrome — `chrome://extensions`
   - Edge — `edge://extensions`
   - Brave — `brave://extensions`
   - Opera — `opera://extensions`
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the project folder — the one that contains `manifest.json`.
5. Pin Image Hider from the puzzle-piece menu so the popup is one click away.

That's it. Open any website and click the toolbar icon.

> Requires Chrome 101 or newer, or a Chromium-based browser built on it.

### Update the extension

After downloading new code, open the extensions page and click the reload icon on the Image Hider card.

## Privacy

Image Hider does not collect, transmit, or sell any data. There are no analytics, accounts, or third-party services in the extension.

Your blocked-sites list is stored with `chrome.storage.sync`, which is managed by your browser. If Chrome sync is enabled, the list syncs across your signed-in devices. The extension does not send it anywhere else.

## Contributing

Issues and pull requests are welcome. If you report a bug, please include your browser version and, if you are comfortable sharing it, the site where the problem happened.

## Credits

The popup uses the [Nunito](https://fonts.google.com/specimen/Nunito) typeface by the Nunito Project Authors, licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/).
