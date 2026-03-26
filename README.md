# CardCutter - HS Policy Debate Card Generator

AI-powered evidence card cutting for high school policy debate. Uses Perplexity for research and Claude for formatting cards with proper citations and strategic highlighting.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase (free cloud database)
1. Go to [supabase.com](https://supabase.com) and create a free project
2. Go to **SQL Editor** and run the contents of `supabase-schema.sql`
3. Go to **Settings > API** and copy your Project URL and anon/public key

### 3. Get API keys
- **Anthropic**: Get a key at [console.anthropic.com](https://console.anthropic.com)
- **Perplexity**: Get a key at [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)

### 4. Configure `.env`
Edit `.env` and fill in your keys:
```
ANTHROPIC_API_KEY=sk-ant-...
PERPLEXITY_API_KEY=pplx-...
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 5. Run locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 6. Host with Cloudflare Tunnel (optional)
```bash
# Install cloudflared
brew install cloudflared

# Create a tunnel
cloudflared tunnel --url http://localhost:3000
```

## Features

- **Cut Card**: Describe an argument, AI finds evidence and creates a properly formatted debate card
- **Build Argument**: Describe a complete argument and AI generates multiple cards (claim, warrants, impacts, etc.)
- **Iterate**: Ask AI to adjust highlighting or tag without modifying evidence text
- **Copy to Google Docs**: One-click copy preserves bold/underline formatting
- **Edit Raw**: Manually adjust tag or evidence HTML
- **Shared Cards**: All generated cards visible to everyone on the platform
- **Persistent Context**: Save your debate context (topic, position) across sessions

## Card Format

Cards follow standard HS policy debate format:
- **Tag**: Bold claim summarizing the argument
- **Citation**: Author, year, credentials, title, date, URL
- **Evidence**: Full source text with highlighted (bold+underlined) key portions that form coherent sentences when read alone
