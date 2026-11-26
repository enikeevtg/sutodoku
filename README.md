# suToDoku

An Obsidian planner for one goal, eight directions and 64 steps.

## Install or update

Requires Obsidian 1.5.7 or later.

Once suToDoku is listed in the community catalog, open **Settings → Community plugins → Browse**, search for **suToDoku**, then install and enable it.

### Manual installation or update

1. Download `main.js`, `manifest.json` and `styles.css`. [Latest GitHub release](https://github.com/enikeevtg/sutodoku/releases/latest)
2. If you're updating, disable suToDoku. Move any legacy plugin folder named `suToDoku` or `open-window-64` out of your vault's plugins directory. Leave your `.mandala` plans where they are.
3. Place the three files in the `sutodoku` folder in your vault's plugins directory (`.obsidian/plugins` by default). Create the folder if needed.
4. Restart Obsidian and enable **suToDoku** under **Community plugins**.

Click the nine-square ribbon icon or run **suToDoku: Create plan** from the command palette to get started.

## Use a plan

- Click a direction to open its block. Use **Back to goal** or **Esc** to return to the central block.
- Click the pencil or double-click a card to edit it. Use the palette to change its color.
- Drag cards to reorder them or use **Alt + arrow keys**. Directions move with their steps and archive.
- Use the check button to confirm filled steps clockwise, skipping empty cards. Confirmed steps turn green and count toward the progress bar.

## Archive

Archive a confirmed step using its archive button. The goal card opens the full archive. A direction card opens its own archive from the central block or from the center of its direction block. Entries show when each step was created, last confirmed and archived.

## Files and export

Plans are stored as `.mandala` files in your vault. **Export to Markdown** creates a separate task list. Edit a plan in one tab at a time to avoid conflicting changes.

## Development

Requires Node.js 20 or later.

```sh
npm install
npm test
npm run build
```

`npm run dev` watches for source changes. To install a local build, copy `main.js`, `manifest.json` and `styles.css` into a `sutodoku` folder in your vault's plugins directory.

Pushing a tag that matches the version in `manifest.json` runs the tests, builds and attests the release files, and publishes them on GitHub.

## License

[MIT](LICENSE)
