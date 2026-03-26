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
