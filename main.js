const { Plugin, PluginSettingTab, Setting } = require('obsidian');
const { StateField, StateEffect } = require('@codemirror/state');
const { EditorView, Decoration, ViewPlugin } = require('@codemirror/view');

const DEFAULT_SETTINGS = {
  highlightColor: '#FFD700',
  highlightWordsOnly: true
};

// Effect for dynamically updating highlights
const setHighlights = StateEffect.define();

// State field for storing and applying decorations
const highlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(highlights, tr) {
    highlights = highlights.map(tr.changes);
    for (let ef of tr.effects) {
      if (ef.is(setHighlights)) return ef.value;
    }
    return highlights;
  },
  provide: f => EditorView.decorations.from(f)
});

module.exports = class HighlightMatchesPlugin extends Plugin {
  async onload() {
    console.log('Loading highlight matches plugin...');
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.editorViews = new Set();
    this.applyHighlightColor();
    this.addSettingTab(new HighlightMatchesSettingTab(this.app, this));

    // Register editor extensions in Obsidian
    this.registerEditorExtension([
      highlightField,
      this.createHighlightExtension()
    ]);
  }

  onunload() {
    document.body?.style.removeProperty('--highlight-matches-color');
    document.body?.style.removeProperty('--highlight-matches-background');
    console.log('Unloading highlight matches plugin.');
  }

  applyHighlightColor() {
    const color = this.settings.highlightColor;
    document.body?.style.setProperty('--highlight-matches-color', color);
    document.body?.style.setProperty(
      '--highlight-matches-background',
      hexToRgba(color, 0.3)
    );
  }

  async setHighlightColor(color) {
    this.settings.highlightColor = color;
    this.applyHighlightColor();
    await this.saveData(this.settings);
  }

  async setHighlightWordsOnly(value) {
    this.settings.highlightWordsOnly = value;
    await this.saveData(this.settings);
    for (const view of this.editorViews) {
      this.updateHighlights(view);
    }
  }

  createHighlightExtension() {
    return ViewPlugin.define((view) => {
      this.editorViews.add(view);

      return {
        update: (update) => {
          if (update.selectionSet || update.docChanged) {
            this.updateHighlights(update.view);
          }
        },
        destroy: () => {
          this.editorViews.delete(view);
        }
      };
    });
  }

  updateHighlights(view) {
    const state = view.state;
    const selection = state.selection.main;

    if (selection.empty) {
      view.dispatch({ effects: setHighlights.of(Decoration.none) });
      return;
    }

    const selectedText = state.sliceDoc(selection.from, selection.to).trim();
    if (selectedText.length < 2) {
      view.dispatch({ effects: setHighlights.of(Decoration.none) });
      return;
    }

    const docText = state.doc.toString();
    const decorations = [];
    let pos = docText.indexOf(selectedText);

    while (pos !== -1) {
      if (
        !this.settings.highlightWordsOnly ||
        isWholeWordMatch(docText, selectedText, pos)
      ) {
        decorations.push(
          Decoration.mark({ class: 'cm-match-highlight' }).range(
            pos,
            pos + selectedText.length
          )
        );
      }
      pos = docText.indexOf(selectedText, pos + 1);
    }

    view.dispatch({
      effects: setHighlights.of(Decoration.set(decorations, true))
    });
  }
};

class HighlightMatchesSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Highlight color')
      .setDesc('Choose the color used for matching text.')
      .addColorPicker((colorPicker) => {
        colorPicker
          .setValue(this.plugin.settings.highlightColor)
          .onChange(async (value) => {
            await this.plugin.setHighlightColor(value);
          });
      });

    new Setting(containerEl)
      .setName('Highlight words only')
      .setDesc('Highlight complete words instead of matching text fragments.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.highlightWordsOnly)
          .onChange(async (value) => {
            await this.plugin.setHighlightWordsOnly(value);
          });
      });
  }
}

function isWholeWordMatch(docText, selectedText, position) {
  const selectedStartsWithLetter = /^\p{L}/u.test(selectedText);
  const selectedEndsWithLetter = /\p{L}$/u.test(selectedText);
  const textBefore = docText.slice(0, position);
  const textAfter = docText.slice(position + selectedText.length);

  return (
    (!selectedStartsWithLetter || !/\p{L}$/u.test(textBefore)) &&
    (!selectedEndsWithLetter || !/^\p{L}/u.test(textAfter))
  );
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return `rgba(255, 215, 0, ${alpha})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
