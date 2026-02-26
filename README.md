# BankRegPulse MCP Server

**Real-time banking regulatory intelligence for AI assistants**

[![npm version](https://badge.fury.io/js/bankregpulse-mcp-server.svg)](https://www.npmjs.com/package/bankregpulse-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)

Connect your AI assistant (Claude, ChatGPT, etc.) to live banking regulatory data from 100+ sources including OCC, FDIC, CFPB, Federal Reserve, and all 50 state banking departments.

<a href="https://glama.ai/mcp/servers/@RRGU26/bank-reg-pulse">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@RRGU26/bank-reg-pulse/badge" alt="BankRegPulse MCP server" />
</a>

## What is This?

BankRegPulse MCP Server is a [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants query our regulatory intelligence database in real-time.

Instead of manually searching for regulatory updates, just ask your AI:
- *"What's in today's banking regulatory briefing?"*
- *"Play today's regulatory podcast"*
- *"Draft a LinkedIn post about today's CFPB updates"*

Your AI will pull fresh data from BankRegPulse and answer with context.

---

## Features

### 🎯 Three Core Tools

| Tool | Description | Example Use |
|------|-------------|-------------|
| `get_daily_briefing` | Daily regulatory intelligence summary | "What did the OCC publish today?" |
| `get_daily_podcast` | Audio briefing URL | "Get today's regulatory podcast" |
| `get_linkedin_post` | Pre-formatted social content | "Draft a LinkedIn post about today's news" |

### 📊 Data Coverage

- **Federal Agencies:** OCC, FDIC, CFPB, Federal Reserve, Treasury
- **State Banking Departments:** All 50 states
- **Congress:** House Financial Services, Senate Banking
- **Federal Register:** Final rules, proposed rules, notices
- **News:** Reuters, American Banker, PYMNTS, Banking Dive
- **Update Frequency:** Real-time (monitored 24/7)

---

## Installation

### Prerequisites

- Node.js 18 or higher
- An MCP-compatible AI assistant (Claude Desktop, Continue.dev, etc.)

### Option 1: NPM (Recommended)

```bash
npx bankregpulse-mcp-server
```

### Option 2: From Source

```bash
git clone https://github.com/RRGU26/bankregpulse-mcp-server.git
cd bankregpulse-mcp-server
npm install
npm run build
```

---

## Setup for Claude Desktop

1. **Locate Claude Desktop config:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Add BankRegPulse MCP server:**

```json
{
  "mcpServers": {
    "bankregpulse": {
      "command": "npx",
      "args": ["bankregpulse-mcp-server"]
    }
  }
}
```

3. **Restart Claude Desktop**

4. **Test it:**
   - Open Claude Desktop
   - Ask: *"What's in today's banking regulatory briefing?"*
   - Claude will query the MCP server and return live data

---

## Setup for Other AI Assistants

### Continue.dev (VS Code)

Add to `~/.continue/config.json`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["bankregpulse-mcp-server"]
        }
      }
    ]
  }
}
```

### Custom Integration

Any MCP-compatible client can connect via stdio:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['bankregpulse-mcp-server']
});

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

### HTTP/SSE Mode

Run the MCP server as an HTTP endpoint instead of stdio:

```bash
# Set environment variable
export MCP_TRANSPORT=http
export PORT=3000  # optional, defaults to 3000

# Run server
npx bankregpulse-mcp-server
```

**Endpoints:**
- `GET /health` - Health check
- `GET /sse` - SSE endpoint for MCP connections

**Connect via HTTP:**

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(
  new URL('http://localhost:3000/sse')
);

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

**Test with curl:**

```bash
# Health check
curl http://localhost:3000/health

# SSE connection (requires MCP client)
curl -N http://localhost:3000/sse
```

---

## Usage Examples

### Daily Briefing

**Ask Claude:**
> "What's in today's banking regulatory briefing?"

**Claude queries:**
```
Tool: get_daily_briefing
Date: today
```

**You receive:**
- Executive summary of key developments
- Document count and high-priority items
- Agency-by-agency breakdown

---

### Podcast

**Ask Claude:**
> "Get me today's regulatory podcast"

**Claude queries:**
```
Tool: get_daily_podcast
Date: today
```

**You receive:**
- Audio URL for the daily briefing podcast
- Generated by AI from the day's regulatory developments

---

### LinkedIn Post

**Ask Claude:**
> "Draft a LinkedIn post about today's CFPB enforcement actions"

**Claude queries:**
```
Tool: get_linkedin_post
Date: today
```

**You receive:**
- Pre-formatted LinkedIn post with hashtags
- Key stats and highlights
- Ready to copy and share

---

## Advanced Usage

### Query Specific Dates

```
"What was in the regulatory briefing on February 20, 2024?"
```

Claude will pass `date: "2024-02-20"` to the tool.

### Custom API Endpoint

Set environment variable to use a different API:

```bash
export BANKREGPULSE_API_URL=https://your-custom-api.com
```

---

## Troubleshooting

### "No briefing found"

**Cause:** Briefing hasn't been generated yet (runs at 6 AM EST daily)

**Solution:** Query yesterday's briefing or wait until morning

### "API request failed"

**Cause:** Network issue or API is down

**Solution:**
1. Check https://bankregpulse-enterprise-api.onrender.com/health
2. Verify internet connection
3. Check Render status: https://status.render.com

### "Unknown tool"

**Cause:** MCP server not properly installed or outdated

**Solution:**
```bash
npm cache clean --force
npx bankregpulse-mcp-server@latest
```

---

## Development

### Local Development

```bash
# Clone repo
git clone https://github.com/RRGU26/bankregpulse-mcp-server.git
cd bankregpulse-mcp-server

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx bankregpulse-mcp-server
```

Opens a web UI to test tool calls.

---

## Architecture

```
┌─────────────────┐
│  AI Assistant   │ (Claude, ChatGPT, etc.)
│  (MCP Client)   │
└────────┬────────┘
         │ stdio
         │
┌────────▼────────┐
│  BankRegPulse   │
│   MCP Server    │ (this package)
└────────┬────────┘
         │ HTTPS
         │
┌────────▼────────┐
│  BankRegPulse   │
│      API        │ (bankregpulse-enterprise-api.onrender.com)
└────────┬────────┘
         │
┌────────▼────────┐
│   PostgreSQL    │
│   Database      │ (100+ regulatory sources)
└─────────────────┘
```

---

## API Endpoints (Backend)

The MCP server calls these public API endpoints:

- `GET /api/mcp/briefing?date=YYYY-MM-DD` - Daily briefing
- `GET /api/mcp/podcast?date=YYYY-MM-DD` - Podcast URL
- `GET /api/mcp/linkedin-post?date=YYYY-MM-DD` - LinkedIn post

No authentication required for basic usage.

---

## Pricing

**Free** for community use.

No API key required. Rate limits apply:
- 100 requests per hour per IP
- Fair use policy

For enterprise usage (higher limits, SLA), contact: admin@bankregpulse.com

---

## Support

- **Website:** https://bankregpulse.com
- **Documentation:** https://docs.bankregpulse.com
- **Issues:** https://github.com/RRGU26/bankregpulse-mcp-server/issues
- **Email:** admin@bankregpulse.com

---

## Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Submit a pull request

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Acknowledgments

- Built on [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- Powered by [BankRegPulse](https://bankregpulse.com) regulatory intelligence platform
- Regulatory data from OCC, FDIC, CFPB, Federal Reserve, and state banking departments

---

## Related Projects

- [BankRegPulse Web App](https://app.bankregpulse.com) - Full-featured regulatory intelligence platform
- [MCP Servers](https://github.com/modelcontextprotocol/servers) - Official MCP server examples
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) - Community-curated list

---

**Made with ❤️ for the banking compliance community**