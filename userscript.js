// ==UserScript==
// @name         URL Note Taker (Preact) - Improved
// @namespace    http://tampermonkey.net/
// @version      3.1.0
// @description  Modern URL note taker using Preact with improvements
// @author       You
// @match        *://*/*
// @require      https://unpkg.com/preact@10.19.3/dist/preact.umd.js
// @require      https://unpkg.com/preact@10.19.3/hooks/dist/hooks.umd.js
// @require      https://unpkg.com/htm@3.1.1/dist/htm.js
// @require      https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js
// @require      https://cdn.jsdelivr.net/npm/dayjs@1.11.7/dayjs.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const { h, render } = preact;
  const { useState, useEffect, useCallback, useMemo, useRef } = preactHooks;
  const html = htm.bind(h);

  // 設定
  const CONFIG = {
    DEBOUNCE: 1000,
    PREFIX: 'notes_',
    SHORTCUT: { key: 'KeyN', modifiers: ['shiftKey'] },
    MAX_TITLE_LENGTH: 50,
    MAX_PREVIEW_LENGTH: 100,
    AUTO_SAVE_DELAY: 2000
  };

  // URL正規化ルール
  const URL_RULES = [
    [/google\.[a-z.]+\/search/, true],
    [/youtube\.com\/(watch|results)/, true],
    [/amazon\.[a-z.]+\/.*\/dp\//, true],
    [/wikipedia\.org\/wiki\//, false],
    [/github\.com\/[^\/]+\/[^\/]+\/?$/, false]
  ];

  // ユーティリティ
  const utils = {
    normalizeURL: (url) => {
      try {
        const parsed = new URL(url);
        const includeQuery = URL_RULES.find(([pattern]) => pattern.test(url))?.[1] ?? false;
        return includeQuery ?
          `${parsed.origin}${parsed.pathname}?${new URLSearchParams([...new URLSearchParams(parsed.search).entries()].sort()).toString()}` :
          `${parsed.origin}${parsed.pathname}`;
      } catch { return url; }
    },

    formatDate: (date) => dayjs(date).format('MM/DD HH:mm'),
    generateId: () => Date.now().toString(36) + Math.random().toString(36).substr(2),
    extractTitle: (content) => {
      const lines = content.split('\n').filter(line => line.trim());
      const firstLine = lines[0]?.trim() || '';
      return firstLine.substring(0, CONFIG.MAX_TITLE_LENGTH) || 'Untitled';
    },
    debounce: _.debounce,

    // エスケープ処理
    escapeHtml: (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    // プレビューテキスト生成
    generatePreview: (content) => {
      return content.replace(/\n/g, ' ').substring(0, CONFIG.MAX_PREVIEW_LENGTH);
    },

    // ドメイン抽出
    getDomain: (url) => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'unknown';
      }
    }
  };

  // ストレージAPI
  const storage = {
    key: (url) => CONFIG.PREFIX + utils.normalizeURL(url),

    // 全てのメモを取得
    getAllNotes: () => {
      try {
        const keys = GM_listValues();
        const noteKeys = keys.filter(key => key.startsWith(CONFIG.PREFIX));
        const allNotes = [];

        noteKeys.forEach(key => {
          try {
            const data = JSON.parse(GM_getValue(key, '{}'));
            if (data.notes && data.notes.length > 0) {
              allNotes.push({
                url: data.url,
                domain: utils.getDomain(data.url),
                notes: data.notes,
                updated: data.updated
              });
            }
          } catch (error) {
            console.error('Failed to parse note data:', error);
          }
        });

        return allNotes.sort((a, b) => b.updated - a.updated);
      } catch (error) {
        console.error('Failed to get all notes:', error);
        return [];
      }
    },

    // ドメイン別メモを取得
    getNotesByDomain: (domain) => {
      const allNotes = storage.getAllNotes();
      return allNotes.filter(noteData => noteData.domain === domain);
    },

    save: (url, noteId, content) => {
      try {
        const notes = storage.load(url);
        const existing = notes.findIndex(n => n.id === noteId);
        const now = Date.now();
        const note = {
          id: noteId,
          content: content.trim(),
          title: utils.extractTitle(content),
          updated: now,
          created: existing >= 0 ? notes[existing].created : now
        };

        if (existing >= 0) {
          notes[existing] = note;
        } else {
          notes.push(note);
        }

        const data = {
          url: utils.normalizeURL(url),
          notes,
          updated: now
        };

        GM_setValue(storage.key(url), JSON.stringify(data));
        return note;
      } catch (error) {
        console.error('Failed to save note:', error);
        return null;
      }
    },

    load: (url) => {
      try {
        const data = GM_getValue(storage.key(url), '{}');
        const parsed = JSON.parse(data);
        return parsed.notes || [];
      } catch (error) {
        console.error('Failed to load notes:', error);
        return [];
      }
    },

    delete: (url, noteId) => {
      try {
        const notes = storage.load(url).filter(n => n.id !== noteId);
        if (notes.length > 0) {
          const data = {
            url: utils.normalizeURL(url),
            notes,
            updated: Date.now()
          };
          GM_setValue(storage.key(url), JSON.stringify(data));
        } else {
          GM_deleteValue(storage.key(url));
        }
        return true;
      } catch (error) {
        console.error('Failed to delete note:', error);
        return false;
      }
    },

    // 統計情報取得
    getStats: (url) => {
      const notes = storage.load(url);
      return {
        count: notes.length,
        totalSize: notes.reduce((sum, note) => sum + note.content.length, 0),
        lastUpdated: Math.max(...notes.map(n => n.updated), 0)
      };
    }
  };

  // メインアプリコンポーネント
  const NoteApp = () => {
    const [notes, setNotes] = useState([]);
    const [currentId, setCurrentId] = useState(null);
    const [isMinimized, setIsMinimized] = useState(true);
    const [content, setContent] = useState('');
    const [isVisible, setIsVisible] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [viewMode, setViewMode] = useState('url'); // 'url', 'domain', 'all'
    const [allNotes, setAllNotes] = useState([]);
    const [currentDomain, setCurrentDomain] = useState('');
    const textareaRef = useRef(null);

    // デバウンス付き保存
    const debouncedSave = useMemo(
      () => utils.debounce(async (id, text) => {
        if (id && text.trim()) {
          setIsSaving(true);
          try {
            const savedNote = storage.save(location.href, id, text);
            if (savedNote) {
              setLastSaved(Date.now());
              loadNotes();
            }
          } catch (error) {
            console.error('Save failed:', error);
          } finally {
            setIsSaving(false);
          }
        }
      }, CONFIG.DEBOUNCE),
      []
    );

    // ノート読み込み
    const loadNotes = useCallback(() => {
      try {
        const currentUrl = location.href;
        const domain = utils.getDomain(currentUrl);
        setCurrentDomain(domain);

        if (viewMode === 'url') {
          const loadedNotes = storage.load(currentUrl);
          setNotes(loadedNotes);
        } else if (viewMode === 'domain') {
          const domainNotes = storage.getNotesByDomain(domain);
          const flatNotes = domainNotes.flatMap(noteData =>
            noteData.notes.map(note => ({
              ...note,
              sourceUrl: noteData.url
            }))
          );
          setNotes(_.orderBy(flatNotes, ['updated'], ['desc']));
        } else if (viewMode === 'all') {
          const allNotesData = storage.getAllNotes();
          const flatNotes = allNotesData.flatMap(noteData =>
            noteData.notes.map(note => ({
              ...note,
              sourceUrl: noteData.url,
              domain: noteData.domain
            }))
          );
          setNotes(_.orderBy(flatNotes, ['updated'], ['desc']));
        }

        setAllNotes(storage.getAllNotes());
      } catch (error) {
        console.error('Failed to load notes:', error);
        setNotes([]);
      }
    }, [viewMode]);

    // 初期化
    useEffect(() => {
      loadNotes();
    }, [loadNotes]);

    // 自動保存
    useEffect(() => {
      if (currentId && content !== null) {
        debouncedSave(currentId, content);
      }
    }, [content, currentId, debouncedSave]);

    // キーボードショートカット
    useEffect(() => {
      const handleKeyboard = (e) => {
        // Shift+N で表示切り替え
        if (CONFIG.SHORTCUT.modifiers.every(mod => e[mod]) && e.code === CONFIG.SHORTCUT.key) {
          e.preventDefault();
          setIsVisible(prev => !prev);
        }

        // ESC で最小化
        if (e.key === 'Escape' && !isMinimized && isVisible) {
          const activeElement = document.activeElement;
          if (activeElement && activeElement.closest('#note-container')) {
            e.preventDefault();
            setIsMinimized(true);
          }
        }
      };

      document.addEventListener('keydown', handleKeyboard);
      return () => document.removeEventListener('keydown', handleKeyboard);
    }, [isMinimized, isVisible]);

    // エディターフォーカス
    const focusEditor = useCallback(() => {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
        }
      }, 100);
    }, []);

    // ハンドラー
    const expand = () => {
      setIsMinimized(false);
      if (notes.length === 0) {
        createNewNote();
      } else {
        const latestNote = _.maxBy(notes, 'updated');
        editNote(latestNote.id);
      }
    };

    const createNewNote = () => {
      if (viewMode !== 'url') {
        setViewMode('url');
        setTimeout(() => {
          const id = utils.generateId();
          setCurrentId(id);
          setContent('');
          setIsMinimized(false);
          focusEditor();
        }, 100);
      } else {
        const id = utils.generateId();
        setCurrentId(id);
        setContent('');
        setIsMinimized(false);
        focusEditor();
      }
    };

    const editNote = (id, sourceUrl = null) => {
      const note = notes.find(n => n.id === id);
      if (note) {
        if (sourceUrl && sourceUrl !== location.href) {
          // 他のURLのメモを編集する場合は読み取り専用で表示
          setCurrentId(id);
          setContent(note.content + '\n\n--- このメモは ' + sourceUrl + ' で作成されました ---');
          setIsMinimized(false);
        } else {
          setCurrentId(id);
          setContent(note.content);
          setIsMinimized(false);
          focusEditor();
        }
      }
    };

    const deleteNote = async (id) => {
      if (!confirm('このノートを削除しますか？')) return;

      try {
        const success = storage.delete(location.href, id);
        if (success) {
          if (currentId === id) {
            setCurrentId(null);
            setContent('');
          }
          loadNotes();
        }
      } catch (error) {
        console.error('Delete failed:', error);
        alert('ノートの削除に失敗しました');
      }
    };

    const saveNote = () => {
      if (currentId && content.trim()) {
        const savedNote = storage.save(location.href, currentId, content);
        if (savedNote) {
          setLastSaved(Date.now());
          loadNotes();
        }
      }
    };

    // 現在のノート取得
    const currentNote = useMemo(() =>
      notes.find(n => n.id === currentId), [notes, currentId]
    );

    // ソート済みノート
    const sortedNotes = useMemo(() =>
      _.orderBy(notes, ['updated'], ['desc']), [notes]
    );

    // ステータステキスト
    const statusText = useMemo(() => {
      if (isSaving) return 'Saving...';
      if (lastSaved) return `Saved at ${utils.formatDate(lastSaved)}`;
      if (content && content.trim()) return 'Auto-saving...';
      return 'Ready';
    }, [isSaving, lastSaved, content]);

    if (!isVisible) return null;

    return html`
            <div id="note-container" class=${isMinimized ? 'minimized' : ''}>
                <div class="header" onClick=${isMinimized ? expand : null}>
                    <span class="title">
                        ${viewMode === 'url' ? `${notes.length} note${notes.length === 1 ? '' : 's'}` :
        viewMode === 'domain' ? `${notes.length} note${notes.length === 1 ? '' : 's'} (${currentDomain})` :
          `${notes.length} note${notes.length === 1 ? '' : 's'} (${allNotes.length} site${allNotes.length === 1 ? '' : 's'})`}
                    </span>
                    ${!isMinimized && html`
                        <div class="controls">
                            <button onClick=${() => setIsMinimized(true)} title="Minimize (ESC)">−</button>
                            <button onClick=${() => setIsVisible(false)} title="Hide (Shift+N)">×</button>
                        </div>
                    `}
                </div>

                ${!isMinimized && html`
                    <div class="content">
                        <div class="sidebar">
                            <div class="view-controls">
                                <button class=${`view-btn ${viewMode === 'url' ? 'active' : ''}`} onClick=${() => setViewMode('url')} title="このページのメモ">URL</button>
                                <button class=${`view-btn ${viewMode === 'domain' ? 'active' : ''}`} onClick=${() => setViewMode('domain')} title="このドメインのメモ">ドメイン</button>
                                <button class=${`view-btn ${viewMode === 'all' ? 'active' : ''}`} onClick=${() => setViewMode('all')} title="全てのメモ">全体</button>
                            </div>
                            <button class="new-btn" onClick=${createNewNote} title="Create new note">+ New</button>
                            <div class="list">
                                ${sortedNotes.map(note => html`
                                    <div
                                        key=${note.id}
                                        class=${`note-item ${note.id === currentId ? 'active' : ''}`}
                                        onClick=${() => editNote(note.id, note.sourceUrl)}
                                        title=${note.title}
                                    >
                                        <div class="note-title">${note.title}</div>
                                        <div class="note-preview">${utils.generatePreview(note.content)}</div>
                                        ${(viewMode === 'domain' || viewMode === 'all') && note.sourceUrl && html`
                                            <div class="note-source">${viewMode === 'all' ? note.domain : utils.getDomain(note.sourceUrl)}</div>
                                        `}
                                        <div class="note-date">${utils.formatDate(note.updated)}</div>
                                    </div>
                                `)}
                            </div>
                        </div>

                        <div class="main">
                            ${currentId ? html`
                                <div class="editor">
                                    <div class="editor-header">
                                        <div class="note-info">
                                            <div class="note-title">${currentNote?.title || 'Untitled'}</div>
                                            <div class="note-meta">
                                                Created: ${currentNote ? utils.formatDate(currentNote.created) : ''}
                                                ${currentNote?.updated !== currentNote?.created ?
            ` • Updated: ${utils.formatDate(currentNote.updated)}` : ''}
                                            </div>
                                        </div>
                                        <div class="editor-controls">
                                            <button onClick=${saveNote} class="save-btn" title="Save now (Ctrl+S)">Save</button>
                                            <button onClick=${() => deleteNote(currentId)} class="delete-btn" title="Delete note">Delete</button>
                                        </div>
                                    </div>
                                    <textarea
                                        ref=${textareaRef}
                                        value=${content}
                                        onInput=${(e) => setContent(e.target.value)}
                                        onKeyDown=${(e) => {
            if (e.ctrlKey && e.key === 's') {
              e.preventDefault();
              saveNote();
            }
          }}
                                        placeholder="Write your note here..."
                                        class="note-textarea"
                                    />
                                    <div class="status">
                                        <span class=${isSaving ? 'saving' : ''}>${statusText}</span>
                                        <span class="char-count">${content.length} chars</span>
                                    </div>
                                </div>
                            ` : html`
                                <div class="welcome">
                                    <h3>📝 Notes for this page</h3>
                                    <p>Click <strong>"+ New"</strong> to create your first note, or select an existing note from the sidebar.</p>
                                    <div class="shortcuts">
                                        <div><kbd>Shift</kbd> + <kbd>N</kbd> Toggle visibility</div>
                                        <div><kbd>Ctrl</kbd> + <kbd>S</kbd> Save note</div>
                                        <div><kbd>ESC</kbd> Minimize</div>
                                    </div>
                                </div>
                            `}
                        </div>
                    </div>
                `}
            </div>
        `;
  };

  // スタイル
  const addStyles = () => {
    if (document.getElementById('note-styles')) return;

    const style = document.createElement('style');
    style.id = 'note-styles';
    style.textContent = `
            #note-container {
                position: fixed; bottom: 20px; right: 20px; width: 320px;
                background: white; border: 1px solid #e0e0e0; border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.12); font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                z-index: 2147483647; display: flex; flex-direction: column; max-height: 500px;
                backdrop-filter: blur(10px); transition: all 0.2s ease;
            }
            #note-container:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.15); }
            #note-container.minimized { width: auto; min-width: 80px; }
            #note-container.minimized .content { display: none; }

            .header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 16px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                border-bottom: 1px solid #e0e0e0; border-radius: 12px 12px 0 0;
                cursor: pointer; user-select: none; transition: background 0.2s ease;
            }
            .header:hover { background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%); }
            #note-container.minimized .header { border-radius: 12px; border-bottom: none; }

            .title { font-weight: 600; color: #333; min-width: 60px; text-align: center; font-size: 13px; }

            .controls { display: flex; gap: 4px; }
            .controls button {
                background: none; border: none; padding: 6px 10px;
                cursor: pointer; border-radius: 6px; color: #666; font-size: 14px;
                transition: all 0.2s ease; line-height: 1;
            }
            .controls button:hover { background: rgba(0,0,0,0.1); color: #333; }

            .content { display: flex; flex: 1; min-height: 0; height: 420px; }

            .sidebar {
                width: 130px; border-right: 1px solid #e0e0e0; background: #fafbfc;
                display: flex; flex-direction: column;
            }

            .view-controls {
                display: flex; gap: 2px; margin: 8px 8px 4px 8px;
                background: #f1f3f4; border-radius: 6px; padding: 2px;
            }
            .view-btn {
                flex: 1; background: none; border: none; padding: 6px 4px;
                cursor: pointer; font-size: 9px; font-weight: 500;
                border-radius: 4px; transition: all 0.2s ease;
                color: #666;
            }
            .view-btn:hover {
                background: rgba(0,0,0,0.1);
            }
            .view-btn.active {
                background: white; color: #007bff; font-weight: 600;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }

            .new-btn {
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white; padding: 10px 12px; margin: 8px 12px 12px 12px; border: none;
                border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
                transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(0,123,255,0.3);
            }
            .new-btn:hover {
                background: linear-gradient(135deg, #0056b3 0%, #003d82 100%);
                transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,123,255,0.4);
            }

            .list { flex: 1; overflow-y: auto; padding: 4px 0; }

            .note-item {
                padding: 10px 12px; margin: 2px 8px; border-radius: 8px;
                cursor: pointer; font-size: 11px; border: 1px solid transparent;
                transition: all 0.2s ease; position: relative;
            }
            .note-item:hover { background: #e9ecef; transform: translateX(2px); }
            .note-item.active {
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white; box-shadow: 0 2px 8px rgba(0,123,255,0.3);
            }

            .note-title {
                font-weight: 600; margin-bottom: 3px; overflow: hidden;
                text-overflow: ellipsis; white-space: nowrap; line-height: 1.2;
            }
            .note-preview {
                font-size: 10px; opacity: 0.8; margin-bottom: 3px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                line-height: 1.2;
            }
            .note-date { font-size: 9px; opacity: 0.7; }
            .note-source {
                font-size: 8px; opacity: 0.6; margin-bottom: 2px;
                font-style: italic; color: #007bff;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .note-item.active .note-source {
                color: rgba(255,255,255,0.8);
            }

            .main { flex: 1; display: flex; flex-direction: column; }

            .welcome {
                display: flex; align-items: center; justify-content: center;
                flex: 1; text-align: center; color: #666; padding: 30px 20px;
                flex-direction: column;
            }
            .welcome h3 { margin: 0 0 12px 0; font-size: 18px; color: #333; }
            .welcome p { margin: 0 0 20px 0; font-size: 13px; line-height: 1.5; }
            .shortcuts { font-size: 11px; color: #888; }
            .shortcuts div { margin: 4px 0; }
            .shortcuts kbd {
                background: #f1f3f4; padding: 2px 6px; border-radius: 4px;
                font-family: monospace; font-size: 10px; border: 1px solid #ddd;
            }

            .editor { display: flex; flex-direction: column; flex: 1; }

            .editor-header {
                display: flex; justify-content: space-between; align-items: flex-start;
                padding: 16px; border-bottom: 1px solid #e0e0e0; gap: 12px;
            }

            .note-info { flex: 1; min-width: 0; }
            .note-info .note-title {
                font-weight: 600; font-size: 14px; color: #333;
                margin: 0 0 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .note-meta { font-size: 11px; color: #666; line-height: 1.3; }

            .editor-controls { display: flex; gap: 6px; flex-shrink: 0; }
            .editor-controls button {
                padding: 6px 12px; border: none; border-radius: 6px;
                cursor: pointer; font-size: 12px; font-weight: 500;
                transition: all 0.2s ease;
            }
            .save-btn {
                background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
                color: white; box-shadow: 0 2px 6px rgba(40,167,69,0.3);
            }
            .save-btn:hover {
                background: linear-gradient(135deg, #1e7e34 0%, #155724 100%);
                transform: translateY(-1px); box-shadow: 0 4px 10px rgba(40,167,69,0.4);
            }
            .delete-btn {
                background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                color: white; box-shadow: 0 2px 6px rgba(220,53,69,0.3);
            }
            .delete-btn:hover {
                background: linear-gradient(135deg, #c82333 0%, #a71e2a 100%);
                transform: translateY(-1px); box-shadow: 0 4px 10px rgba(220,53,69,0.4);
            }

            .note-textarea {
                flex: 1; border: none; padding: 16px; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
                resize: none; outline: none; min-height: 100px; background: #fdfdfd;
            }
            .note-textarea:focus { background: white; }

            .status {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 16px; font-size: 11px; color: #666;
                border-top: 1px solid #e0e0e0; background: #fafbfc;
            }
            .status .saving { color: #007bff; }
            .char-count { opacity: 0.7; }

            /* Dark mode */
            @media (prefers-color-scheme: dark) {
                #note-container {
                    background: rgba(45, 55, 72, 0.95); border-color: #4a5568; color: #e2e8f0;
                    backdrop-filter: blur(20px);
                }
                .header {
                    background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
                    border-color: #4a5568;
                }
                .header:hover { background: linear-gradient(135deg, #1a202c 0%, #171923 100%); }
                .title { color: #e2e8f0; }
                .sidebar { background: rgba(45, 55, 72, 0.8); border-color: #4a5568; }
                .note-item:hover { background: #4a5568; }
                .note-textarea {
                    background: rgba(74, 85, 104, 0.3); color: #e2e8f0;
                }
                .note-textarea:focus { background: rgba(74, 85, 104, 0.5); }
                .editor-header, .status { border-color: #4a5568; background: rgba(45, 55, 72, 0.8); }
                .note-info .note-title { color: #e2e8f0; }
                .welcome h3 { color: #e2e8f0; }
                .shortcuts kbd { background: #4a5568; border-color: #718096; color: #e2e8f0; }
            }

            /* スクロールバーのスタイリング */
            .list::-webkit-scrollbar { width: 4px; }
            .list::-webkit-scrollbar-track { background: transparent; }
            .list::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
            .list::-webkit-scrollbar-thumb:hover { background: #999; }
        `;
    document.head.appendChild(style);
  };

  // 初期化
  const init = () => {
    if (shouldSkipPage()) return;

    addStyles();

    const container = document.createElement('div');
    container.id = 'url-note-taker-root';
    document.body.appendChild(container);
    render(html`<${NoteApp} />`, container);
  };

  const shouldSkipPage = () => {
    const skipPatterns = [
      /^chrome-extension:/, /^moz-extension:/, /^about:/, /^file:/, /^data:/,
      /^devtools:/, /^view-source:/
    ];
    return skipPatterns.some(pattern => pattern.test(location.href)) ||
      document.body === null ||
      document.body.children.length === 0;
  };

  // 開始
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100); // DOM構築完了を待つ
  }

  // デバッグ用グローバル関数
  window.URLNoteTaker = {
    getAllNotes: () => storage.load(location.href),
    clearAllNotes: () => {
      const notes = storage.load(location.href);
      notes.forEach(note => storage.delete(location.href, note.id));
      console.log('All notes cleared for current URL');
    },
    getStats: () => storage.getStats(location.href),
    exportNotes: () => {
      const notes = storage.load(location.href);
      const data = {
        url: location.href,
        notes,
        exported: new Date().toISOString()
      };
      return JSON.stringify(data, null, 2);
    }
  };

})();