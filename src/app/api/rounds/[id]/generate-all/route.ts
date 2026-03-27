import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { planSpeech, assembleSpeech, generateCard, generateCardFast } from '@/lib/anthropic';
import { searchEvidence } from '@/lib/perplexity';
import { scrapeArticle } from '@/lib/scraper';
import { v4 as uuid } from 'uuid';

export const maxDuration = 300;

const SPEECH_ORDER: Record<string, number> = {
  '1AC': 0, '1NC': 2, '2AC': 4, '2NC': 6, '1NR': 8, '1AR': 9, '2NR': 10, '2AR': 11,
};

// Generate a single card from search query
async function generateSingleCard(
  query: string,
  context: string,
  rapid: boolean,
  userName: string
): Promise<{ tag: string; cite: string; cite_author: string; evidence_html: string; cardId: string } | null> {
  try {
    const searchResults = await searchEvidence(query, context, rapid);
    if (!searchResults.sources.length) return null;

    const selectedUrl = searchResults.sources[0].url;
    let fullText = await scrapeArticle(selectedUrl);
    if (fullText.length < 200) fullText = searchResults.answer;

    const cardGen = rapid ? generateCardFast : generateCard;
    const card = await cardGen(query, fullText, selectedUrl, searchResults.answer, context);

    const cardId = uuid();
    const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;

    await supabase.from('cards').insert({
      id: cardId, tag: card.tag, cite, cite_author: card.cite_author,
      cite_year: card.cite_year, cite_credentials: card.cite_credentials,
      cite_title: card.cite_title, cite_date: card.cite_date, cite_url: card.cite_url,
      cite_access_date: new Date().toLocaleDateString(), cite_initials: card.cite_initials,
      evidence_html: card.evidence_html, author_name: userName,
      is_shared: true,
    });

    return { tag: card.tag, cite: card.cite_author, cite_author: card.cite_author, evidence_html: card.evidence_html, cardId };
  } catch (e) {
    console.error('Card gen error:', query, e);
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params;
  const body = await req.json();
  const { speeches_to_generate, rapid, additional_instructions } = body;
  // speeches_to_generate: string[] of speech types like ['2AC', '2NC', '1NR']

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch {}
      }, 5000);

      try {
        // Phase 1: Load all context
        send('progress', { phase: 'loading', label: 'Loading round context...', speeches: speeches_to_generate });

        const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).single();
        const { data: existingSpeeches } = await supabase
          .from('speeches').select('*').eq('round_id', roundId).order('speech_order', { ascending: true });
        const { data: flowEntries } = await supabase
          .from('flow_entries').select('*').eq('round_id', roundId);
        const { data: allCards } = await supabase
          .from('cards').select('id, tag, cite, cite_author, cite_year, evidence_html').eq('is_shared', true);

        const side = round?.side || 'aff';
        const context = round?.round_context || '';
        const userName = round?.user_name || 'AI';

        const previousSpeeches = (existingSpeeches || []).map((s: { speech_type: string; parsed_content: unknown[] }) => ({
          speech_type: s.speech_type,
          parsed_content: s.parsed_content,
        }));

        const cardLibrary = (allCards || []).map((c: { id: string; tag: string; cite_author: string; evidence_html: string }) => ({
          id: c.id, tag: c.tag, cite_author: c.cite_author, evidence_html: c.evidence_html,
        }));

        // Phase 2: Plan ALL speeches in parallel
        send('progress', { phase: 'planning', label: `Planning ${speeches_to_generate.length} speeches simultaneously...`, speeches: speeches_to_generate });

        const planPromises = speeches_to_generate.map((speechType: string) =>
          planSpeech(
            speechType, side, previousSpeeches, flowEntries || [],
            cardLibrary, [], context, additional_instructions || ''
          ).then(plan => ({ speechType, plan }))
           .catch(err => {
             console.error(`Plan error for ${speechType}:`, err);
             return { speechType, plan: null };
           })
        );

        const plans = await Promise.all(planPromises);

        send('progress', { phase: 'planned', label: 'All speeches planned', plans: plans.map(p => ({
          speechType: p.speechType,
          sectionCount: p.plan?.sections?.length || 0,
          strategy: p.plan?.strategy?.substring(0, 100) || '',
        }))});

        // Phase 3: Collect ALL card generation tasks across all speeches
        interface CardTask {
          speechType: string;
          sectionIndex: number;
          label: string;
          searchQuery: string;
        }

        const cardTasks: CardTask[] = [];
        const speechSectionData: Record<string, Array<{
          label: string;
          action: string;
          content: string;
          tag?: string;
          cite?: string;
          evidence_html?: string;
          cardTaskIndex?: number;
        }>> = {};

        for (const { speechType, plan } of plans) {
          if (!plan) continue;
          speechSectionData[speechType] = [];

          for (let si = 0; si < plan.sections.length; si++) {
            const section = plan.sections[si];

            if (section.card_source === 'library' && section.card_id) {
              const card = (allCards || []).find((c: { id: string }) => c.id === section.card_id);
              if (card) {
                speechSectionData[speechType].push({
                  label: section.label, action: 'card', content: '',
                  tag: (card as { tag: string }).tag,
                  cite: (card as { cite_author: string }).cite_author,
                  evidence_html: (card as { evidence_html: string }).evidence_html,
                });
              }
            } else if (section.card_source === 'generate' && section.search_query) {
              const taskIndex = cardTasks.length;
              cardTasks.push({
                speechType,
                sectionIndex: si,
                label: section.label,
                searchQuery: section.search_query,
              });
              speechSectionData[speechType].push({
                label: section.label, action: 'card', content: '',
                cardTaskIndex: taskIndex,
              });
            } else {
              speechSectionData[speechType].push({
                label: section.label, action: 'analytic', content: section.analytics || '',
              });
            }
          }
        }

        send('progress', {
          phase: 'generating_cards',
          label: `Generating ${cardTasks.length} cards in parallel across ${speeches_to_generate.length} speeches...`,
          totalCards: cardTasks.length,
        });

        // Phase 4: Generate ALL cards in parallel (batched in groups of 5 to avoid rate limits)
        const BATCH_SIZE = 5;
        const cardResults: (Awaited<ReturnType<typeof generateSingleCard>>)[] = new Array(cardTasks.length).fill(null);
        let cardsCompleted = 0;

        for (let batch = 0; batch < cardTasks.length; batch += BATCH_SIZE) {
          const batchTasks = cardTasks.slice(batch, batch + BATCH_SIZE);
          const batchPromises = batchTasks.map((task, i) =>
            generateSingleCard(task.searchQuery, context, rapid || false, userName)
              .then(result => {
                const globalIndex = batch + i;
                cardResults[globalIndex] = result;
                cardsCompleted++;
                send('card_done', {
                  index: globalIndex,
                  total: cardTasks.length,
                  completed: cardsCompleted,
                  speechType: task.speechType,
                  label: task.label,
                  tag: result?.tag || null,
                });
              })
          );
          await Promise.all(batchPromises);
        }

        send('progress', {
          phase: 'assembling',
          label: `Assembling ${speeches_to_generate.length} speeches simultaneously...`,
        });

        // Phase 5: Fill in card results and assemble ALL speeches in parallel
        for (const task of cardTasks) {
          const result = cardResults[cardTasks.indexOf(task)];
          const sections = speechSectionData[task.speechType];
          const section = sections.find(s => s.cardTaskIndex === cardTasks.indexOf(task));
          if (section && result) {
            section.tag = result.tag;
            section.cite = result.cite_author;
            section.evidence_html = result.evidence_html;
          } else if (section) {
            section.action = 'analytic';
            section.content = `[Card generation failed for: ${task.label}]`;
          }
        }

        const assemblePromises = plans.map(async ({ speechType, plan }) => {
          if (!plan) return null;
          const sections = speechSectionData[speechType] || [];

          try {
            const speechHtml = await assembleSpeech(
              speechType, side, plan.strategy, sections, context
            );

            const { data: savedSpeech } = await supabase
              .from('speeches')
              .insert({
                id: uuid(),
                round_id: roundId,
                speech_type: speechType,
                speaker: 'user',
                raw_content: speechHtml,
                parsed_content: sections.map((s, i) => ({
                  id: `gen-${i}`, type: s.action === 'card' ? 'card' : 'analytic',
                  arg_type: 'generated', label: s.label, tag: s.tag || s.label,
                  cite: s.cite || '', evidence_html: s.evidence_html || '',
                  summary: s.content || s.label,
                })),
                generated_html: speechHtml,
                source_type: 'generated',
                speech_order: SPEECH_ORDER[speechType] ?? 0,
              })
              .select()
              .single();

            send('speech_done', { speechType, id: savedSpeech?.id });
            return savedSpeech;
          } catch (err) {
            console.error(`Assembly error for ${speechType}:`, err);
            send('speech_error', { speechType, error: err instanceof Error ? err.message : 'Assembly failed' });
            return null;
          }
        });

        const assembled = await Promise.all(assemblePromises);
        const successCount = assembled.filter(Boolean).length;

        send('done', {
          total_speeches: speeches_to_generate.length,
          successful: successCount,
          total_cards_generated: cardsCompleted,
        });

        clearInterval(keepalive);
        controller.close();
      } catch (error) {
        clearInterval(keepalive);
        send('error', { message: error instanceof Error ? error.message : 'Generation failed' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
