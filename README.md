# Highlight Same Matches

An Obsidian plugin that automatically highlights every occurrence of your selected text throughout the current note — just like Notepad++ does.

## Demo

### Color setting

![demo](media/demo.gif)

---

### Highlight setting

![demo2](media/demo2.gif)

## How it works

Select any word or phrase and matching text instantly lights up with a colored
highlight. Deselect — and the highlights vanish. No commands or hotkeys are
required.

- Real-time highlighting on selection change or text editing
- Ignores single characters and whitespace to keep things clean
- Highlights update live as you edit the document

## Settings

Open **Settings → Community plugins → Highlight Same Matches** to customize
highlighting:

- **Highlight color** — choose a color with the built-in color picker. The
  default color is yellow (`#FFD700`), and the selected color is saved
  automatically.
- **Highlight words only** — enabled by default. When enabled, only complete
  words are highlighted. A word is a continuous sequence of letters; spaces,
  punctuation, and special characters separate words. For example, selecting
  `we` highlights `we` and the `we` in `we are`, but not the fragment inside
  `wealth`. It also treats `we-are` and `we/are` as separate words.

Disable **Highlight words only** to highlight the selected fragment wherever it
appears, including inside larger words such as `wealth`. Settings are restored
after restarting Obsidian or reopening a note.

## Limitations

In Live Preview, rendered Markdown tables are skipped because Obsidian displays
their contents in a separate table view rather than the editable source text.
Switch to **Source mode** to highlight matches inside tables.

## Installation

### From Community Plugins

1. Open Obsidian Settings → Community Plugins;
2. Search for **Highlight Same Matches**;
3. Install and enable the plugin;

### Manual

1. Clone this repository into your vault's `.obsidian/plugins/` directory
2. Rebuild or copy the built `main.js`, `styles.css`, and `manifest.json` into the plugin folder
3. Enable the plugin in Obsidian Settings → Community Plugins

## License

[MIT](LICENSE)
