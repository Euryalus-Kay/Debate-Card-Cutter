"use client";

import { useState } from 'react';

interface CXQuestion {
  question: string;
  target_argument: string;
  strategic_goal: string;
  follow_ups: string[];
}

interface CXAnswer {
  likely_question: string;
  suggested_answer: string;
  strategy_note: string;
}

interface Props {
  questions: CXQuestion[];
  answers: CXAnswer[];
  onGenerateQuestions: (speechType: string) => void;
  onGenerateAnswers: (speechType: string) => void;
  availableSpeeches: string[];
  isLoading: boolean;
}

export default function CXPanel({ questions, answers, onGenerateQuestions, onGenerateAnswers, availableSpeeches, isLoading }: Props) {
  const [mode, setMode] = useState<'questions' | 'answers'>('questions');
  const [targetSpeech, setTargetSpeech] = useState(availableSpeeches[0] || '');
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={targetSpeech}
          onChange={(e) => setTargetSpeech(e.target.value)}
          className="px-3 py-1.5 text-[12px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white focus:outline-none"
        >
          {availableSpeeches.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="flex gap-1">
          <button
            onClick={() => { setMode('questions'); onGenerateQuestions(targetSpeech); }}
            disabled={isLoading}
            className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
              mode === 'questions' ? 'bg-[#1a1a1a] text-white' : 'text-[#666] hover:text-[#aaa]'
            }`}
          >
            {isLoading && mode === 'questions' ? '...' : 'Ask Questions'}
          </button>
          <button
            onClick={() => { setMode('answers'); onGenerateAnswers(targetSpeech); }}
            disabled={isLoading}
            className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
              mode === 'answers' ? 'bg-[#1a1a1a] text-white' : 'text-[#666] hover:text-[#aaa]'
            }`}
          >
            {isLoading && mode === 'answers' ? '...' : 'Prep Answers'}
          </button>
        </div>
      </div>

      {mode === 'questions' && questions.length > 0 && (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] overflow-hidden">
              <button
                onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                className="w-full text-left px-3 py-2 flex items-start gap-2"
              >
                <span className="text-[11px] text-[#555] font-mono shrink-0">{i + 1}.</span>
                <span className="text-[12px] text-[#ddd]">{q.question}</span>
              </button>
              {expandedQ === i && (
                <div className="px-3 pb-3 space-y-2 border-t border-[#1a1a1a] pt-2">
                  <p className="text-[11px] text-[#888]">
                    <span className="text-[#555]">Target:</span> {q.target_argument}
                  </p>
                  <p className="text-[11px] text-[#888]">
                    <span className="text-[#555]">Goal:</span> {q.strategic_goal}
                  </p>
                  {q.follow_ups.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-[#555]">Follow-ups:</span>
                      {q.follow_ups.map((f, j) => (
                        <p key={j} className="text-[11px] text-[#777] pl-3">→ {f}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mode === 'answers' && answers.length > 0 && (
        <div className="space-y-2">
          {answers.map((a, i) => (
            <div key={i} className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] p-3 space-y-1.5">
              <p className="text-[12px] text-orange-400/80">Q: {a.likely_question}</p>
              <p className="text-[12px] text-[#ccc]">A: {a.suggested_answer}</p>
              <p className="text-[10px] text-[#555] italic">{a.strategy_note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
