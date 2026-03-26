import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url === "your-supabase-url-here") {
      throw new Error(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env"
      );
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// Convenience getter
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export interface Card {
  id: string;
  tag: string;
  cite: string;
  cite_author: string;
  cite_year: string;
  cite_credentials: string;
  cite_title: string;
  cite_date: string;
  cite_url: string;
  cite_access_date: string;
  cite_initials: string;
  evidence_html: string;
  author_name: string;
  argument_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Argument {
  id: string;
  title: string;
  description: string;
  author_name: string;
  card_ids: string[];
  created_at: string;
}

export interface UserContext {
  id: string;
  user_name: string;
  context: string;
  created_at: string;
  updated_at: string;
}

export type SpeechType = '1AC' | '1NC' | '2AC' | '2NC' | '1NR' | '1AR' | '2NR' | '2AR';
export type CXType = 'CX_after_1AC' | 'CX_after_1NC' | 'CX_after_2AC' | 'CX_after_2NC';

export const SPEECH_ORDER: { type: SpeechType | CXType; label: string; speaker: 'aff' | 'neg'; time: number; isCX?: boolean }[] = [
  { type: '1AC', label: '1AC', speaker: 'aff', time: 8 },
  { type: 'CX_after_1AC', label: 'CX of 1AC', speaker: 'neg', time: 3, isCX: true },
  { type: '1NC', label: '1NC', speaker: 'neg', time: 8 },
  { type: 'CX_after_1NC', label: 'CX of 1NC', speaker: 'aff', time: 3, isCX: true },
  { type: '2AC', label: '2AC', speaker: 'aff', time: 8 },
  { type: 'CX_after_2AC', label: 'CX of 2AC', speaker: 'neg', time: 3, isCX: true },
  { type: '2NC', label: '2NC', speaker: 'neg', time: 8 },
  { type: 'CX_after_2NC', label: 'CX of 2NC', speaker: 'aff', time: 3, isCX: true },
  { type: '1NR', label: '1NR', speaker: 'neg', time: 5 },
  { type: '1AR', label: '1AR', speaker: 'aff', time: 5 },
  { type: '2NR', label: '2NR', speaker: 'neg', time: 5 },
  { type: '2AR', label: '2AR', speaker: 'aff', time: 5 },
];

export interface ParsedArgument {
  id: string;
  type: 'card' | 'analytic' | 'theory' | 'framework';
  arg_type: string; // e.g., 'da-link', 'da-uniqueness', 'cp-text', 'k-link', 't-interp', 'case-advantage', etc.
  label: string;
  tag: string;
  cite?: string;
  evidence_html?: string;
  summary: string;
  parent_arg_id?: string;
  is_dropped?: boolean;
  is_turn?: boolean;
  flow_position?: number;
}

export interface FlowCell {
  text: string;
  status: 'answered' | 'dropped' | 'turned' | 'extended' | 'new';
  argument_id?: string;
  card_id?: string;
}

export interface Round {
  id: string;
  user_name: string;
  side: 'aff' | 'neg';
  opponent_name: string;
  opponent_school: string;
  tournament: string;
  round_number: string;
  topic: string;
  round_context: string;
  partner_name: string | null;
  status: 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Speech {
  id: string;
  round_id: string;
  speech_type: string;
  speaker: 'user' | 'opponent';
  raw_content: string;
  parsed_content: ParsedArgument[];
  generated_html: string;
  source_type: 'paste' | 'upload' | 'generated';
  source_filename: string | null;
  speech_order: number;
  created_at: string;
  updated_at: string;
}

export interface FlowEntry {
  id: string;
  round_id: string;
  row_index: number;
  category: string;
  label: string;
  entries: Record<string, FlowCell>;
  created_at: string;
}

export interface CardLibrary {
  id: string;
  collection_name: string;
  uploaded_by: string;
  file_name: string;
  created_at: string;
}

export interface CXQuestion {
  question: string;
  target_argument: string;
  strategic_goal: string;
  follow_ups: string[];
}
