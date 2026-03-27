"use client";

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/components/AppShell';
import SpeechTimeline from '@/components/round/SpeechTimeline';
import DocumentUpload from '@/components/round/DocumentUpload';
import SpeechDisplay from '@/components/round/SpeechDisplay';
import FlowView from '@/components/round/FlowView';
import GenerateSpeechPanel from '@/components/round/GenerateSpeechPanel';
import CXPanel from '@/components/round/CXPanel';
import ExplainModal from '@/components/round/ExplainModal';

const SPEECH_ORDER_MAP: Record<string, number> = {
  '1AC': 0, 'CX_after_1AC': 1, '1NC': 2, 'CX_after_1NC': 3,
  '2AC': 4, 'CX_after_2AC': 5, '2NC': 6, 'CX_after_2NC': 7,
  '1NR': 8, '1AR': 9, '2NR': 10, '2AR': 11,
};

const SPEECH_INFO: { type: string; label: string; affSpeaker: boolean; time: number; isCX?: boolean }[] = [
  { type: '1AC', label: '1AC', affSpeaker: true, time: 8 },
  { type: 'CX_after_1AC', label: 'CX of 1AC', affSpeaker: false, time: 3, isCX: true },
  { type: '1NC', label: '1NC', affSpeaker: false, time: 8 },
  { type: 'CX_after_1NC', label: 'CX of 1NC', affSpeaker: true, time: 3, isCX: true },
  { type: '2AC', label: '2AC', affSpeaker: true, time: 8 },
  { type: 'CX_after_2AC', label: 'CX of 2AC', affSpeaker: false, time: 3, isCX: true },
  { type: '2NC', label: '2NC', affSpeaker: false, time: 8 },
  { type: 'CX_after_2NC', label: 'CX of 2NC', affSpeaker: true, time: 3, isCX: true },
  { type: '1NR', label: '1NR', affSpeaker: false, time: 5 },
  { type: '1AR', label: '1AR', affSpeaker: true, time: 5 },
  { type: '2NR', label: '2NR', affSpeaker: false, time: 5 },
  { type: '2AR', label: '2AR', affSpeaker: true, time: 5 },
];

interface Speech {
  id: string;
  speech_type: string;
  speaker: string;
  raw_content: string;
  parsed_content: unknown[];
  generated_html: string;
  source_type: string;
}

interface FlowEntry {
  id: string;
  row_index: number;
  category: string;
  label: string;
  entries: Record<string, { text: string; status: string }>;
}

interface Round {
  id: string;
  side: string;
  opponent_name: string;
  opponent_school: string;
  tournament: string;
  round_number: string;
  topic: string;
  round_context: string;
  partner_name: string | null;
}

interface CXQ { question: string; target_argument: string; strategic_goal: string; follow_ups: string[] }
interface CXA { likely_question: string; suggested_answer: string; strategy_note: string }

export default function RoundWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { userName } = useApp();
  const [roundId, setRoundId] = useState('');
  const [round, setRound] = useState<Round | null>(null);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [flowEntries, setFlowEntries] = useState<FlowEntry[]>([]);
  const [tab, setTab] = useState<'speeches' | 'flow' | 'generate'>('speeches');
  const [activeSlot, setActiveSlot] = useState<string | null>('1AC');
  const [processingSlot, setProcessingSlot] = useState<string | null>(null);
  const [cards, setCards] = useState<{ id: string; tag: string; cite_author: string }[]>([]);
  const [cxQuestions, setCxQuestions] = useState<CXQ[]>([]);
  const [cxAnswers, setCxAnswers] = useState<CXA[]>([]);
  const [cxLoading, setCxLoading] = useState(false);
  const [explainText, setExplainText] = useState('');
  const [explainLoading, setExplainLoading] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [genProgress, setGenProgress] = useState<{ step: number; total: number; label: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [flowGenerating, setFlowGenerating] = useState(false);
  const [roundContext, setRoundContext] = useState('');
  const [contextSaved, setContextSaved] = useState(false);

  // Load params
  useEffect(() => {
    params.then(p => setRoundId(p.id));
  }, [params]);

  // Load round data
  const loadRound = useCallback(async () => {
    if (!roundId) return;
    const res = await fetch(`/api/rounds/${roundId}`);
    const data = await res.json();
    setRound(data.round);
    setSpeeches(data.speeches || []);
    setFlowEntries(data.flowEntries || []);
    setRoundContext(data.round?.round_context || '');
  }, [roundId]);

  useEffect(() => { loadRound(); }, [loadRound]);

  // Load cards for library
  useEffect(() => {
    fetch('/api/library/search?q=').then(r => r.json()).then(data => setCards(data || [])).catch(() => {});
  }, []);

  const isUserSpeech = (type: string) => {
    const info = SPEECH_INFO.find(s => s.type === type);
    if (!info) return false;
    return round?.side === 'aff' ? info.affSpeaker : !info.affSpeaker;
  };

  const getSpeech = (type: string) => speeches.find(s => s.speech_type === type);

  const [speechProgress, setSpeechProgress] = useState<{ step: number; total: number; label: string } | null>(null);

  // Submit a speech (upload or paste)
  const handleSpeechSubmit = async (type: string, content: string, sourceType: 'paste' | 'upload', filename?: string, hasHighlights?: boolean) => {
    setProcessingSlot(type);
    setSpeechProgress({ step: 1, total: 3, label: 'Uploading...' });
    const speaker = isUserSpeech(type) ? 'user' : 'opponent';

    try {
      const res = await fetch(`/api/rounds/${roundId}/speeches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speech_type: type,
          speaker,
          content,
          source_type: sourceType,
          source_filename: filename,
          speech_order: SPEECH_ORDER_MAP[type] ?? 0,
          hasHighlights,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';
          for (const message of messages) {
            if (!message.trim()) continue;
            const lines = message.split('\n');
            let eventType = '';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr = line.slice(6);
            }
            if (dataStr) {
              try {
                const data = JSON.parse(dataStr);
                if (eventType === 'progress') {
                  setSpeechProgress(data);
                } else if (eventType === 'done' || data.id) {
                  await loadRound();
                  // Auto-regenerate flow when a speech is added
                  autoUpdateFlow();
                } else if (eventType === 'parsed') {
                  // AI parsing finished — reload to get parsed content
                  await loadRound();
                } else if (eventType === 'parse_error') {
                  console.warn('Parse warning:', data.message);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.error('Speech submit error:', err);
    } finally {
      setProcessingSlot(null);
      setSpeechProgress(null);
    }
  };

  // Auto-update flow when speeches change
  const autoUpdateFlow = async () => {
    // Only auto-generate if we have at least 2 speeches (need something to flow)
    const currentSpeeches = await fetch(`/api/rounds/${roundId}/speeches`).then(r => r.json()).catch(() => []);
    if (!currentSpeeches || currentSpeeches.length < 2) return;

    // Check if any speeches have parsed content
    const hasParsed = currentSpeeches.some((s: Speech) => s.parsed_content && (s.parsed_content as unknown[]).length > 0);
    if (!hasParsed) return;

    setFlowGenerating(true);
    try {
      const res = await fetch(`/api/rounds/${roundId}/flow`, { method: 'POST' });
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          if (text.includes('"row_index"')) {
            await loadRound();
          }
        }
      }
    } catch (err) {
      console.error('Auto flow update error:', err);
    }
    setFlowGenerating(false);
  };

  // Generate speech
  const handleGenerateSpeech = async (speechType: string, cardIds: string[], instructions: string, rapid: boolean) => {
    setIsGenerating(true);
    setGenProgress({ step: 1, total: 5, label: 'Starting...' });

    const res = await fetch(`/api/rounds/${roundId}/generate-speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speech_type: speechType, card_ids: cardIds, additional_instructions: instructions, rapid }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('event: ')) continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.step) setGenProgress(data);
              if (data.id) await loadRound();
            } catch {}
          }
        }
      }
    }
    setIsGenerating(false);
    setGenProgress(null);
  };

  // Generate flow
  const handleGenerateFlow = async () => {
    setFlowGenerating(true);
    const res = await fetch(`/api/rounds/${roundId}/flow`, { method: 'POST' });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        if (text.includes('"row_index"')) {
          await loadRound();
        }
      }
    }
    setFlowGenerating(false);
  };

  // CX
  const handleCXQuestions = async (speechType: string) => {
    setCxLoading(true);
    const res = await fetch(`/api/rounds/${roundId}/generate-cx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_speech_type: speechType, mode: 'questions' }),
    });
    const data = await res.json();
    setCxQuestions(data);
    setCxLoading(false);
  };

  const handleCXAnswers = async (speechType: string) => {
    setCxLoading(true);
    const res = await fetch(`/api/rounds/${roundId}/generate-cx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_speech_type: speechType, mode: 'answers' }),
    });
    const data = await res.json();
    setCxAnswers(data);
    setCxLoading(false);
  };

  // Explain
  const handleExplain = async (text: string) => {
    setShowExplain(true);
    setExplainLoading(true);
    setExplainText('');
    const res = await fetch(`/api/rounds/${roundId}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ argument_text: text }),
    });
    const data = await res.json();
    setExplainText(data.explanation);
    setExplainLoading(false);
  };

  // Iterate speech
  const handleIterateSpeech = async (speechId: string, instruction: string) => {
    const res = await fetch(`/api/rounds/${roundId}/iterate-speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speech_id: speechId, instruction }),
    });
    await res.json();
    await loadRound();
  };

  // Export flow
  const handleExportFlow = async () => {
    const res = await fetch('/api/flow-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round_id: roundId }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'debate-flow.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export sendable speech (cards only, no analytics)
  const handleExportSendable = (speech: Speech) => {
    // Build sendable HTML: only cards (tag + cite + evidence), no analytics
    let sendableHtml = '';
    if (speech.parsed_content) {
      for (const arg of speech.parsed_content as Array<{ type: string; tag?: string; cite?: string; evidence_html?: string }>) {
        if (arg.type === 'card' && arg.tag && arg.evidence_html) {
          sendableHtml += `<p style="font-family:Georgia,serif;font-size:13px;font-weight:bold;margin:12px 0 4px 0;">${arg.tag}</p>`;
          if (arg.cite) {
            sendableHtml += `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 4px 0;">${arg.cite}</p>`;
          }
          const evidence = arg.evidence_html
            .replace(/<mark>/g, '</span><b><u><span style="font-family:Georgia,serif;font-size:11px;">')
            .replace(/<\/mark>/g, '</span></u></b><span style="font-family:Georgia,serif;font-size:8px;color:#666;">');
          sendableHtml += `<p style="font-family:Georgia,serif;font-size:8px;color:#666;margin:0 0 8px 0;line-height:1.4;"><span style="font-family:Georgia,serif;font-size:8px;color:#666;">${evidence}</span></p>`;
        }
      }
    }
    if (!sendableHtml) {
      // Fallback: use generated HTML but try to strip analytics
      sendableHtml = (speech.generated_html || speech.raw_content)
        .replace(/<p class="analytic">[\s\S]*?<\/p>/g, '')
        .replace(/<div class="analytic">[\s\S]*?<\/div>/g, '');
    }

    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([sendableHtml], { type: 'text/html' }),
        'text/plain': new Blob([sendableHtml.replace(/<[^>]+>/g, '\n')], { type: 'text/plain' }),
      }),
    ]).then(() => alert('Sendable speech copied! Paste into Google Docs.'));
  };

  // Save round context
  const handleSaveContext = async () => {
    await fetch(`/api/rounds/${roundId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round_context: roundContext }),
    });
    setContextSaved(true);
    setTimeout(() => setContextSaved(false), 2000);
  };

  // Cell edit
  const handleCellEdit = async (rowId: string, speechType: string, text: string) => {
    // Optimistic update
    setFlowEntries(prev => prev.map(e => {
      if (e.id === rowId) {
        const newEntries = { ...e.entries };
        newEntries[speechType] = { text, status: newEntries[speechType]?.status || 'new' };
        return { ...e, entries: newEntries };
      }
      return e;
    }));
  };

  const speechSlots = SPEECH_INFO.map(info => ({
    ...info,
    speaker: info.affSpeaker ? 'aff' as const : 'neg' as const,
    status: (processingSlot === info.type ? 'generating' : getSpeech(info.type) ? 'filled' : 'empty') as 'empty' | 'filled' | 'generating',
    isUser: isUserSpeech(info.type),
  }));

  const availableSpeechTypes = SPEECH_INFO.filter(s => !s.isCX).map(s => s.type);
  const filledSpeechTypes = speeches.map(s => s.speech_type);

  if (!round) return <div className="text-center py-12 text-[#666]">Loading round...</div>;

  return (
    <div className="space-y-4">
      {/* Round header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-mono px-2 py-1 rounded ${
            round.side === 'aff' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
          }`}>
            {round.side.toUpperCase()}
          </span>
          <h1 className="text-[16px] font-semibold text-white">
            vs. {round.opponent_name || 'TBD'} {round.opponent_school ? `(${round.opponent_school})` : ''}
          </h1>
          {round.tournament && (
            <span className="text-[12px] text-[#888]">{round.tournament}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#1a1a1a] pb-px">
        {(['speeches', 'flow', 'generate'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] rounded-t-lg transition-colors ${
              tab === t ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-white'
            }`}
          >
            {t === 'speeches' ? 'Speeches' : t === 'flow' ? 'Flow' : 'Generate'}
          </button>
        ))}
      </div>

      {/* Context */}
      {tab !== 'flow' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[12px] text-[#888]">Round Context</label>
            <button onClick={handleSaveContext} className={`text-[11px] transition-colors ${contextSaved ? 'text-green-400' : 'text-[#999] hover:text-white'}`}>
              {contextSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
          <textarea
            value={roundContext}
            onChange={e => setRoundContext(e.target.value)}
            placeholder="Add context about this round..."
            className="w-full h-16 px-3 py-2 text-[12px] bg-[#111] border border-[#1a1a1a] rounded-lg text-[#ccc] placeholder:text-[#777] focus:outline-none focus:border-[#333] resize-y"
          />
        </div>
      )}

      {/* Speeches tab */}
      {tab === 'speeches' && (
        <div className="grid grid-cols-[220px_1fr] gap-4">
          {/* Timeline sidebar */}
          <SpeechTimeline
            slots={speechSlots}
            activeSlot={activeSlot}
            onSlotClick={setActiveSlot}
          />

          {/* Active speech content */}
          <div className="space-y-4">
            {activeSlot && (
              <>
                <h2 className="text-[15px] font-medium text-white">
                  {SPEECH_INFO.find(s => s.type === activeSlot)?.label}
                  <span className="text-[12px] text-[#666] ml-2">
                    ({isUserSpeech(activeSlot) ? 'Your speech' : "Opponent's speech"})
                  </span>
                </h2>

                {processingSlot === activeSlot && speechProgress && (
                  <div className="flex items-center gap-3 px-4 py-4 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a]">
                    <div className="animate-spin w-4 h-4 border-2 border-[#333] border-t-white rounded-full shrink-0" />
                    <div>
                      <div className="text-[13px] text-white">{speechProgress.label}</div>
                      <div className="text-[11px] text-[#666] mt-0.5">Step {speechProgress.step} of {speechProgress.total}</div>
                    </div>
                  </div>
                )}

                {getSpeech(activeSlot) ? (
                  <div className="space-y-3">
                    <SpeechDisplay
                      speechType={activeSlot}
                      html={getSpeech(activeSlot)!.generated_html}
                      rawContent={getSpeech(activeSlot)!.raw_content}
                      sourceType={getSpeech(activeSlot)!.source_type}
                      sourceFilename={undefined}
                      onIterate={(instr) => handleIterateSpeech(getSpeech(activeSlot)!.id, instr)}
                      onExplain={handleExplain}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleExportSendable(getSpeech(activeSlot)!)}
                        className="px-3 py-1.5 text-[11px] text-[#888] hover:text-white border border-[#1a1a1a] hover:border-[#333] rounded-md transition-colors"
                      >
                        Copy Sendable (cards only)
                      </button>
                    </div>
                  </div>
                ) : (
                  <DocumentUpload
                    key={activeSlot}
                    onSubmit={(content, sourceType, filename, hasHighlights) =>
                      handleSpeechSubmit(activeSlot, content, sourceType, filename, hasHighlights)
                    }
                    isLoading={processingSlot === activeSlot}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Flow tab */}
      {tab === 'flow' && (
        <div className="-mx-4 sm:-mx-6 px-4 sm:px-6">
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleGenerateFlow}
              disabled={flowGenerating || speeches.length === 0}
              className="px-4 py-2 text-[12px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors"
            >
              {flowGenerating ? 'Generating Flow...' : 'Generate / Refresh Flow'}
            </button>
          </div>
          <FlowView
            rows={flowEntries}
            onCellEdit={handleCellEdit}
            onExport={handleExportFlow}
            isGenerating={flowGenerating}
          />
        </div>
      )}

      {/* Generate tab */}
      {tab === 'generate' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div>
              <h3 className="text-[14px] font-medium text-white mb-3">Generate Speech</h3>
              <GenerateSpeechPanel
                speechTypes={availableSpeechTypes.filter(t => !filledSpeechTypes.includes(t))}
                onGenerate={handleGenerateSpeech}
                isGenerating={isGenerating}
                progress={genProgress}
                cards={cards}
              />
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="text-[14px] font-medium text-white mb-3">Cross-Examination</h3>
              <CXPanel
                questions={cxQuestions}
                answers={cxAnswers}
                onGenerateQuestions={handleCXQuestions}
                onGenerateAnswers={handleCXAnswers}
                availableSpeeches={filledSpeechTypes.filter(t => !t.startsWith('CX'))}
                isLoading={cxLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Explain modal */}
      {showExplain && (
        <ExplainModal
          explanation={explainText}
          isLoading={explainLoading}
          onClose={() => setShowExplain(false)}
        />
      )}
    </div>
  );
}
