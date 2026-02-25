#!/usr/bin/env node

/**
 * BankRegPulse MCP Server
 *
 * Model Context Protocol server for banking regulatory intelligence.
 * Provides real-time regulatory data to AI assistants like Claude.
 *
 * Supports both stdio (default) and HTTP/SSE transports.
 *
 * @see https://bankregpulse.com
 * @see https://modelcontextprotocol.io
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'http';
import { URL } from 'url';

const MCP_SERVER_NAME = 'bankregpulse';
const MCP_SERVER_VERSION = '1.0.3';

// Configuration from environment
const API_BASE_URL = process.env.BANKREGPULSE_API_URL || 'https://bankregpulse-enterprise-api.onrender.com';
const HTTP_PORT = parseInt(process.env.PORT || '3000', 10);
const USE_HTTP = process.env.MCP_TRANSPORT === 'http';

// Initialize MCP server
const server = new Server(
  {
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
const TOOLS: Tool[] = [
  {
    name: 'get_daily_briefing',
    description: 'Get the latest daily banking regulatory intelligence briefing with summaries and key developments from OCC, FDIC, CFPB, Federal Reserve, and all 50 state banking departments.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Optional: Specific date (YYYY-MM-DD). Defaults to today.',
        },
      },
    },
  },
  {
    name: 'get_daily_podcast',
    description: 'Get the latest daily regulatory podcast audio URL. Listen to an AI-generated summary of the day\'s regulatory developments.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Optional: Specific date (YYYY-MM-DD). Defaults to today.',
        },
      },
    },
  },
  {
    name: 'get_linkedin_post',
    description: 'Get a pre-formatted LinkedIn post about today\'s regulatory developments, ready to copy and share on social media.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Optional: Specific date (YYYY-MM-DD). Defaults to today.',
        },
      },
    },
  },
];

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const toolArgs = (args || {}) as Record<string, any>;

  try {
    switch (name) {
      case 'get_daily_briefing':
        return await getDailyBriefing(toolArgs.date as string | undefined);

      case 'get_daily_podcast':
        return await getDailyPodcast(toolArgs.date as string | undefined);

      case 'get_linkedin_post':
        return await getLinkedInPost(toolArgs.date as string | undefined);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

/**
 * Get latest daily briefing via API
 */
async function getDailyBriefing(date?: string) {
  const url = date
    ? `${API_BASE_URL}/api/mcp/briefing?date=${date}`
    : `${API_BASE_URL}/api/mcp/briefing`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (!data.success || !data.data) {
    return {
      content: [
        {
          type: 'text',
          text: 'No briefing found for the requested date.',
        },
      ],
    };
  }

  const briefing = data.data;
  const dateStr = new Date(briefing.sentAt).toLocaleDateString();

  return {
    content: [
      {
        type: 'text',
        text: `# ${briefing.subject}\n\n**Date:** ${dateStr}\n**Documents:** ${briefing.totalDocuments}\n**High Priority:** ${briefing.highPriorityCount}\n\n${briefing.aiSummary}\n\n---\n*Powered by BankRegPulse*`,
      },
    ],
  };
}

/**
 * Get latest podcast via API
 */
async function getDailyPodcast(date?: string) {
  const url = date
    ? `${API_BASE_URL}/api/mcp/podcast?date=${date}`
    : `${API_BASE_URL}/api/mcp/podcast`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (!data.success || !data.data) {
    return {
      content: [
        {
          type: 'text',
          text: 'No podcast found for the requested date.',
        },
      ],
    };
  }

  const podcast = data.data;
  const dateStr = new Date(podcast.sentAt).toLocaleDateString();
  const audioUrl = `${API_BASE_URL}/api/podcast/${podcast.id}/audio`;

  return {
    content: [
      {
        type: 'text',
        text: `# Daily Regulatory Podcast\n\n**Date:** ${dateStr}\n**Audio URL:** ${audioUrl}\n\nCopy the URL above to listen to today's regulatory briefing.\n\n---\n*Powered by BankRegPulse*`,
      },
    ],
  };
}

/**
 * Get LinkedIn-ready post via API
 */
async function getLinkedInPost(date?: string) {
  const url = date
    ? `${API_BASE_URL}/api/mcp/linkedin-post?date=${date}`
    : `${API_BASE_URL}/api/mcp/linkedin-post`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const data = await response.json() as any;

  if (!data.success || !data.data) {
    return {
      content: [
        {
          type: 'text',
          text: 'No briefing available to generate LinkedIn post.',
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: data.data.post,
      },
    ],
  };
}

// Start server
async function main() {
  if (USE_HTTP) {
    // HTTP/SSE mode
    const httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Health check endpoint
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: MCP_SERVER_NAME, version: MCP_SERVER_VERSION }));
        return;
      }

      // SSE endpoint
      if (url.pathname === '/sse') {
        const transport = new SSEServerTransport(url.pathname, res);
        await server.connect(transport);
        console.error('[BankRegPulse MCP] Client connected via SSE');
        return;
      }

      // 404 for other paths
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use /sse for MCP connection or /health for status.' }));
    });

    httpServer.listen(HTTP_PORT, () => {
      console.error(`[BankRegPulse MCP] HTTP server running on port ${HTTP_PORT}`);
      console.error(`[BankRegPulse MCP] SSE endpoint: http://localhost:${HTTP_PORT}/sse`);
      console.error(`[BankRegPulse MCP] Health check: http://localhost:${HTTP_PORT}/health`);
    });
  } else {
    // Stdio mode (default)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[BankRegPulse MCP] Server running on stdio');
  }
}

main().catch((error) => {
  console.error('[BankRegPulse MCP] Server failed to start:', error);
  process.exit(1);
});
