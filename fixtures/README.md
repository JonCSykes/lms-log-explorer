# Fixtures

This directory contains sample log files for testing the parser.

## Files

### simple-chat.log
Simple chat completion with streaming response. Contains:
- Request receipt line
- Multiple streaming packets with content deltas
- Usage data in final packet

### tool-calls.log
Tool call scenario with partial arguments across delta messages. Contains:
- Tool call request in assistant message
- Arguments split across multiple packets (e.g., `{"location":"NYC"` broken into chunks)
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

## Format Notes
All logs follow the LM Studio server log format:
- Timestamp prefix: `[YYYY-MM-DD HH:MM:SS]`
- Log level: `[INFO]`, `[WARN]`, etc.
- Message body containing JSON payloads
