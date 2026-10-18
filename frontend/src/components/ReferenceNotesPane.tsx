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
  Youtube,
  GraduationCap,
  Play,
  Link2,
} from 'lucide-react';
import { useAppStore } from '../store';
import {
  deleteRevisionNoteApi,
  fetchProblem,
  generateTutorialNoteApi,
  LearningResourceItem,
  RevisionNoteItem,
  saveRevisionNoteApi,
  searchLearningResourcesApi,
  synthesizeRevisionNoteApi,
} from '../api';
import { coachSocket } from '../coach/CoachSocket';

const DEFAULT_CATEGORIES = [
  'Python Fundamentals',
  'Hash Maps',
  'Dynamic Programming',
  'Probability & E[X]',
  'Markov Chains',
  'Microstructure & LOB',
  'Low-Latency Systems',
  'Graphs & Trees',
  'Arrays & Sliding Window',
  'General Concept',
];

const QUICK_SCRATCH_TOPICS = [
  'Python dict & Hash Maps from scratch',
  'Counter & defaultdict in Python',
  'Min/Max Heaps with heapq',
  'Monotonic Deque & Sliding Window',
  'Prefix Sums + Hash Map Pattern',
  'Binary Search & bisect module',
  'Top-Down DP & @functools.cache',
  'Log-Sum-Exp & Softmax Numerics',
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

  const [activeGeneratorTab, setActiveGeneratorTab] = useState<
    'tutorial' | 'discussion' | 'youtube_search'
  >('tutorial');

  // Tutorial from scratch state
  const [tutorialTopic, setTutorialTopic] = useState(
    'Python dict & Hash Maps from scratch'
  );
  const [isGeneratingTutorial, setIsGeneratingTutorial] = useState(false);

  // Discussion synthesis state
  const [customNotePrompt, setCustomNotePrompt] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // YouTube & Resource Search state
  const [resourceSearchQuery, setResourceSearchQuery] = useState('');
  const [isSearchingResources, setIsSearchingResources] = useState(false);
  const [searchedResources, setSearchedResources] = useState<
    LearningResourceItem[]
  >([]);
  const [targetNoteIdForResource, setTargetNoteIdForResource] =
    useState<string>('');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  // Per-card add link state
  const [addingLinkForNoteId, setAddingLinkForNoteId] = useState<string | null>(
    null
  );
  const [customLinkTitle, setCustomLinkTitle] = useState('');
  const [customLinkUrl, setCustomLinkUrl] = useState('');

  // Filter & Manual Editor state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [showEditor, setShowEditor] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General Concept');
  const [takeawaysText, setTakeawaysText] = useState('');
  const [codeOrFormula, setCodeOrFormula] = useState('');
  const [content, setContent] = useState('');

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
        (n.key_takeaways || []).some((k) => k.toLowerCase().includes(q)) ||
        (n.resources || []).some((r) => r.title.toLowerCase().includes(q))
      );
    });
  }, [revisionNotes, selectedFilter, searchQuery, currentProblem]);

  const showTempBanner = (msg: string, ms = 4500) => {
    setStatusBanner(msg);
    setTimeout(() => setStatusBanner(null), ms);
  };

  // 1. Generate 5-Minute From-Scratch Tutorial Note + YouTube links
  const handleGenerateTutorialNote = async (topicOverride?: string) => {
    const topicToUse = (topicOverride ?? tutorialTopic).trim();
    if (!topicToUse) return;
    setIsGeneratingTutorial(true);
    setStatusBanner(
      `Building 5-min from-scratch tutorial & finding YouTube videos for "${topicToUse}"...`
    );
    try {
      const note = await generateTutorialNoteApi({
        topic: topicToUse,
        problem_id: currentProblem?.id,
      });
      addOrUpdateRevisionNote(note, false);
      showTempBanner(
        `Created 5-min tutorial & attached ${note.resources?.length || 0} YouTube/doc links!`
      );
    } catch (e: any) {
      showTempBanner(`Could not generate tutorial: ${e?.message || e}`);
    } finally {
      setIsGeneratingTutorial(false);
    }
  };

  // 2. Start Live 5-Minute Voice Tutorial via Gemini Live API
  const handleStartLiveVoiceTutorial = async (topicOverride?: string) => {
    const topicToUse = (topicOverride ?? tutorialTopic).trim();
    if (!topicToUse) return;

    // Also generate the written cheat-sheet + YouTube links in the background so the user can read along
    handleGenerateTutorialNote(topicToUse);

    const prompt =
      `I want to learn "${topicToUse}" from scratch. Please give me an interactive 5-minute tutorial starting from first principles: ` +
      `(1) explain the mental model and Big-O complexity simply, ` +
      `(2) show me the exact Python syntax and methods I need to know (like dict, .get(), defaultdict, Counter, etc.), ` +
      `(3) walk me through a concrete coding interview example, and ` +
      `(4) ask me a quick check-for-understanding question.`;

    if (!coachSocket.isConnected) {
      showTempBanner(
        `Connecting Gemini Live Voice Coach for 5-min tutorial on "${topicToUse}"...`
      );
      await coachSocket.connect();
      setTimeout(() => {
        if (coachSocket.isConnected) {
          coachSocket.sendText(prompt);
        }
      }, 1500);
    } else {
      coachSocket.sendText(prompt);
      showTempBanner(
        `Gemini Live Coach is now teaching "${topicToUse}" from scratch!`
      );
    }
  };

  // 3. Summarize Chat & Live Discussion into a Note
  const handleSynthesizeFromDiscussion = async () => {
    if (!currentProblem) return;
    setIsSynthesizingNote(true);
    setStatusBanner(
      'Synthesizing revision note & YouTube links from Live API & chat discussion...'
    );
    try {
      const note = await synthesizeRevisionNoteApi({
        problem_id: currentProblem.id,
        transcript: transcript.map((t) => ({ role: t.role, text: t.text })),
        code,
        custom_prompt: customNotePrompt.trim(),
      });
      addOrUpdateRevisionNote(note, false);
      setCustomNotePrompt('');
      showTempBanner(`Saved revision note: "${note.title}"`);
    } catch (e: any) {
      showTempBanner(`Could not synthesize note: ${e?.message || e}`);
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
    showTempBanner('Requested LiveCoach to create and save a revision note...');
  };

  // 4. Search YouTube & Docs directly inside Notes tab
  const handleSearchResources = async (e?: React.FormEvent, qOverride?: string) => {
    if (e) e.preventDefault();
    const q = (qOverride ?? resourceSearchQuery).trim();
    if (!q) return;
    setIsSearchingResources(true);
    try {
      const items = await searchLearningResourcesApi(q);
      setSearchedResources(items);
      if (!targetNoteIdForResource && revisionNotes.length > 0) {
        setTargetNoteIdForResource(revisionNotes[0].id);
      }
    } catch (err) {
      console.error('Failed to search resources:', err);
    } finally {
      setIsSearchingResources(false);
    }
  };

  // 5. Attach a YouTube video or link to an existing Note (or create a new note if none exists)
  const handleAttachResourceToNote = async (
    resource: LearningResourceItem,
    noteId?: string
  ) => {
    const targetId = noteId || targetNoteIdForResource || revisionNotes[0]?.id;
    const existingNote = revisionNotes.find((n) => n.id === targetId);

    if (existingNote) {
      const currentResources = existingNote.resources || [];
      if (currentResources.some((r) => r.url === resource.url)) {
        showTempBanner('That link is already saved on this note.');
        return;
      }
      const updatedNote: RevisionNoteItem = {
        ...existingNote,
        resources: [...currentResources, resource],
      };
      addOrUpdateRevisionNote(updatedNote, false);
      try {
        await saveRevisionNoteApi(updatedNote);
      } catch (e) {
        console.warn('Server note sync warning:', e);
      }
      showTempBanner(`Added "${resource.title}" to "${existingNote.title}"!`);
    } else {
      // No notes yet — create a fresh note holding this resource
      try {
        const saved = await saveRevisionNoteApi({
          problem_id: currentProblem?.id || 'TUTORIAL',
          problem_title: currentProblem?.title || 'Concept Study Note',
          title: resource.title,
          category: 'Python Fundamentals',
          key_takeaways: [
            `Saved learning resource (${resource.channel || 'YouTube'}) for revision.`,
          ],
          code_or_formula: '',
          content: `Watch / review: ${resource.url}`,
          resources: [resource],
          source: 'manual',
        });
        addOrUpdateRevisionNote(saved, false);
        showTempBanner(`Created new note with "${resource.title}"!`);
      } catch (e) {
        console.error('Failed to create note for resource:', e);
      }
    }
  };

  const handleRemoveResourceFromNote = async (
    note: RevisionNoteItem,
    urlToRemove: string
  ) => {
    const updated: RevisionNoteItem = {
      ...note,
      resources: (note.resources || []).filter((r) => r.url !== urlToRemove),
    };
    addOrUpdateRevisionNote(updated, false);
    try {
      await saveRevisionNoteApi(updated);
    } catch (e) {
      console.warn('Server note sync warning:', e);
    }
  };

  const handleAddCustomLinkToNote = async (
    e: React.FormEvent,
    note: RevisionNoteItem
  ) => {
    e.preventDefault();
    if (!customLinkUrl.trim()) return;
    const url = customLinkUrl.trim();
    const isYt = url.includes('youtube.com') || url.includes('youtu.be');
    let vid = '';
    const m =
      url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
      url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m) vid = m[1];

    const newRes: LearningResourceItem = {
      title: customLinkTitle.trim() || url,
      url,
      video_id: vid,
      channel: isYt ? 'YouTube' : 'Web Link',
      duration: isYt ? 'Video' : 'Link',
      kind: isYt ? 'youtube' : 'article',
    };
    await handleAttachResourceToNote(newRes, note.id);
    setCustomLinkTitle('');
    setCustomLinkUrl('');
    setAddingLinkForNoteId(null);
  };

  const openNewNoteForm = () => {
    setEditingNoteId(null);
    setTitle(currentProblem ? `${currentProblem.title} — Key Concept` : '');
    setCategory('General Concept');
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

    const existing = editingNoteId
      ? revisionNotes.find((n) => n.id === editingNoteId)
      : undefined;

    try {
      const saved = await saveRevisionNoteApi({
        id: editingNoteId || undefined,
        problem_id: existing?.problem_id || currentProblem?.id || 'GENERAL',
        problem_title:
          existing?.problem_title ||
          currentProblem?.title ||
          'General Quant & DS&A',
        title: title.trim(),
        category: category.trim() || 'General Concept',
        key_takeaways: takeaways,
        code_or_formula: codeOrFormula,
        content,
        resources: existing?.resources || [],
        source: existing?.source || 'manual',
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
    if (!problemId || problemId === 'GENERAL' || problemId === 'TUTORIAL')
      return;
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
      '# LiveCoach — Reference Notes & Tutorials for Revision',
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
        lines.push('### Core Formula / Python Cheat-Sheet');
        lines.push('```python');
        lines.push(n.code_or_formula);
        lines.push('```');
        lines.push('');
      }
      if (n.content) {
        lines.push('### Detailed Explanation & Walkthrough');
        lines.push(n.content);
        lines.push('');
      }
      if (n.resources && n.resources.length > 0) {
        lines.push('### YouTube Tutorials & Reference Links');
        n.resources.forEach((r) =>
          lines.push(
            `- [${r.title}](${r.url}) _(${r.channel || r.kind || 'Link'})_`
          )
        );
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
      {/* Header & Mode Switcher */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/90 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
              Reference Notes ({revisionNotes.length})
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
                title="Download all notes & YouTube links as a Markdown revision sheet"
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                <Download className="w-3 h-3" />
                Export .md
              </button>
            )}
          </div>
        </div>

        {/* 3-Mode Action Switcher: 5-Min Tutorial | Summarize Chat | Search YouTube */}
        <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveGeneratorTab('tutorial')}
            className={`inline-flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[11px] font-semibold transition ${
              activeGeneratorTab === 'tutorial'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GraduationCap className="w-3 h-3" />
            <span>5m Tutorial</span>
          </button>
          <button
            onClick={() => setActiveGeneratorTab('discussion')}
            className={`inline-flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[11px] font-semibold transition ${
              activeGeneratorTab === 'discussion'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>From Chat</span>
          </button>
          <button
            onClick={() => setActiveGeneratorTab('youtube_search')}
            className={`inline-flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[11px] font-semibold transition ${
              activeGeneratorTab === 'youtube_search'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Youtube className="w-3 h-3" />
            <span>YouTube Search</span>
          </button>
        </div>

        {/* TAB 1: Learn Any Topic From Scratch (5-Minute Tutorial + Live API + YouTube) */}
        {activeGeneratorTab === 'tutorial' && (
          <div className="p-2.5 rounded-lg bg-emerald-950/25 border border-emerald-500/30 space-y-2">
            <div className="text-[11px] text-emerald-200 font-semibold flex items-center justify-between">
              <span>Learn Topic From Scratch (5-Min Tutorial + YouTube)</span>
            </div>

            {/* Quick-pick topic chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {QUICK_SCRATCH_TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTutorialTopic(t)}
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] border transition ${
                    tutorialTopic === t
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.replace(' from scratch', '')}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={tutorialTopic}
              onChange={(e) => setTutorialTopic(e.target.value)}
              placeholder="e.g., Python dict & Hash Maps from scratch, heapq, sliding window..."
              className="w-full bg-slate-950/90 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleGenerateTutorialNote()}
                disabled={isGeneratingTutorial}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition"
              >
                {isGeneratingTutorial ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Building Tutorial...
                  </>
                ) : (
                  <>
                    <GraduationCap className="w-3.5 h-3.5" />
                    5-Min Note + YouTube
                  </>
                )}
              </button>
              <button
                onClick={() => handleStartLiveVoiceTutorial()}
                disabled={isGeneratingTutorial}
                title="Connects Gemini Live Voice Coach to teach you this topic interactively in 5 minutes"
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Teach Me Live</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Capture Concept from Live API & Chat Discussion */}
        {activeGeneratorTab === 'discussion' && (
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
              placeholder="Optional focus (e.g., 'Prefix sum hash map trick' or 'Deque invariant')..."
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
          </div>
        )}

        {/* TAB 3: Search YouTube Tutorials & Add to Notes */}
        {activeGeneratorTab === 'youtube_search' && (
          <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30 space-y-2">
            <form
              onSubmit={(e) => handleSearchResources(e)}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={resourceSearchQuery}
                onChange={(e) => setResourceSearchQuery(e.target.value)}
                placeholder="Search YouTube tutorials (e.g., Python hash map dict, sliding window)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={isSearchingResources}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition"
              >
                {isSearchingResources ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Search</span>
              </button>
            </form>

            {revisionNotes.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span>Add to note:</span>
                <select
                  value={targetNoteIdForResource || revisionNotes[0]?.id || ''}
                  onChange={(e) => setTargetNoteIdForResource(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-200 truncate"
                >
                  {revisionNotes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {searchedResources.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                {searchedResources.map((res, i) => (
                  <div
                    key={`${res.url}-${i}`}
                    className="p-2 rounded bg-slate-950/90 border border-slate-800 flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-slate-100 hover:text-rose-300 flex items-center gap-1 truncate"
                      >
                        <Youtube className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="truncate">{res.title}</span>
                      </a>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span>{res.channel || 'YouTube'}</span>
                        {res.duration && <span>• {res.duration}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {res.video_id && (
                        <button
                          type="button"
                          onClick={() =>
                            setPlayingVideoId(
                              playingVideoId === res.video_id
                                ? null
                                : res.video_id || null
                            )
                          }
                          title="Watch video inline"
                          className="px-1.5 py-1 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAttachResourceToNote(res)}
                        className="px-2 py-1 rounded text-[10px] font-semibold bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {statusBanner && (
          <div className="text-[11px] text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 rounded px-2.5 py-1.5">
            {statusBanner}
          </div>
        )}

        {/* Inline Embedded YouTube Player when a video is clicked */}
        {playingVideoId && (
          <div className="rounded-lg overflow-hidden border border-slate-700 bg-black">
            <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900 text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5 font-semibold">
                <Youtube className="w-3.5 h-3.5 text-rose-500" />
                YouTube Tutorial Player
              </span>
              <button
                onClick={() => setPlayingVideoId(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${playingVideoId}?autoplay=1`}
                title="YouTube tutorial player"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Search & Filter Controls */}
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter your saved notes, formulas, or YouTube links..."
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
            placeholder="Concept Title (e.g., Python dict & Hash Maps Cheat-Sheet)"
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
              placeholder="dict lookup/insert is O(1) average time&#10;Use d.get(key, 0) or collections.Counter for frequency counting"
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Formula / Python Code Template
            </label>
            <textarea
              rows={4}
              value={codeOrFormula}
              onChange={(e) => setCodeOrFormula(e.target.value)}
              placeholder="seen = {}&#10;for i, x in enumerate(nums):&#10;    if target - x in seen:&#10;        return [seen[target - x], i]&#10;    seen[x] = i"
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
              No Reference Notes or Tutorials Yet
            </p>
            <p className="leading-relaxed">
              Pick a topic above (like{' '}
              <span className="text-emerald-300 font-mono">
                Python dict &amp; Hash Maps
              </span>
              ) and click <strong>5-Min Note + YouTube</strong> or{' '}
              <strong>Teach Me Live</strong> to learn any concept from scratch
              with curated YouTube tutorials.
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
                    {note.problem_id &&
                      note.problem_id !== 'GENERAL' &&
                      note.problem_id !== 'TUTORIAL' && (
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
                      {note.source === 'tutorial'
                        ? '🎓 5-Min Tutorial'
                        : note.source === 'live_coach'
                        ? '🎙️ Live Coach'
                        : note.source === 'ai_summary'
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
                    onClick={() => handleStartLiveVoiceTutorial(note.title)}
                    title="Have Gemini Live Coach explain this note out loud in a 5-minute interactive tutorial"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30"
                  >
                    <Mic className="w-3 h-3" />
                    <span>Explain Live</span>
                  </button>
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                      <Code2 className="w-3 h-3" />
                      <span>Python Cheat-Sheet / Formula</span>
                    </div>
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

              {/* YouTube Tutorials & Reference Links Section */}
              <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">
                    <Youtube className="w-3.5 h-3.5 text-rose-400" />
                    YouTube Tutorials &amp; Links ({note.resources?.length || 0})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetNoteIdForResource(note.id);
                        setResourceSearchQuery(note.title);
                        setActiveGeneratorTab('youtube_search');
                        handleSearchResources(undefined, note.title);
                      }}
                      className="text-[10px] text-rose-300 hover:text-rose-200 underline"
                    >
                      Find YouTube Videos
                    </button>
                    <span className="text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAddingLinkForNoteId(
                          addingLinkForNoteId === note.id ? null : note.id
                        )
                      }
                      className="inline-flex items-center gap-0.5 text-[10px] text-emerald-300 hover:text-emerald-200"
                    >
                      <Link2 className="w-3 h-3" />
                      <span>+ Add URL</span>
                    </button>
                  </div>
                </div>

                {addingLinkForNoteId === note.id && (
                  <form
                    onSubmit={(e) => handleAddCustomLinkToNote(e, note)}
                    className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1.5"
                  >
                    <input
                      type="text"
                      value={customLinkTitle}
                      onChange={(e) => setCustomLinkTitle(e.target.value)}
                      placeholder="Link or Video Title (optional)"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-white"
                    />
                    <div className="flex gap-1.5">
                      <input
                        type="url"
                        required
                        value={customLinkUrl}
                        onChange={(e) => setCustomLinkUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-white"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-600 text-white"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                )}

                {note.resources && note.resources.length > 0 ? (
                  <div className="space-y-1.5">
                    {note.resources.map((res, rIdx) => (
                      <div
                        key={`${res.url}-${rIdx}`}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-slate-950/80 border border-slate-800/80 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <a
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-slate-200 hover:text-rose-300 flex items-center gap-1.5 truncate"
                          >
                            {res.kind === 'docs' ? (
                              <ExternalLink className="w-3 h-3 text-indigo-400 shrink-0" />
                            ) : (
                              <Youtube className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            )}
                            <span className="truncate">{res.title}</span>
                          </a>
                          <div className="text-[10px] text-slate-500 pl-5">
                            {res.channel || 'Resource'}
                            {res.duration ? ` • ${res.duration}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {res.video_id && (
                            <button
                              type="button"
                              onClick={() =>
                                setPlayingVideoId(
                                  playingVideoId === res.video_id
                                    ? null
                                    : res.video_id || null
                                )
                              }
                              title="Watch inline in player"
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 flex items-center gap-1"
                            >
                              <Play className="w-2.5 h-2.5" />
                              <span>Watch</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveResourceFromNote(note, res.url)
                            }
                            title="Remove link"
                            className="p-1 text-slate-500 hover:text-rose-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No links attached yet — click{' '}
                    <strong>Find YouTube Videos</strong> or{' '}
                    <strong>+ Add URL</strong> to attach tutorials.
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
