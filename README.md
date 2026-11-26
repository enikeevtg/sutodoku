# suToDoku

An Obsidian planner for one goal, eight directions and 64 steps. The central block holds your goal and directions; each surrounding block contains eight steps toward one direction.

## Install or update

Requires Obsidian 1.5.7 or later.

Once suToDoku is listed in the community catalog, open **Settings → Community plugins → Browse**, search for **suToDoku**, then install and enable it.

### Manual installation or update

1. Download `main.js`, `manifest.json` and `styles.css`. [Latest GitHub release](https://github.com/enikeevtg/sutodoku/releases/latest)
2. If you're updating, disable suToDoku. Move any legacy plugin folder named `suToDoku` or `open-window-64` out of your vault's plugins directory. Leave your `.mandala` plans where they are.
3. Place the three files in the `sutodoku` folder in your vault's plugins directory (`.obsidian/plugins` by default). Create the folder if needed.
4. Restart Obsidian and enable **suToDoku** under **Community plugins**.

Click the nine-square ribbon icon or run **suToDoku: Create plan** from the command palette to get started.

## Edit and navigate

- Click a direction to enlarge its block. Click the block's center, **Back to goal**, or press **Esc** to return to the central block.
- A direction card keeps the same screen position and size when its block opens. Wider gaps keep surrounding cards visible; text and padding scale with each block, preserving line wrapping in the background.
- Expanded blocks share one grid: cards span 16% of the board, gaps span 6%, and neighboring card centers are 22% apart. Overlapping positions coincide across blocks: for example, row 2, column 3 of the top-left block matches row 1, column 2 of the central block.
- Click a step to toggle selection. Each direction can retain one selected step.
- Click the pencil or double-click a card to edit its text. **Enter** confirms the text, **Shift+Enter** inserts a newline, and **Esc** discards edits and closes the dialog. Confirming text does not mark the step as completed.
- Text around 40 characters fits inside an active card. Longer text can scroll. Narrow windows allow horizontal scrolling of the board.
- The palette button opens a color preview. **Save** applies it; **Cancel** or **Esc** restores the original color. **Reset color** removes the override. Steps without their own color inherit a muted version of their direction's color.
- Drag between cards to insert a card along the clockwise path. The line at the midpoint of the gap shows the insertion position; intervening cards shift. Keyboard alternative: **Alt + arrow keys**. Directions move together with their steps and archive. The goal and the centers of direction blocks stay fixed.
- Routes connect filled steps clockwise and end at the direction's center. Lines and arrowheads have matching colors and stay behind cards. A single filled step connects directly to the center; empty blocks have no route.

## Confirm steps

The check button confirms a step as completed. Filled steps must be confirmed in clockwise order, skipping empty cards. A completed step cannot be unconfirmed while any later step is completed; undo confirmations in reverse order.

Confirmed steps turn green. A direction is automatically completed when it has no filled steps or when all of its filled steps are confirmed. The progress bar counts only filled steps.

Creation time is recorded when an empty card first receives text. Editing or moving a card preserves its creation time. Each new step confirmation updates its last confirmation time; removing the check preserves the previous confirmation time. Clearing a card removes its timestamps and completion state, so filling it again starts a new card. Goal and direction cards also retain creation times; directions record the time they become automatically completed.

## Archive

Only filled, confirmed steps can be archived. Click the archive button on a step to move it into that direction's archive; the remaining steps shift clockwise to fill its place. The trash button on a live step deletes it without archiving.

Click the archive button on the main goal card to see entries from all directions. Each row shows its direction and matches the current color of that direction's center card.

Click the archive button on a direction card in the central block or in the center of its own block to view that direction's archived steps. The table contains:

- Card text
- Creation date and time
- Last confirmation date and time
- Archiving date and time
- A trash button at the end of each row

Rows are sorted by last confirmation time, newest first. The trash button removes that archived card and saves the change immediately.

Timestamps are stored as UTC ISO strings and displayed in your local timezone with the timezone shown. Existing plans remain compatible. Historical timestamps that were never recorded are shown as **—**; legacy archive entries without a confirmation date appear last.

## Undo and redo

Press **Cmd/Ctrl+Z** to undo the last change, including deleting a live card, archiving a card, or deleting an archive row. **Cmd/Ctrl+Shift+Z** redoes the change. The toolbar also has **Undo** and **Redo** buttons. Undo and redo work inside the archive dialog as well.

Restoring a card restores its text, position, color, timestamps and completion state. Restored changes are saved to the plan immediately. In the text editor, the shortcuts keep their normal text-editing behavior.

Each open plan keeps up to 100 actions in memory. Opening or reloading a plan clears its history; actions performed before this update or before opening the plan cannot be recovered. Making a new change after undo discards the redo history.

## Files and export

**New plan** creates a separate `.mandala` JSON file. The filename follows the main goal when a plan is opened or saved, including Undo/Redo. Unsupported filename characters are replaced with spaces and long names are shortened; the goal text itself is preserved. Name collisions receive a numeric suffix. Empty goals use `suToDoku`. The file explorer displays a **suToDoku** badge in place of **MANDALA**; the underlying `.mandala` file format remains compatible.

Files can be moved using Obsidian. **Export to Markdown** creates and opens a separate Markdown task list; changes to that copy do not sync back into the plan.

Plans, card timestamps, colors and archives are stored in the vault. No data is sent over the network. Disabling the plugin leaves plan files intact.

## Development

Requires Node.js 20 or later.

```sh
npm install
npm test
npm run build
```

`npm run dev` watches for source changes. To install a local build, copy `main.js`, `manifest.json` and `styles.css` into a `sutodoku` folder in your vault's plugins directory.

Pushing a tag that matches the version in `manifest.json` runs the tests, builds and attests the release files, and publishes them on GitHub.

## Limitations

The interface is English. Simultaneous edits to the same plan in multiple tabs or devices are not merged automatically. Edit a plan in one tab and resolve sync conflicts through your vault. There are no deadlines, reminders or two-way Markdown synchronization.

## License

[MIT](LICENSE)
