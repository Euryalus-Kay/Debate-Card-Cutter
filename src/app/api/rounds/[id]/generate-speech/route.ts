import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { planSpeech, assembleSpeech, generateCard, generateCardFast } from '@/lib/anthropic';
import { searchEvidence } from '@/lib/perplexity';
import { scrapeArticle } from '@/lib/scraper';
import { v4 as uuid } from 'uuid';

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params;
  const body = await req.json();
  const { speech_type, card_ids, additional_instructions, rapid } = body;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send('progress', { step: 1, total: 5, label: 'Loading round context...', icon: 'load' });

        // Load everything
        const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).single();
        const { data: speeches } = await supabase
          .from('speeches').select('*').eq('round_id', roundId).order('speech_order', { ascending: true });
        const { data: flowEntries } = await supabase
          .from('flow_entries').select('*').eq('round_id', roundId);
        const { data: allCards } = await supabase
          .from('cards').select('id, tag, cite, cite_author, cite_year, evidence_html').eq('is_shared', true);

        send('progress', { step: 2, total: 5, label: 'Planning speech strategy...', icon: 'brain' });

        const previousSpeeches = (speeches || []).map((s: { speech_type: string; parsed_content: unknown[] }) => ({
          speech_type: s.speech_type,
          parsed_content: s.parsed_content,
        }));

        const plan = await planSpeech(
          speech_type,
          round?.side || 'aff',
          previousSpeeches,
          flowEntries || [],
          (allCards || []).map((c: { id: string; tag: string; cite_author: string; evidence_html: string }) => ({
            id: c.id, tag: c.tag, cite_author: c.cite_author, evidence_html: c.evidence_html
          })),
          card_ids || [],
          round?.round_context || '',
          additional_instructions || ''
        );

        // Generate cards where needed
        const sections: Array<{ label: string; action: string; content: string; tag?: string; cite?: string; evidence_html?: string }> = [];
        const cardGenSections = plan.sections.filter(s => s.card_source === 'generate');
        const totalCards = cardGenSections.length;
        let cardsDone = 0;

        for (const section of plan.sections) {
          if (section.card_source === 'library' && section.card_id) {
            // Use existing card
            const card = (allCards || []).find((c: { id: string }) => c.id === section.card_id);
            if (card) {
              sections.push({
                label: section.label,
                action: 'card',
                content: '',
                tag: (card as { tag: string }).tag,
                cite: (card as { cite_author: string }).cite_author,
                evidence_html: (card as { evidence_html: string }).evidence_html,
              });
            }
          } else if (section.card_source === 'generate' && section.search_query) {
            cardsDone++;
            send('progress', {
              step: 3, total: 5,
              label: `Generating card ${cardsDone}/${totalCards}: ${section.label}...`,
              icon: 'sparkle',
            });

            try {
              const searchResults = await searchEvidence(section.search_query, round?.round_context || '', rapid);
              if (searchResults.sources.length > 0) {
                const selectedUrl = searchResults.sources[0].url;
                let fullText = await scrapeArticle(selectedUrl);
                if (fullText.length < 200) fullText = searchResults.answer;

                const cardGen = rapid ? generateCardFast : generateCard;
                const card = await cardGen(section.search_query, fullText, selectedUrl, searchResults.answer, round?.round_context || '');

                // Save generated card
                const cardId = uuid();
                const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;
                await supabase.from('cards').insert({
                  id: cardId, tag: card.tag, cite, cite_author: card.cite_author,
                  cite_year: card.cite_year, cite_credentials: card.cite_credentials,
                  cite_title: card.cite_title, cite_date: card.cite_date, cite_url: card.cite_url,
                  cite_access_date: new Date().toLocaleDateString(), cite_initials: card.cite_initials,
                  evidence_html: card.evidence_html, author_name: round?.user_name || 'AI',
                  is_shared: true,
                });

                sections.push({
                  label: section.label, action: 'card', content: '',
                  tag: card.tag, cite: card.cite_author, evidence_html: card.evidence_html,
                });
              }
            } catch (e) {
              console.error('Card gen error for section:', section.label, e);
              sections.push({ label: section.label, action: 'analytic', content: section.analytics || `[Card generation failed for: ${section.label}]` });
            }
          } else {
            sections.push({ label: section.label, action: 'analytic', content: section.analytics || '' });
          }
        }

        send('progress', { step: 4, total: 5, label: 'Assembling speech...', icon: 'doc' });

        const speechHtml = await assembleSpeech(
          speech_type, round?.side || 'aff', plan.strategy, sections, round?.round_context || ''
        );

        send('progress', { step: 5, total: 5, label: 'Saving speech...', icon: 'save' });

        // Determine speech order
        const speechOrderMap: Record<string, number> = {
          '1AC': 0, '1NC': 2, '2AC': 4, '2NC': 6, '1NR': 8, '1AR': 9, '2NR': 10, '2AR': 11
        };

        const { data: savedSpeech } = await supabase
          .from('speeches')
          .insert({
            id: uuid(),
            round_id: roundId,
            speech_type,
            speaker: 'user',
            raw_content: speechHtml,
            parsed_content: sections.map((s, i) => ({
              id: `gen-${i}`,
              type: s.action === 'card' ? 'card' : 'analytic',
              arg_type: 'generated',
              label: s.label,
              tag: s.tag || s.label,
              cite: s.cite || '',
              evidence_html: s.evidence_html || '',
              summary: s.content || s.label,
            })),
            generated_html: speechHtml,
            source_type: 'generated',
            speech_order: speechOrderMap[speech_type] ?? 0,
          })
          .select()
          .single();

        send('done', savedSpeech);
        controller.close();
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Speech generation failed' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
