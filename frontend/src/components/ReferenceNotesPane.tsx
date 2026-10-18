import React, { useMemo, useState } from 'react';
import {
  BookMarked,
  Sparkles,
  Plus,
  Search,
  Trash2,
  Download,
  Edit3,
  Check,
  X,
  Code2,
  Tag,
  ExternalLink,
  Loader2,
  Mic,
} from 'lucide-react';
import { useAppStore } from '../store';
import {
  deleteRevisionNoteApi,
  fetchProblem,
  RevisionNoteItem,
  saveRevisionNoteApi,
  synthesizeRevisionNoteApi,
} from '../api';
import { coachSocket } from '../coach/CoachSocket';

const DEFAULT_CATEGORIES = [
  'Dynamic Programming',
  'Probability & E[X]',
  'Markov Chains',
  'Microstructure & LOB',
  'Low-Latency Systems',
  'Graphs & Trees',
  'Arrays & Sliding Window',
  'Quant Math & Brainteasers',
  'General Concept',
];

export const ReferenceNotesPane: React.FC = () => {
  const {
    currentProblem,
    code,
    transcript,
    revisionNotes,
    addOrUpdateRevisionNote,
    removeRevisionNote,
    isSynthesizingNote,
    setIsSynthesizingNote,
    setCurrentProblem,
    setLeftPaneTab,
    mode,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [showEditor, setShowEditor] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Form state for manual create / edit
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General Concept');
  const [takeawaysText, setTakeawaysText] = useState('');
  const [codeOrFormula, setCodeOrFormula] = useState('');
  const [content, setContent] = useState('');
  const [customNotePrompt, setCustomNotePrompt] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    revisionNotes.forEach((n) => {
      if (n.category) set.add(n.category);
    });
    return Array.from(set);
  }, [revisionNotes]);

  const filteredNotes = useMemo(() => {
    return revisionNotes.filter((n) => {
      if (selectedFilter === 'CURRENT' && currentProblem) {
        if (n.problem_id !== currentProblem.id) return false;
      } else if (selectedFilter !== 'ALL' && selectedFilter !== 'CURRENT') {
        if (n.category !== selectedFilter) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        n.title.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.problem_id.toLowerCase().includes(q) ||
        n.problem_title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.code_or_formula.toLowerCase().includes(q) ||
        (n.key_takeaways || []).some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [revisionNotes, selectedFilter, searchQuery, currentProblem]);

  const handleSynthesizeFromDiscussion = async () => {
    if (!currentProblem) return;
    setIsSynthesizingNote(true);
    setStatusBanner('Synthesizing revision note from Live API & chat discussion...');
    try {
      const note = await synthesizeRevisionNoteApi({
        problem_id: currentProblem.id,
        transcript: transcript.map((t) => ({ role: t.role, text: t.text })),
        code,
        custom_prompt: customNotePrompt.trim(),
      });
      addOrUpdateRevisionNote(note, false);
      setCustomNotePrompt('');
      setStatusBanner(`Saved revision note: "${note.title}"`);
      setTimeout(() => setStatusBanner(null), 4000);
    } catch (e: any) {
      setStatusBanner(`Could not synthesize note: ${e?.message || e}`);
    } finally {
      setIsSynthesizingNote(false);
    }
  };

  const handleAskLiveCoachToSave = () => {
    if (!coachSocket.isConnected) {
      handleSynthesizeFromDiscussion();
      return;
    }
    const prompt = customNotePrompt.trim()
      ? `Please call save_revision_note now to save a structured revision note about "${customNotePrompt.trim()}" based on our discussion.`
      : 'Please call save_revision_note now to capture the key concepts, complexity/derivation, and formulas from our discussion into my Reference Notes tab.';
    coachSocket.sendText(prompt);
    setCustomNotePrompt('');
    setStatusBanner('Requested LiveCoach to create and save a revision note...');
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const openNewNoteForm = () => {
    setEditingNoteId(null);
    setTitle(currentProblem ? `${currentProblem.title} — Key Concept` : '');
    setCategory(currentProblem?.category || 'General Concept');
    setTakeawaysText('');
    setCodeOrFormula('');
    setContent('');
    setShowEditor(true);
  };

  const openEditNoteForm = (note: RevisionNoteItem) => {
    setEditingNoteId(note.id);
    setTitle(note.title);
    setCategory(note.category || 'General Concept');
    setTakeawaysText((note.key_takeaways || []).join('\n'));
    setCodeOrFormula(note.code_or_formula || '');
    setContent(note.content || '');
    setShowEditor(true);
  };

  const handleSaveManualNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const takeaways = takeawaysText
      .split('\n')
      .map((line) => line.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);

    try {
      const saved = await saveRevisionNoteApi({
        note_id: editingNoteId || undefined,
        problem_id: currentProblem?.id || 'GENERAL',
        problem_title: currentProblem?.title || 'General Quant & DS&A',
        title: title.trim(),
        category: category.trim() || 'General Concept',
        key_takeaways: takeaways,
        code_or_formula: codeOrFormula,
        content,
        source: 'manual',
      });
      addOrUpdateRevisionNote(saved, false);
      setShowEditor(false);
      setEditingNoteId(null);
    } catch (err) {
      console.error('Failed to save manual note:', err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    removeRevisionNote(id);
    try {
      await deleteRevisionNoteApi(id);
    } catch (err) {
      console.warn('Delete note server sync warning:', err);
    }
  };

  const handleOpenProblem = async (problemId: string) => {
    if (!problemId || problemId === 'GENERAL') return;
    try {
      const detail = await fetchProblem(problemId);
      setCurrentProblem(detail);
      setLeftPaneTab('problem');
      if (coachSocket.isConnected) {
        coachSocket.switchContext(detail.id, mode);
      }
    } catch (e) {
      console.error('Failed to load problem from note:', e);
    }
  };

  const handleExportMarkdown = () => {
    if (revisionNotes.length === 0) return;
    const lines: string[] = [
      '# LiveCoach — Reference Notes for Revision',
      `_Exported ${new Date().toLocaleString()} (${revisionNotes.length} notes)_`,
      '',
    ];
    revisionNotes.forEach((n, idx) => {
      lines.push(`## ${idx + 1}. ${n.title}`);
      lines.push(
        `- **Problem:** \`${n.problem_id}\` — ${n.problem_title} | **Category:** ${n.category} | **Source:** ${n.source}`
      );
      lines.push('');
      if (n.key_takeaways && n.key_takeaways.length > 0) {
        lines.push('### Key Takeaways');
        n.key_takeaways.forEach((k) => lines.push(`- ${k}`));
        lines.push('');
      }
      if (n.code_or_formula) {
        lines.push('### Core Formula / Code Template');
        lines.push('```python');
        lines.push(n.code_or_formula);
        lines.push('```');
        lines.push('');
      }
      if (n.content) {
        lines.push('### Detailed Revision Notes');
        lines.push(n.content);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    });

    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `livecoach-revision-notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/60 overflow-hidden">
      {/* Header & AI Synthesis Action Bar */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/90 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
              Reference Notes for Revision ({revisionNotes.length})
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={openNewNoteForm}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <Plus className="w-3 h-3 text-emerald-400" />
              New Note
            </button>
            {revisionNotes.length > 0 && (
              <button
                onClick={handleExportMarkdown}
                title="Download all notes as a Markdown revision sheet"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                <Download className="w-3 h-3" />
                Export .md
              </button>
            )}
          </div>
        </div>

        {/* AI Note Generator Box */}
        <div className="p-2.5 rounded-lg bg-emerald-950/25 border border-emerald-500/30 space-y-2">
          <div className="text-[11px] text-emerald-200 font-medium flex items-center justify-between">
            <span>Capture Concept from Live API &amp; Chat</span>
            <span className="text-[10px] text-emerald-400 font-mono">
              {currentProblem?.id || 'GENERAL'}
            </span>
          </div>
          <input
            type="text"
            value={customNotePrompt}
            onChange={(e) => setCustomNotePrompt(e.target.value)}
            placeholder="Optional focus (e.g., 'Markov absorbing state trick' or 'Deque invariant')..."
            className="w-full bg-slate-950/90 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSynthesizeFromDiscussion}
              disabled={isSynthesizingNote}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition"
            >
              {isSynthesizingNote ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Synthesizing Note...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Summarize Chat &amp; Save Note
                </>
              )}
            </button>
            {coachSocket.isConnected && (
              <button
                onClick={handleAskLiveCoachToSave}
                title="Ask the active Live Voice Coach to save a note directly via tool call"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 transition"
              >
                <Mic className="w-3.5 h-3.5" />
                Ask Coach
              </button>
            )}
          </div>
          {statusBanner && (
            <div className="text-[11px] text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 rounded px-2 py-1">
              {statusBanner}
            </div>
          )}
        </div>

        {/* Search & Filter Controls */}
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes, formulas, takeaways, or problem ID..."
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            <button
              onClick={() => setSelectedFilter('ALL')}
              className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium transition ${
                selectedFilter === 'ALL'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({revisionNotes.length})
            </button>
            {currentProblem && (
              <button
                onClick={() => setSelectedFilter('CURRENT')}
                className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  selectedFilter === 'CURRENT'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                This Problem ({currentProblem.id})
              </button>
            )}
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedFilter(cat)}
                className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  selectedFilter === cat
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Manual / Edit Note Form Modal-In-Pane */}
      {showEditor && (
        <form
          onSubmit={handleSaveManualNote}
          className="p-3 border-b border-slate-800 bg-slate-950 space-y-2.5 overflow-y-auto max-h-[75%]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400">
              {editingNoteId ? 'Edit Revision Note' : 'New Revision Note'}
            </span>
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Concept Title (e.g., Gambler's Ruin Martingale Proof)"
            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
          />

          <div className="flex gap-2">
            <input
              type="text"
              list="note-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200"
            />
            <datalist id="note-categories">
              {DEFAULT_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Key Takeaways (one bullet per line)
            </label>
            <textarea
              rows={3}
              value={takeawaysText}
              onChange={(e) => setTakeawaysText(e.target.value)}
              placeholder="State space is O(N)&#10;Use monotonic deque to maintain sliding window min/max in O(1) amortized"
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Formula / Code Template
            </label>
            <textarea
              rows={3}
              value={codeOrFormula}
              onChange={(e) => setCodeOrFormula(e.target.value)}
              placeholder="E[T] = 1 + p * E[T_next] + (1 - p) * E[T_reset]"
              className="w-full font-mono bg-slate-900 border border-slate-800 rounded p-2 text-xs text-emerald-300"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Detailed Explanation &amp; Pitfalls
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write detailed explanation, complexity trade-offs, or interview pitfalls..."
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="px-3 py-1 rounded text-xs bg-slate-800 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Check className="w-3.5 h-3.5" />
              Save Note
            </button>
          </div>
        </form>
      )}

      {/* Notes Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredNotes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-slate-500 space-y-2.5">
            <BookMarked className="w-8 h-8 text-slate-600" />
            <p className="text-slate-300 font-semibold">
              No Reference Notes Yet
            </p>
            <p className="leading-relaxed">
              While talking with the <strong>Gemini Live Coach</strong> or
              chatting, say{' '}
              <span className="text-emerald-300 font-mono">
                &ldquo;Save a revision note on this concept&rdquo;
              </span>{' '}
              or click <strong>Summarize Chat &amp; Save Note</strong> above to
              build your personal study deck.
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl bg-slate-950/90 border border-slate-800/90 hover:border-slate-700 p-3.5 space-y-2.5 shadow-sm transition"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {note.problem_id && (
                      <button
                        onClick={() => handleOpenProblem(note.problem_id)}
                        title={`Open ${note.problem_id}: ${note.problem_title}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                      >
                        <span>{note.problem_id}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                      <Tag className="w-2.5 h-2.5 text-indigo-400" />
                      {note.category}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {note.source === 'live_coach'
                        ? '🎙️ Live Coach'
                        : note.source === 'ai_synthesis'
                        ? '✨ AI Synthesized'
                        : '✍️ Manual'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 leading-snug">
                    {note.title}
                  </h3>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditNoteForm(note)}
                    title="Edit note"
                    className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    title="Delete note"
                    className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Key Takeaways */}
              {note.key_takeaways && note.key_takeaways.length > 0 && (
                <div className="rounded-lg bg-emerald-950/20 border border-emerald-500/20 p-2.5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Key Takeaways
                  </div>
                  <ul className="space-y-1 text-xs text-slate-200 list-disc list-inside">
                    {note.key_takeaways.map((item, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Formula / Code Snippet */}
              {note.code_or_formula && (
                <div className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    <Code2 className="w-3 h-3" />
                    <span>Formula / Code Pattern</span>
                  </div>
                  <pre className="text-[11px] font-mono text-emerald-300 whitespace-pre-wrap overflow-x-auto leading-relaxed">
                    {note.code_or_formula}
                  </pre>
                </div>
              )}

              {/* Detailed Content */}
              {note.content && (
                <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                  {note.content}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
