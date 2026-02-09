# Fixture Logs

This directory contains sample log files for testing the parser and indexer.

## Directory Structure

Fixture logs should be placed in year-month subdirectories (e.g., `2024-01/`) to match the expected LM Studio log structure:

```
fixtures/
├── 2024-01/
│   ├── simple-chat.log
│   ├── tool-calls.log
│   └── ...
└── README.md
```

## Fixture Files

### simple-chat.log

Simple chat completion with streaming response. Contains:

- Request receipt line
- Multiple streaming packets with content deltas
- Usage data in final packet

### tool-calls.log

Tool call scenario with partial arguments across delta messages. Contains:

- Tool call request in assistant message
- Arguments split across multiple packets
- Final completion with tool call finish reason

### prompt-progress.log

Prompt processing scenario. Contains:

- Prompt progress lines (0%, 50%, 100%)
- Delay between prompt processing and first streaming packet
- Can be used to calculate prompt processing time

### multiple-sessions.log

Multiple interleaved chat sessions. Contains:

- Two separate chat sessions (chatcmpl-aaa1, chatcmpl-bbb2)
- Packets from different sessions interleaved
- Tests session correlation logic

### malformed-json.log

Edge case with malformed JSON in log stream. Contains:

- Valid JSON before malformed section
- Malformed/broken JSON line (intentionally invalid)
- Valid JSON after malformed section

## Testing

To test the parser with fixtures, set the environment variable:

```bash
LMS_LOG_ROOT=./fixtures pnpm dev
```

Then visit http://localhost:3000 to see the sessions from the fixture files.

## Endpoints

- `GET /api/sessions` - List all sessions from logs
- `GET /api/sessions/chatId?chatId=...` - Get full session details
