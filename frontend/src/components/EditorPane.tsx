import React, { useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { RotateCcw, Sparkles, X, Code2 } from 'lucide-react';
import { useAppStore } from '../store';
import { coachSocket } from '../coach/CoachSocket';

export const EditorPane: React.FC = () => {
  const {
    currentProblem,
    code,
    cursorLine,
    highlight,
    theme,
    setCode,
    setCursorLine,
    setHighlight,
    resetCodeToStarter,
  } = useAppStore();

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const idleTimerRef = useRef<any>(null);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((e) => {
      setCursorLine(e.position.lineNumber);
    });
  };

  // Debounced 8-second idle snapshot to LiveCoach
  useEffect(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      if (code && code.trim().length > 0) {
        coachSocket.sendCodeSnapshot(code, cursorLine, 'idle');
      }
    }, 8000);

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [code, cursorLine]);

  // Apply Monaco line decorations when coach calls highlight_line
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (!highlight) {
      decorationsRef.current = editor.deltaDecorations(
        decorationsRef.current,
        []
      );
      return;
    }

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(
          highlight.line_start,
          1,
          highlight.line_end,
          1
        ),
        options: {
          isWholeLine: true,
          className: 'bg-amber-500/20 border-l-4 border-amber-400',
          hoverMessage: { value: `**LiveCoach:** ${highlight.note}` },
        },
      },
    ]);

    editor.revealLineInCenter(highlight.line_start);
  }, [highlight]);

  const isTheory = currentProblem?.kind === 'theory';

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Editor Top Bar */}
      <div className="h-9 px-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <Code2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            {isTheory
              ? 'Derivation Scratchpad (Python / Math Notes — Coach Can Read)'
              : `Python 3.12 + NumPy (${currentProblem?.function_name || 'solution'})`}
          </span>
          <span className="text-slate-500 font-mono">Ln {cursorLine}</span>
        </div>

        <button
          onClick={resetCodeToStarter}
          title="Reset to starter code"
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      {/* Coach Highlight Note Banner */}
      {highlight && (
        <div className="px-3 py-2 bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong className="font-mono">
                Lines {highlight.line_start}
                {highlight.line_end !== highlight.line_start
                  ? `–${highlight.line_end}`
                  : ''}
                :
              </strong>{' '}
              {highlight.note}
            </span>
          </div>
          <button
            onClick={() => setHighlight(null)}
            className="p-0.5 hover:bg-amber-500/20 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="python"
          theme={theme === 'light' ? 'light' : 'vs-dark'}
          value={code}
          onChange={(val) => setCode(val ?? '')}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13.5,
            fontFamily:
              "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            insertSpaces: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  );
};
