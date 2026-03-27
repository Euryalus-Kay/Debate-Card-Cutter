// Fire-and-forget auto-sort for a newly created card
// Sorts into all existing sort profiles (default + custom)
export function autoSortCard(cardId: string, tag: string, citeAuthor: string, baseUrl?: string) {
  const url = baseUrl || process.env.NEXT_PUBLIC_SITE_URL || '';

  // Fire and forget — don't await, don't block card creation
  fetch(`${url}/api/folders/auto-sort`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_id: cardId,
      tag,
      cite_author: citeAuthor,
      profile: 'default',
    }),
  }).catch(() => {
    // Silently fail — auto-sort is best-effort
  });
}
