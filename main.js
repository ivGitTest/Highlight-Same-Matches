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
    this.domHighlightFrame = null;
    this.cssHighlightName = 'highlight-same-matches';
    this.activeHighlightText = null;

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

      if (!view) return;
      if (
        !anchor ||
        !selectedText ||
        selectedText.length < 2 ||
        !view.dom.contains(anchor)
      ) {
        this.activeHighlightText = null;
        this.clearDomHighlights();
        if (view.dom.isConnected) {
          view.dispatch({ effects: setHighlights.of(Decoration.none) });
        }
        return;
      }

      this.activeHighlightText = selectedText;
      this.applySourceHighlights(view, selectedText);
      this.scheduleVisibleHighlights(view, selectedText);
    });
  }

  onunload() {
    this.clearDomHighlights();
    console.log('Unloading highlight matches plugin.');
  }

  clearDomHighlights() {
    if (this.domHighlightFrame !== null) {
      window.cancelAnimationFrame(this.domHighlightFrame);
      this.domHighlightFrame = null;
    }

    if (this.supportsCssHighlights()) {
      CSS.highlights.delete(this.cssHighlightName);
    }

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

  supportsCssHighlights() {
    return (
      typeof CSS !== 'undefined' &&
      CSS.highlights &&
      typeof Highlight !== 'undefined'
    );
  }

  highlightVisibleContent(view, selectedText) {
    this.clearDomHighlights();
    if (!selectedText) return;

    // Live Preview renders Markdown blocks through several different DOM
    // implementations. Walking the whole editor is more reliable than
    // depending on one internal table-widget class.
    const walker = document.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
      if (
        node.parentElement?.closest(
          '.cm-match-highlight, script, style, textarea'
        )
      ) {
        continue;
      }
      textNodes.push(node);
    }

    const ranges = [];
    for (const textNode of textNodes) {
      const text = textNode.nodeValue ?? '';
      let start = text.indexOf(selectedText);

      while (start !== -1) {
        const range = document.createRange();
        range.setStart(textNode, start);
        range.setEnd(textNode, start + selectedText.length);
        ranges.push(range);
        start = text.indexOf(selectedText, start + 1);
      }
    }

    // The Custom Highlight API paints ranges above rendered Markdown without
    // changing Obsidian's table DOM. That is essential for Live Preview.
    if (this.supportsCssHighlights()) {
      CSS.highlights.set(this.cssHighlightName, new Highlight(...ranges));
      return;
    }

    // Fallback for older Obsidian/Electron versions without CSS.highlights.
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

  scheduleVisibleHighlights(view, selectedText) {
    if (this.domHighlightFrame !== null) {
      window.cancelAnimationFrame(this.domHighlightFrame);
    }

    this.domHighlightFrame = window.requestAnimationFrame(() => {
      this.domHighlightFrame = null;
      this.highlightVisibleContent(view, selectedText);
    });
  }

  applySourceHighlights(view, selectedText) {
    if (!selectedText || selectedText.length < 2) {
      view.dispatch({ effects: setHighlights.of(Decoration.none) });
      return;
    }

    const decorations = [];
    const docText = view.state.doc.toString();
    let pos = docText.indexOf(selectedText);

    while (pos !== -1) {
      decorations.push(
        Decoration.mark({ class: 'cm-match-highlight' }).range(
          pos,
          pos + selectedText.length
        )
      );
      pos = docText.indexOf(selectedText, pos + 1);
    }

    view.dispatch({
      effects: setHighlights.of(Decoration.set(decorations, true))
    });
  }

  createHighlightExtension() {
    return EditorView.updateListener.of((update) => {
      this.activeView = update.view;

      // Obsidian virtualizes rendered Markdown. Apply the active search again
      // when scrolling exposes a new part of a table.
      if (!update.selectionSet && !update.docChanged) {
        if (update.viewportChanged && this.activeHighlightText) {
          this.scheduleVisibleHighlights(
            update.view,
            this.activeHighlightText
          );
        }
        return;
      }

      const state = update.state;
      const selection = state.selection.main;

      // If nothing is selected — clear highlights
      if (selection.empty) {
        this.activeHighlightText = null;
        this.clearDomHighlights();
        update.view.dispatch({ effects: setHighlights.of(Decoration.none) });
        return;
      }

      // Get the selected text fragment
      const selectedText = state.sliceDoc(selection.from, selection.to).trim();

      // Don't highlight single characters or whitespace
      if (selectedText.length < 2) {
        this.activeHighlightText = null;
        this.clearDomHighlights();
        update.view.dispatch({ effects: setHighlights.of(Decoration.none) });
        return;
      }

      this.activeHighlightText = selectedText;

      // Search the complete source document, including text outside
      // rendered table cells.
      this.applySourceHighlights(update.view, selectedText);

      // In Live Preview, tables are rendered after the CodeMirror update.
      // Wait one frame so the visible table DOM is ready.
      this.scheduleVisibleHighlights(update.view, selectedText);
    });
  }
};
