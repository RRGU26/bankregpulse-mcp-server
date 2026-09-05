#!/usr/bin/env node

/**
 * LexRegPulse / BankRegPulse MCP Server
 *
 * Model Context Protocol server for daily banking regulatory intelligence:
 * the morning brief, the weekly print digest, the archive, the deep-dive blog,
 * the regulatory deadline tracker, the daily podcast and the day's LinkedIn
 * post. Read-only over content LexRegPulse has already published.
 *
 * Transports: stdio (default), Streamable HTTP at /mcp (MCP_TRANSPORT=http),
 * plus the legacy SSE pair (/sse + /messages) for older clients.
 *
 * @see https://lexregpulse.com/llms.txt
 * @see https://modelcontextprotocol.io
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import http from 'http';
import { URL } from 'url';

const MCP_SERVER_NAME = 'bankregpulse';
const MCP_SERVER_VERSION = '1.2.0';

const API_BASE_URL = (process.env.BANKREGPULSE_API_URL || 'https://bankregpulse-enterprise-api.onrender.com').replace(/\/$/, '');
const SITE = 'https://lexregpulse.com';
const HTTP_PORT = parseInt(process.env.PORT || '3000', 10);
const USE_HTTP = process.env.MCP_TRANSPORT === 'http';

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const DATE_ARG = {
  type: 'string' as const,
  description: 'Optional edition date, YYYY-MM-DD. Defaults to the most recent edition.',
};

const TOOLS: Tool[] = [
  {
    name: 'get_daily_briefing',
    description:
      "LexRegPulse's daily banking regulatory brief, published every weekday and weekend morning at 6:45 AM ET. Sections: the lead story with its bank-side transmission, regulatory developments (OCC, FDIC, Federal Reserve, CFPB, FinCEN, OFAC, SEC, CFTC, NCUA and the states), industry signals (market and industry context: rates, deals, funding, fintech), political and legislative items, what's coming (comment windows, effective dates) and what it means. Every figure is traced to a source and every edition is QA-scored before it sends. Returns markdown with the canonical URL; each bullet is addressable on the web page as #b-1, #b-2, …",
    inputSchema: { type: 'object', properties: { date: DATE_ARG } },
  },
  {
    name: 'get_weekly_digest',
    description:
      "The LexRegPulse Weekly Print Digest (Sundays): the week's lead stories, regulatory developments, market and macro, industry watch and the week ahead, written as a long-form print edition. Returns markdown with the canonical URL.",
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'Optional Sunday date, YYYY-MM-DD. Defaults to the latest digest.' } } },
  },
  {
    name: 'list_briefings',
    description:
      'The archive index: recent daily briefs and weekly digests with their dates, titles and canonical URLs. Use it to find the edition that covered a date or a story, then call get_daily_briefing or get_weekly_digest with that date.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: 'How many editions to list, newest first (default 14, max 60).' } } },
  },
  {
    name: 'get_blog_posts',
    description:
      "LexRegPulse's deep-dive analysis pieces by Lex — long-form reads on a rule, an enforcement pattern or a supervisory shift, each ending on the decision it changes for a bank, fintech or firm. Returns the newest posts with title, date, one-line summary and canonical URL; use get_blog_post for the full text.",
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: 'How many posts to list, newest first (default 10, max 50).' } } },
  },
  {
    name: 'get_blog_post',
    description: 'Full text of one LexRegPulse deep-dive post as markdown, by slug (the last path segment of its URL, e.g. "occ-fdic-unsafe-unsound-rule-changed").',
    inputSchema: { type: 'object', properties: { slug: { type: 'string', description: 'Post slug from get_blog_posts or the URL.' } }, required: ['slug'] },
  },
  {
    name: 'get_upcoming_deadlines',
    description:
      "Upcoming regulatory deadlines from LexRegPulse's deterministic tracker — comment windows closing and rules taking effect — pulled from the Federal Register's structured fields, not from prose. Returns date, kind, title and agency.",
    inputSchema: { type: 'object', properties: { days: { type: 'integer', description: 'Window in days from today (default 21, max 90).' } } },
  },
  {
    name: 'get_daily_podcast',
    description: "Today's LexRegPulse Daily podcast: the four-minute audio edition of the morning brief. Returns the audio URL and the podcast RSS feed.",
    inputSchema: { type: 'object', properties: { date: DATE_ARG } },
  },
  {
    name: 'get_linkedin_post',
    description: "A LinkedIn-ready post drafted from the day's sent brief, ready to copy.",
    inputSchema: { type: 'object', properties: { date: DATE_ARG } },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });
const fail = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }], isError: true });

async function getJson<T = any>(url: string, accept = 'application/json'): Promise<T> {
  const r = await fetch(url, { headers: { Accept: accept, 'User-Agent': `bankregpulse-mcp-server/${MCP_SERVER_VERSION}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return (accept.startsWith('application/json') ? r.json() : r.text()) as Promise<T>;
}
const isoDay = (d: string | Date | null | undefined): string => (d ? new Date(d).toISOString().slice(0, 10) : '');
const briefUrl = (day: string, type: string) => `${SITE}/brief/${day}${type === 'weekly' ? '?type=weekly' : ''}`;
const clamp = (n: unknown, def: number, max: number) => Math.min(max, Math.max(1, parseInt(String(n ?? def), 10) || def));

async function getDailyBriefing(date?: string): Promise<ToolResult> {
  const data = await getJson<any>(`${API_BASE_URL}/api/mcp/briefing${date ? `?date=${encodeURIComponent(date)}` : ''}`);
  if (!data?.success || !data.data) return text(date ? `No daily brief was published on ${date}. Call list_briefings to see available editions.` : 'No daily brief is available right now.');
  const b = data.data;
  const day = isoDay(b.sentAt);
  const title = String(b.subject || 'LexRegPulse Daily Brief').replace(/^[^A-Za-z0-9]+\s*/, '');
  return text(`# ${title}\n\nLexRegPulse Daily Brief · published ${day} · canonical: ${briefUrl(day, 'daily')}\nCite as: LexRegPulse Daily Brief, ${day}. Each bullet is addressable on the web page as #b-1, #b-2, …\n\n${String(b.aiSummary || '').trim()}\n`);
}

async function getWeeklyDigest(date?: string): Promise<ToolResult> {
  let day = date;
  if (!day) {
    const idx = await getJson<any>(`${API_BASE_URL}/public/briefs`);
    const w = (idx?.briefs || []).find((x: any) => x.type === 'weekly');
    if (!w) return text('No weekly digest is available yet.');
    day = w.date;
  }
  const md = await getJson<string>(`${API_BASE_URL}/public/brief/${day}?type=weekly`, 'text/markdown');
  return text(md);
}

async function listBriefings(limit?: number): Promise<ToolResult> {
  const idx = await getJson<any>(`${API_BASE_URL}/public/briefs`);
  const rows = (idx?.briefs || []).slice(0, clamp(limit, 14, 60));
  if (!rows.length) return text('The archive index is empty.');
  const lines = rows.map((r: any) => `- ${r.date} · ${r.type === 'weekly' ? 'Weekly digest' : 'Daily brief'} · ${r.title} · ${SITE}${r.url}`);
  return text(`# LexRegPulse archive — ${rows.length} most recent editions\n\n${lines.join('\n')}\n\nFull archive: ${SITE}/archive · RSS: ${SITE}/brief/feed.xml · JSON Feed: ${SITE}/brief/feed.json\n`);
}

async function getBlogPosts(limit?: number): Promise<ToolResult> {
  const n = clamp(limit, 10, 50);
  const data = await getJson<any>(`${API_BASE_URL}/api/blog/posts?limit=${n}`);
  const posts: any[] = Array.isArray(data) ? data : (data?.posts || data?.data || []);
  if (!posts.length) return text('No published posts found.');
  const lines = posts.slice(0, n).map(p => `- ${isoDay(p.publishedAt)} · **${p.title}** — ${String(p.metaDescription || '').trim() || 'deep-dive analysis by Lex'} · ${SITE}/blog/${p.slug} (slug: ${p.slug})`);
  return text(`# LexRegPulse deep dives — ${Math.min(n, posts.length)} most recent\n\n${lines.join('\n')}\n\nBlog: ${SITE}/blog · RSS: ${SITE}/blog/feed.xml\n`);
}

async function getBlogPost(slug: string): Promise<ToolResult> {
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return fail('A post slug is required (letters, digits and hyphens), e.g. "occ-fdic-unsafe-unsound-rule-changed".');
  const r = await fetch(`${API_BASE_URL}/api/blog/posts/${encodeURIComponent(slug)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (r.status === 404) return text(`No published post with slug "${slug}". Call get_blog_posts for current slugs.`);
  if (!r.ok) throw new Error(`blog API → HTTP ${r.status}`);
  const p: any = await r.json();
  const day = isoDay(p.publishedAt);
  const canonical = `${SITE}/blog/${p.slug}`;
  return text(`# ${p.title}\n\nBy Lex, LexRegPulse${day ? ` · ${day}` : ''} · canonical: ${canonical}\nCite as: LexRegPulse, "${p.title}"${day ? ` (${day})` : ''}, ${canonical}\n\n${String(p.content || '').trim()}\n`);
}

async function getUpcomingDeadlines(days?: number): Promise<ToolResult> {
  const n = clamp(days, 21, 90);
  const data = await getJson<any>(`${API_BASE_URL}/public/deadlines?days=${n}`);
  const rows: any[] = data?.deadlines || [];
  if (!rows.length) return text(`No tracked deadlines in the next ${n} days.`);
  const label = (k: string) => (k === 'comment_close' ? 'comments close' : k === 'effective' ? 'takes effect' : k);
  const lines = rows.map(r => `- ${r.iso} (${r.days_left}d) · ${label(r.kind)} · ${r.title}${r.agency ? ` [${r.agency}]` : ''}${r.url ? ` · ${r.url}` : ''}`);
  return text(`# Regulatory deadlines, next ${n} days\n\nSource: Federal Register structured fields via LexRegPulse's deadline tracker (deterministic, no prose). Generated ${data.generatedAt}.\n\n${lines.join('\n')}\n`);
}

async function getDailyPodcast(date?: string): Promise<ToolResult> {
  const data = await getJson<any>(`${API_BASE_URL}/api/mcp/podcast${date ? `?date=${encodeURIComponent(date)}` : ''}`);
  if (!data?.success || !data.data) return text('No podcast episode is available for that date.');
  const p = data.data;
  const day = isoDay(p.sentAt);
  return text(`# LexRegPulse Daily — ${day}\n\nAudio: ${API_BASE_URL}/api/podcast/${p.id}/audio\nEpisode brief (text): ${briefUrl(day, 'daily')}\nPodcast RSS: ${SITE}/api/podcast/feed.xml · Weekly two-host edition: ${SITE}/api/podcast/weekly-feed.xml\n`);
}

async function getLinkedInPost(date?: string): Promise<ToolResult> {
  const data = await getJson<any>(`${API_BASE_URL}/api/mcp/linkedin-post${date ? `?date=${encodeURIComponent(date)}` : ''}`);
  if (!data?.success || !data.data?.post) return text('No brief is available to draft a LinkedIn post from.');
  return text(String(data.data.post));
}

// ---------------------------------------------------------------------------
// Server factory (one instance per stdio process or per stateless HTTP request)
// ---------------------------------------------------------------------------

function buildServer(): Server {
  const server = new Server({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args || {}) as Record<string, any>;
    try {
      switch (name) {
        case 'get_daily_briefing': return await getDailyBriefing(a.date);
        case 'get_weekly_digest': return await getWeeklyDigest(a.date);
        case 'list_briefings': return await listBriefings(a.limit);
        case 'get_blog_posts': return await getBlogPosts(a.limit);
        case 'get_blog_post': return await getBlogPost(String(a.slug || ''));
        case 'get_upcoming_deadlines': return await getUpcomingDeadlines(a.days);
        case 'get_daily_podcast': return await getDailyPodcast(a.date);
        case 'get_linkedin_post': return await getLinkedInPost(a.date);
        default: return fail(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return fail(`LexRegPulse is temporarily unavailable: ${error?.message || String(error)}. The same content is public at ${SITE}/brief/feed.json.`);
    }
  });
  return server;
}

function serverCard(origin: string) {
  return {
    serverInfo: {
      name: MCP_SERVER_NAME,
      title: 'LexRegPulse — daily banking regulatory intelligence',
      version: MCP_SERVER_VERSION,
      description: 'Daily brief, weekly digest, archive, deep-dive blog, deadline tracker, daily podcast and LinkedIn post from LexRegPulse. Read-only over published content.',
      websiteUrl: SITE,
      documentationUrl: `${SITE}/llms.txt`,
    },
    transport: { type: 'streamable-http', endpoint: `${origin}/mcp` },
    capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} },
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
  };
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

async function main() {
  if (!USE_HTTP) {
    const server = buildServer();
    await server.connect(new StdioServerTransport());
    console.error(`[LexRegPulse MCP ${MCP_SERVER_VERSION}] running on stdio`);
    return;
  }

  const sseSessions = new Map<string, SSEServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: MCP_SERVER_NAME, version: MCP_SERVER_VERSION, tools: TOOLS.length }));
        return;
      }
      if (url.pathname === '/.well-known/mcp/server-card.json' || url.pathname === '/') {
        const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' });
        res.end(JSON.stringify(serverCard(`${proto}://${req.headers.host}`), null, 2));
        return;
      }

      // Streamable HTTP — stateless: a fresh server + transport per request.
      if (url.pathname === '/mcp') {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        const server = buildServer();
        res.on('close', () => { transport.close().catch(() => undefined); server.close().catch(() => undefined); });
        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      // Legacy SSE pair for older clients.
      if (url.pathname === '/sse' && req.method === 'GET') {
        const transport = new SSEServerTransport('/messages', res);
        sseSessions.set(transport.sessionId, transport);
        res.on('close', () => sseSessions.delete(transport.sessionId));
        await buildServer().connect(transport);
        return;
      }
      if (url.pathname === '/messages' && req.method === 'POST') {
        const sid = url.searchParams.get('sessionId') || '';
        const transport = sseSessions.get(sid);
        if (!transport) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unknown SSE session' })); return; }
        await transport.handlePostMessage(req, res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. MCP endpoint: POST /mcp (Streamable HTTP). Legacy: GET /sse + POST /messages. Health: /health.' }));
    } catch (err: any) {
      console.error('[LexRegPulse MCP] request failed:', err?.message || err);
      if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Internal error' })); }
    }
  });

  httpServer.listen(HTTP_PORT, () => {
    console.error(`[LexRegPulse MCP ${MCP_SERVER_VERSION}] HTTP on :${HTTP_PORT} — /mcp (Streamable HTTP), /sse + /messages (legacy), /health`);
  });
}

main().catch((error) => {
  console.error('[LexRegPulse MCP] failed to start:', error);
  process.exit(1);
});
