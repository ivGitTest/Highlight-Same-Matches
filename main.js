const { Plugin } = require('obsidian');
const { StateField, StateEffect } = require('@codemirror/state');
const { EditorView, Decoration } = require('@codemirror/view');

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
    this.domHighlights = [];
    this.activeView = null;

    // Register editor extensions in Obsidian
    this.registerEditorExtension([
      highlightField,
      this.createHighlightExtension()
    ]);

    // Live Preview tables can own the browser selection without emitting a
    // regular CodeMirror selection update. Listen to that selection too.
    this.registerDomEvent(document, 'selectionchange', () => {
      const view = this.activeView;
      const browserSelection = window.getSelection();
      const anchor = browserSelection?.anchorNode;
      const selectedText = browserSelection?.toString().trim();

      if (!view || !anchor || !selectedText || !view.dom.contains(anchor)) return;

      const inTable = anchor.parentElement?.closest('table, .cm-table-widget');
      if (!inTable) return;

      window.requestAnimationFrame(() => {
        this.highlightTableWidgets(view, selectedText);
      });
    });
  }

  onunload() {
    this.clearDomHighlights();
    console.log('Unloading highlight matches plugin.');
  }

  clearDomHighlights() {
    for (const highlight of this.domHighlights ?? []) {
      const parent = highlight.parentNode;
      if (!parent) continue;

      while (highlight.firstChild) {
        parent.insertBefore(highlight.firstChild, highlight);
      }
      parent.removeChild(highlight);
    }
    this.domHighlights = [];
  }

  highlightTableWidgets(view, selectedText) {
    this.clearDomHighlights();
    if (!selectedText) return;

    const widgets = view.dom.querySelectorAll('table, .cm-table-widget');
    for (const widget of widgets) {
      const walker = document.createTreeWalker(widget, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let node;

      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('.cm-match-highlight')) continue;
        textNodes.push(node);
      }

      for (let textNode of textNodes) {
        const text = textNode.nodeValue ?? '';
        let start = text.indexOf(selectedText);

        while (start !== -1) {
          const end = start + selectedText.length;
          const range = document.createRange();
          range.setStart(textNode, start);
          range.setEnd(textNode, end);

          const highlight = document.createElement('span');
          highlight.className = 'cm-match-highlight';
          highlight.dataset.highlightSameMatches = 'true';
          range.surroundContents(highlight);
          this.domHighlights.push(highlight);

          // The text node was split by surroundContents; continue with
          // the remaining text node after the inserted highlight.
          const nextTextNode = highlight.nextSibling;
          if (!nextTextNode || nextTextNode.nodeType !== Node.TEXT_NODE) break;
          textNode = nextTextNode;
          start = textNode.nodeValue?.indexOf(selectedText) ?? -1;
        }
      }
    }
  }

  createHighlightExtension() {
    return EditorView.updateListener.of((update) => {
      this.activeView = update.view;

      // Only trigger on selection change or text editing
      if (!update.selectionSet && !update.docChanged) return;

      const state = update.state;
      const selection = state.selection.main;

      // If nothing is selected — clear highlights
      if (selection.empty) {
        this.clearDomHighlights();
        update.view.dispatch({ effects: setHighlights.of(Decoration.none) });
        return;
      }

      // Get the selected text fragment
      const selectedText = state.sliceDoc(selection.from, selection.to).trim();

      // Don't highlight single characters or whitespace
      if (selectedText.length < 2) {
        this.clearDomHighlights();
        update.view.dispatch({ effects: setHighlights.of(Decoration.none) });
        return;
      }

      const decorations = [];
      const docText = state.doc.toString();
      
      // Find all matches in the document
      let pos = docText.indexOf(selectedText);
      while (pos !== -1) {
        decorations.push(
          Decoration.mark({ class: 'cm-match-highlight' }).range(pos, pos + selectedText.length)
        );
        pos = docText.indexOf(selectedText, pos + 1);
      }

      // Build the decoration set and update editor state
      const decorationSet = Decoration.set(decorations, true);
      update.view.dispatch({ effects: setHighlights.of(decorationSet) });

      // In Live Preview, tables are rendered after the CodeMirror update.
      // Wait one frame so the visible table DOM is ready.
      window.requestAnimationFrame(() => {
        this.highlightTableWidgets(update.view, selectedText);
      });
    });
  }
};
