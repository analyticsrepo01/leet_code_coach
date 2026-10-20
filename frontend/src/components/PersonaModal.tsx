import React, { useEffect, useState } from 'react';
import {
  X,
  UserCheck,
  Plus,
  Save,
  Trash2,
  Download,
  Upload,
  Sparkles,
  Check,
} from 'lucide-react';
import {
  deletePersonaApi,
  fetchProblem,
  savePersonaApi,
  UserPersonaItem,
} from '../api';
import { CoachMode, useAppStore } from '../store';
import { coachSocket } from '../coach/CoachSocket';

const EMOJI_OPTIONS = ['🎓', '🌱', '💻', '⚡', '🚀', '🧠', '🐍', '🎯'];
const VOICE_OPTIONS = ['Puck', 'Kore', 'Charon', 'Fenrir', 'Aoede'];

export const PersonaModal: React.FC = () => {
  const {
    personas,
    activePersonaId,
    showPersonaModal,
    currentProblem,
    setShowPersonaModal,
    setActivePersonaId,
    upsertPersona,
    removePersona,
    setMode,
    setTheme,
    setCurrentProblem,
  } = useAppStore();

  const activePersona =
    personas.find((p) => p.id === activePersonaId) || personas[0];

  const [selectedId, setSelectedId] = useState<string>(activePersonaId);
  const [form, setForm] = useState<UserPersonaItem>(activePersona);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    const found =
      personas.find((p) => p.id === selectedId) ||
      personas.find((p) => p.id === activePersonaId) ||
      personas[0];
    if (found) {
      setForm({ ...found });
    }
  }, [selectedId, personas, activePersonaId]);

  if (!showPersonaModal) return null;

  const handleSelectCard = (p: UserPersonaItem) => {
    setSelectedId(p.id);
    setForm({ ...p });
    setSavedBanner(null);
  };

  const handleCreateNew = () => {
    const newId = `persona-${Math.random().toString(36).slice(2, 9)}`;
    const blank: UserPersonaItem = {
      id: newId,
      name: 'My Custom Persona',
      avatar_emoji: '🚀',
      role: 'Grade 14 / CS Learner',
      experience_level: 'intermediate',
      coding_background:
        'Learning Python data structures and algorithms, practicing problem-solving step by step.',
      coaching_style:
        'Friendly, encouraging Socratic coach. Walk through examples clearly before writing code.',
      preferred_mode: 'tutor',
      preferred_voice: 'Puck',
      preferred_track: 'cs',
      preferred_difficulty: 'all',
      preferred_theme: 'dark',
      is_builtin: false,
    };
    setSelectedId(newId);
    setForm(blank);
    setSavedBanner(null);
  };

  const handleSaveAndActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setSavedBanner(null);
    try {
      let saved = { ...form, name: form.name.trim() };
      try {
        saved = await savePersonaApi(saved);
      } catch {
        // Fallback to local persistence if offline
      }
      upsertPersona(saved);
      setActivePersonaId(saved.id);
      setSelectedId(saved.id);

      if (
        saved.preferred_mode === 'tutor' ||
        saved.preferred_mode === 'interview' ||
        saved.preferred_mode === 'review'
      ) {
        setMode(saved.preferred_mode as CoachMode);
      }
      if (saved.preferred_theme === 'light' || saved.preferred_theme === 'dark') {
        setTheme(saved.preferred_theme);
      }

      let targetProblemId = currentProblem?.id;
      if (
        (saved.id === 'persona-llm-ml' || saved.id === 'persona-ml-interviewer') &&
        (!currentProblem ||
          !['M17', 'M18', 'M19', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17'].includes(
            currentProblem.id
          ))
      ) {
        try {
          const slpProblem = await fetchProblem('T11');
          setCurrentProblem(slpProblem);
          targetProblemId = slpProblem.id;
        } catch {}
      }

      if (coachSocket.isConnected && targetProblemId) {
        coachSocket.switchContext(
          targetProblemId,
          (saved.preferred_mode as CoachMode) || 'tutor',
          saved.id
        );
      }

      if (saved.id === 'persona-ml-interviewer') {
        setShowPersonaModal(false);
        setTimeout(() => {
          coachSocket.sendText(
            'Ask me a realistic ML / LLM interview question right now. After I answer, grade my response, give concrete suggestions to improve my answer, and save the Q&A note to Reference Notes.'
          );
        }, 150);
        return;
      }

      setSavedBanner(`Saved & activated "${saved.name}"!`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePersonaApi(id);
    } catch {}
    removePersona(id);
    setSelectedId('persona-student');
  };

  const handleExportJson = () => {
    const payload = {
      active_persona_id: activePersonaId,
      personas,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `livecoach-personas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const list: UserPersonaItem[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.personas)
          ? parsed.personas
          : [];
        for (const item of list) {
          if (item && item.id && item.name) {
            upsertPersona(item);
            try {
              await savePersonaApi(item);
            } catch {}
          }
        }
        if (parsed.active_persona_id) {
          setActivePersonaId(parsed.active_persona_id);
          setSelectedId(parsed.active_persona_id);
        }
        setSavedBanner(`Imported ${list.length} persona profile(s)!`);
      } catch {
        setSavedBanner('Could not parse imported JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Learner Personas &amp; Saved Preferences
              </h2>
              <p className="text-xs text-slate-400">
                Customize how Gemini Live Voice &amp; Gemini 4 Argon coach you —
                saved to server &amp; browser
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportJson}
              title="Export personas & preferences as JSON"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Import
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowPersonaModal(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {/* Left column: Persona list */}
          <div className="md:col-span-5 p-4 space-y-2.5 bg-slate-950/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Saved Profiles ({personas.length})
              </span>
              <button
                type="button"
                onClick={handleCreateNew}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                <Plus className="w-3.5 h-3.5" />
                New Persona
              </button>
            </div>

            <div className="space-y-2">
              {personas.map((p) => {
                const isSelected = p.id === selectedId;
                const isActive = p.id === activePersonaId;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectCard(p)}
                    className={`p-3 rounded-xl border cursor-pointer transition flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/50'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">{p.avatar_emoji}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-white truncate">
                            {p.name}
                          </span>
                          {isActive && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <Check className="w-2.5 h-2.5" />
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {p.role} · {p.experience_level}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            Mode: {p.preferred_mode}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            Track: {p.preferred_track.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!p.is_builtin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        title="Delete custom persona"
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right column: Persona editor & preferences */}
          <form
            onSubmit={handleSaveAndActivate}
            className="md:col-span-7 p-5 space-y-4"
          >
            {savedBanner && (
              <div className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{savedBanner}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Avatar
                </label>
                <div className="flex items-center gap-1 flex-wrap bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                  {EMOJI_OPTIONS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setForm({ ...form, avatar_emoji: em })}
                      className={`w-6 h-6 rounded flex items-center justify-center text-sm ${
                        form.avatar_emoji === em
                          ? 'bg-emerald-500/30 ring-1 ring-emerald-400'
                          : 'hover:bg-slate-800'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Persona Name
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Aryan - Grade 14 CS"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Role / Grade / Goal
                </label>
                <input
                  type="text"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="e.g. Grade 14 Student"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Experience Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'beginner', label: '🌱 Beginner (From Scratch)' },
                    { id: 'intermediate', label: '🎓 Intermediate (Student / SWE)' },
                    { id: 'advanced', label: '⚡ Advanced (Deep Dive)' },
                  ] as const
                ).map((lvl) => (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, experience_level: lvl.id })
                    }
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                      form.experience_level === lvl.id
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Coding Background &amp; Learning Goals
              </label>
              <textarea
                rows={2}
                value={form.coding_background}
                onChange={(e) =>
                  setForm({ ...form, coding_background: e.target.value })
                }
                placeholder="Describe what you know and what you want to practice..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                AI Coaching Style Instructions (Voice &amp; Argon Chat)
              </label>
              <textarea
                rows={2}
                value={form.coaching_style}
                onChange={(e) =>
                  setForm({ ...form, coaching_style: e.target.value })
                }
                placeholder="How should the AI explain concepts? (e.g. step-by-step dry runs, patient Socratic hints, or rigorous interview mode)"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Saved Preferences Grid */}
            <div className="pt-2 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Saved Preferences for this Persona
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Default Coach Mode
                  </label>
                  <select
                    value={form.preferred_mode}
                    onChange={(e) =>
                      setForm({ ...form, preferred_mode: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                  >
                    <option value="tutor">Tutor (Socratic)</option>
                    <option value="interview">Interview (45m)</option>
                    <option value="review">Review (Solutions)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Preferred Track
                  </label>
                  <select
                    value={form.preferred_track}
                    onChange={(e) =>
                      setForm({ ...form, preferred_track: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                  >
                    <option value="cs">CS &amp; LeetCode Classics</option>
                    <option value="all">All Tracks</option>
                    <option value="ds">Quant DS&amp;A</option>
                    <option value="ml">Post-Training NumPy</option>
                    <option value="theory">Theory Cards</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Preferred Voice
                  </label>
                  <select
                    value={form.preferred_voice}
                    onChange={(e) =>
                      setForm({ ...form, preferred_voice: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                  >
                    {VOICE_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Preferred Theme
                  </label>
                  <select
                    value={form.preferred_theme}
                    onChange={(e) =>
                      setForm({ ...form, preferred_theme: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                  >
                    <option value="dark">Dark Mode</option>
                    <option value="light">Light Mode</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPersonaModal(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition"
              >
                <Save className="w-3.5 h-3.5" />
                {saving
                  ? 'Saving...'
                  : 'Save Preferences & Activate Persona'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
