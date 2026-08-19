const { Plugin } = require('obsidian');
const { StateField, StateEffect } = require('@codemirror/state');
const { EditorView, Decoration } = require('@codemirror/view');

// Эффект для динамического обновления подсветки
const setHighlights = StateEffect.define();

// Поле состояния для хранения и применения декораций
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
    console.log('Загрузка плагина подсветки совпадений...');

    // Регистрируем расширения в редакторе Obsidian
    this.registerEditorExtension([
      highlightField,
      this.createHighlightExtension()
    ]);
  }

  onunload() {
    console.log('Выгрузка плагина подсветки совпадений.');
  }

  createHighlightExtension() {
    return EditorView.updateListener.of((update) => {
      // Срабатывает только при изменении выделения или редактировании текста
      if (!update.selectionSet && !update.docChanged) return;

      const state = update.state;
      const selection = state.selection.main;

      // Если ничего не выделено — убираем подсветку
      if (selection.empty) {
        update.view.dispatch({ effects: setHighlights.of(Decoration.none) });
        return;
      }

      // Получаем выделенный фрагмент текста
      const selectedText = state.sliceDoc(selection.from, selection.to).trim();

      // Не подсвечиваем одиночные символы или пробелы
      if (selectedText.length < 2) {
        update.view.dispatch({ effects: setHighlights.of(Decoration.none) });
        return;
      }

      const decorations = [];
      const docText = state.doc.toString();
      
      // Поиск всех совпадений в документе
      let pos = docText.indexOf(selectedText);
      while (pos !== -1) {
        decorations.push(
          Decoration.mark({ class: 'cm-match-highlight' }).range(pos, pos + selectedText.length)
        );
        pos = docText.indexOf(selectedText, pos + 1);
      }

      // Формируем набор декораций и обновляем состояние редактора
      const decorationSet = Decoration.set(decorations, true);
      update.view.dispatch({ effects: setHighlights.of(decorationSet) });
    });
  }
};
