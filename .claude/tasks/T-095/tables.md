# T-095 measured tables
Made by analyse.py; open it for the numbers behind report.md. Regenerate: python3 -I analyse.py

Columns: call time = sum of (result time - call time) per call; blocking wall = the share of wall clock in which this call was what the session waited on (parallel calls split it); result tok = tokens the result added to the context (chars/4, images 1600); re-read in context = result tokens x the API calls that carried them until the next compaction; output tok = output of the message that made the call, split over its calls.

## church-hub

- transcripts: 154 (14 main sessions, 140 subagents)
- API calls: 13522; output tokens 8.0M (432k in calls with no tool, i.e. replies); input: fresh 28k, cache write 34.5M, cache read 2.70B; peak context 705k
- thinking time reported: 6.1 h; turn time reported: 40.5 h

- input-equivalent tokens, weighted by list-price ratios (fresh 1, cache write 2, cache read 0.1, output 5): fresh 28k, cache write 68.9M, cache read 269.9M, output 40.0M

### Headline

- active agent time (model + tools, main and subagents): 67.5 h, of it waiting on the model 49.3%
- API calls with exactly one tool call: 74.1%; with two or more: 20.4%
- API calls over 300k context: 19.1% of calls, 39.9% of cache reads
- cache reads are 71.2% of weighted tokens
- fixed prompt (first-call context x calls): 22.0% of cache reads; subagent start-up writes: 5.7M (16.6% of cache writes)
- tool results re-read: 21.9% of cache reads; file reads and searches (sed -n, Read, grep, cat, rg, head, tail): 65.0% of that
- blocking tool time 34.2 h: build/test/check 5.0 h (14.5%), behind a lock wrapper 0.0 h, wait/sleep 11.4 h (33.2%)
- build/test/check runs: 1013, failed 221 (21.8%), failed but exit 0 behind a pipe 181; fixes needing 3+ failed runs: 14, 5+: 0

### Main sessions and subagents

| | transcripts | API calls | output | cache write | cache read | model wait | tool time |
|---|---:|---:|---:|---:|---:|---:|---:|
| main | 14 | 1659 | 745k | 3.1M | 306.6M | 12.9 h | 1.0 h |
| subagent | 140 | 11863 | 7.3M | 31.3M | 2.39B | 20.4 h | 33.3 h |

### Wall clock of main sessions (where the lead and the user wait)

| where | time | share of span |
|---|---:|---:|
| waiting on user (questions) | 23.5 h | 39.9% |
| waiting on background or teammates | 17.7 h | 30.0% |
| model | 12.9 h | 21.8% |
| waiting on user | 4.0 h | 6.7% |
| tools | 1.0 h | 1.6% |
| other | 0.0 h | 0.0% |
| compacting | 0.0 h | 0.0% |
| (span, first to last event) | 59.1 h | |

### Wall clock of subagents and teammates

| where | time | share of span |
|---|---:|---:|
| waiting on background or teammates | 44.3 h | 45.2% |
| tools | 33.3 h | 34.0% |
| model | 20.4 h | 20.8% |
| other | 0.0 h | 0.0% |
| (span, first to last event) | 98.0 h | |

### By tool (MCP servers grouped)

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Bash | 10974 | 654 | 34.4 h | 58.9% | 33.9 h | 11 s | 3.8M | 69.6% | 411.4M | 69.5% | 4.9M | 65.4% |
| AskUserQuestion | 179 | 3 | 23.5 h | 40.3% | 23.5 h | 474 s | 37k | 0.7% | 3.9M | 0.7% | 136k | 1.8% |
| Read | 893 | 8 | 0.2 h | 0.3% | 0.1 h | 1 s | 1.3M | 23.8% | 143.6M | 24.3% | 179k | 2.4% |
| Write | 1440 | 9 | 0.1 h | 0.1% | 0.1 h | 0 s | 84k | 1.5% | 11.6M | 2.0% | 1.3M | 17.7% |
| mcp:playwright | 29 | 6 | 0.1 h | 0.1% | 0.1 h | 7 s | 11k | 0.2% | 1.6M | 0.3% | 19k | 0.3% |
| mcp:better-tasks | 891 | 0 | 0.0 h | 0.1% | 0.0 h | 0 s | 59k | 1.1% | 5.6M | 1.0% | 287k | 3.8% |
| Agent | 144 | 0 | 0.0 h | 0.1% | 0.0 h | 1 s | 38k | 0.7% | 5.1M | 0.9% | 85k | 1.1% |
| Edit | 649 | 14 | 0.0 h | 0.0% | 0.0 h | 0 s | 31k | 0.6% | 2.9M | 0.5% | 248k | 3.3% |
| WebFetch | 20 | 0 | 0.0 h | 0.0% | 0.0 h | 4 s | 23k | 0.4% | 71k | 0.0% | 4k | 0.1% |
| mcp:claude-in-chrome | 2 | 2 | 0.0 h | 0.0% | 0.0 h | 33 s | 122 | 0.0% | 5k | 0.0% | 144 | 0.0% |
| SendMessage | 596 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 19k | 0.3% | 2.0M | 0.3% | 215k | 2.9% |
| mcp:context7 | 24 | 0 | 0.0 h | 0.0% | 0.0 h | 2 s | 17k | 0.3% | 1.7M | 0.3% | 5k | 0.1% |
| WebSearch | 8 | 0 | 0.0 h | 0.0% | 0.0 h | 5 s | 5k | 0.1% | 178k | 0.0% | 837 | 0.0% |
| Skill | 106 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 879 | 0.0% | 93k | 0.0% | 19k | 0.2% |
| TaskStop | 70 | 22 | 0.0 h | 0.0% | 0.0 h | 0 s | 10k | 0.2% | 846k | 0.1% | 12k | 0.2% |
| ToolSearch | 159 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 6k | 0.1% | 688k | 0.1% | 40k | 0.5% |
| mcp:github | 6 | 0 | 0.0 h | 0.0% | 0.0 h | 1 s | 16k | 0.3% | 401k | 0.1% | 3k | 0.0% |
| SendUserFile | 5 | 0 | 0.0 h | 0.0% | 0.0 h | 1 s | 185 | 0.0% | 17k | 0.0% | 980 | 0.0% |
| Monitor | 26 | 5 | 0.0 h | 0.0% | 0.0 h | 0 s | 3k | 0.1% | 203k | 0.0% | 9k | 0.1% |
| mcp:idea | 11 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 22 | 0.0% | 6k | 0.0% | 1k | 0.0% |
| EnterWorktree | 5 | 3 | 0.0 h | 0.0% | 0.0 h | 0 s | 361 | 0.0% | 36k | 0.0% | 419 | 0.0% |
| ListAgents | 2 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 686 | 0.0% | 103k | 0.0% | 596 | 0.0% |

### By kind of work (Bash split by what the command does)

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| asking the user | 179 | 3 | 23.5 h | 40.3% | 23.5 h | 474 s | 37k | 0.7% | 3.9M | 0.7% | 136k | 1.8% |
| wait | 337 | 48 | 11.4 h | 19.4% | 11.4 h | 121 s | 38k | 0.7% | 3.4M | 0.6% | 134k | 1.8% |
| run | 1509 | 103 | 6.1 h | 10.4% | 6.1 h | 14 s | 287k | 5.3% | 38.5M | 6.5% | 952k | 12.7% |
| build | 468 | 32 | 4.2 h | 7.3% | 4.1 h | 33 s | 72k | 1.3% | 6.4M | 1.1% | 218k | 2.9% |
| gh | 799 | 44 | 3.6 h | 6.2% | 3.6 h | 16 s | 113k | 2.1% | 10.4M | 1.8% | 327k | 4.4% |
| read/search | 4387 | 126 | 3.5 h | 6.1% | 3.5 h | 3 s | 2.4M | 44.9% | 277.2M | 46.8% | 1.8M | 23.6% |
| video | 472 | 37 | 3.2 h | 5.4% | 3.1 h | 24 s | 53k | 1.0% | 4.8M | 0.8% | 208k | 2.8% |
| git | 1719 | 147 | 0.7 h | 1.3% | 0.7 h | 2 s | 509k | 9.4% | 42.4M | 7.2% | 691k | 9.2% |
| test | 295 | 12 | 0.5 h | 0.9% | 0.5 h | 6 s | 100k | 1.9% | 10.1M | 1.7% | 153k | 2.0% |
| check | 307 | 28 | 0.4 h | 0.7% | 0.4 h | 5 s | 52k | 1.0% | 6.9M | 1.2% | 133k | 1.8% |
| edit (shell) | 305 | 44 | 0.4 h | 0.7% | 0.4 h | 5 s | 61k | 1.1% | 5.0M | 0.9% | 171k | 2.3% |
| Read | 893 | 8 | 0.2 h | 0.3% | 0.1 h | 1 s | 1.3M | 23.8% | 143.6M | 24.3% | 179k | 2.4% |
| process | 108 | 14 | 0.2 h | 0.3% | 0.2 h | 6 s | 21k | 0.4% | 2.9M | 0.5% | 41k | 0.5% |
| network | 115 | 8 | 0.1 h | 0.2% | 0.1 h | 3 s | 16k | 0.3% | 2.0M | 0.3% | 56k | 0.7% |
| Write | 1440 | 9 | 0.1 h | 0.1% | 0.1 h | 0 s | 84k | 1.5% | 11.6M | 2.0% | 1.3M | 17.7% |
| mcp:playwright | 29 | 6 | 0.1 h | 0.1% | 0.1 h | 7 s | 11k | 0.2% | 1.6M | 0.3% | 19k | 0.3% |
| mcp:better-tasks | 891 | 0 | 0.0 h | 0.1% | 0.0 h | 0 s | 59k | 1.1% | 5.6M | 1.0% | 287k | 3.8% |
| package | 50 | 4 | 0.0 h | 0.1% | 0.0 h | 2 s | 8k | 0.2% | 747k | 0.1% | 19k | 0.3% |
| agent | 144 | 0 | 0.0 h | 0.1% | 0.0 h | 1 s | 38k | 0.7% | 5.1M | 0.9% | 85k | 1.1% |
| Edit | 649 | 14 | 0.0 h | 0.0% | 0.0 h | 0 s | 31k | 0.6% | 2.9M | 0.5% | 248k | 3.3% |
| WebFetch | 20 | 0 | 0.0 h | 0.0% | 0.0 h | 4 s | 23k | 0.4% | 71k | 0.0% | 4k | 0.1% |
| mcp:claude-in-chrome | 2 | 2 | 0.0 h | 0.0% | 0.0 h | 33 s | 122 | 0.0% | 5k | 0.0% | 144 | 0.0% |
| SendMessage | 596 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 19k | 0.3% | 2.0M | 0.3% | 215k | 2.9% |
| other | 103 | 7 | 0.0 h | 0.0% | 0.0 h | 1 s | 7k | 0.1% | 650k | 0.1% | 37k | 0.5% |
| mcp:context7 | 24 | 0 | 0.0 h | 0.0% | 0.0 h | 2 s | 17k | 0.3% | 1.7M | 0.3% | 5k | 0.1% |
| WebSearch | 8 | 0 | 0.0 h | 0.0% | 0.0 h | 5 s | 5k | 0.1% | 178k | 0.0% | 837 | 0.0% |
| skill | 106 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 879 | 0.0% | 93k | 0.0% | 19k | 0.2% |
| TaskStop | 70 | 22 | 0.0 h | 0.0% | 0.0 h | 0 s | 10k | 0.2% | 846k | 0.1% | 12k | 0.2% |
| ToolSearch | 159 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 6k | 0.1% | 688k | 0.1% | 40k | 0.5% |
| mcp:github | 6 | 0 | 0.0 h | 0.0% | 0.0 h | 1 s | 16k | 0.3% | 401k | 0.1% | 3k | 0.0% |

### Bash commands, general form

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sleep | 290 | 41 | 11.4 h | 33.0% | 11.4 h | 141 s | 34k | 0.9% | 3.1M | 0.7% | 117k | 2.4% |
| gh run | 125 | 5 | 2.6 h | 7.6% | 2.6 h | 76 s | 23k | 0.6% | 1.4M | 0.3% | 31k | 0.6% |
| script record-features.sh | 145 | 9 | 2.3 h | 6.8% | 2.3 h | 58 s | 23k | 0.6% | 1.9M | 0.5% | 84k | 1.7% |
| grep | 1806 | 28 | 2.2 h | 6.5% | 2.2 h | 4 s | 608k | 16.1% | 64.5M | 15.7% | 776k | 15.8% |
| bun run build | 277 | 21 | 2.1 h | 6.2% | 2.1 h | 28 s | 51k | 1.3% | 4.7M | 1.2% | 146k | 3.0% |
| perl -c/-e one-liner | 32 | 0 | 2.0 h | 5.8% | 2.0 h | 225 s | 3k | 0.1% | 318k | 0.1% | 13k | 0.3% |
| script pr-build-links.sh | 32 | 3 | 1.1 h | 3.1% | 1.1 h | 120 s | 5k | 0.1% | 541k | 0.1% | 10k | 0.2% |
| tail | 256 | 3 | 1.0 h | 3.0% | 1.0 h | 15 s | 67k | 1.8% | 8.2M | 2.0% | 84k | 1.7% |
| bun file review-build.ts | 84 | 2 | 0.9 h | 2.7% | 0.8 h | 39 s | 8k | 0.2% | 601k | 0.1% | 26k | 0.5% |
| gh pr | 397 | 16 | 0.9 h | 2.5% | 0.9 h | 8 s | 51k | 1.4% | 4.7M | 1.1% | 177k | 3.6% |
| python3 inline script | 577 | 49 | 0.6 h | 1.7% | 0.6 h | 4 s | 82k | 2.2% | 10.5M | 2.6% | 505k | 10.3% |
| script demo-video.sh | 128 | 12 | 0.5 h | 1.5% | 0.5 h | 14 s | 16k | 0.4% | 1.8M | 0.4% | 60k | 1.2% |
| npx playwright | 14 | 1 | 0.4 h | 1.1% | 0.4 h | 95 s | 6k | 0.2% | 423k | 0.1% | 6k | 0.1% |
| sed | 70 | 3 | 0.2 h | 0.7% | 0.2 h | 13 s | 34k | 0.9% | 1.9M | 0.5% | 32k | 0.6% |
| script wait-ci.sh | 2 | 0 | 0.2 h | 0.7% | 0.2 h | 423 s | 42 | 0.0% | 756 | 0.0% | 575 | 0.0% |
| script race.sh | 4 | 1 | 0.2 h | 0.6% | 0.2 h | 171 s | 586 | 0.0% | 85k | 0.0% | 2k | 0.0% |
| bun test | 69 | 4 | 0.2 h | 0.5% | 0.2 h | 10 s | 7k | 0.2% | 881k | 0.2% | 40k | 0.8% |
| git push | 87 | 3 | 0.2 h | 0.5% | 0.2 h | 7 s | 8k | 0.2% | 470k | 0.1% | 30k | 0.6% |
| script measure.sh | 9 | 1 | 0.2 h | 0.5% | 0.2 h | 68 s | 2k | 0.1% | 209k | 0.1% | 8k | 0.2% |
| ls | 449 | 29 | 0.2 h | 0.5% | 0.2 h | 1 s | 180k | 4.8% | 20.9M | 5.1% | 210k | 4.3% |
| script wait-results.sh | 11 | 0 | 0.2 h | 0.5% | 0.2 h | 51 s | 784 | 0.0% | 85k | 0.0% | 2k | 0.0% |
| sed -i (edit) | 178 | 11 | 0.2 h | 0.4% | 0.2 h | 3 s | 23k | 0.6% | 2.7M | 0.7% | 76k | 1.5% |
| bun file measure.ts | 4 | 0 | 0.1 h | 0.4% | 0.1 h | 130 s | 370 | 0.0% | 58k | 0.0% | 2k | 0.0% |
| lsof | 60 | 8 | 0.1 h | 0.4% | 0.1 h | 8 s | 12k | 0.3% | 2.0M | 0.5% | 22k | 0.4% |
| bun file bench.ts | 11 | 0 | 0.1 h | 0.4% | 0.1 h | 44 s | 2k | 0.0% | 329k | 0.1% | 5k | 0.1% |
| git status | 225 | 25 | 0.1 h | 0.4% | 0.1 h | 2 s | 72k | 1.9% | 9.2M | 2.2% | 68k | 1.4% |
| script wait-next.sh | 6 | 0 | 0.1 h | 0.3% | 0.1 h | 68 s | 30 | 0.0% | 6k | 0.0% | 1k | 0.0% |
| bun file worktree-setup.ts | 42 | 0 | 0.1 h | 0.3% | 0.1 h | 10 s | 28k | 0.7% | 5.8M | 1.4% | 14k | 0.3% |
| bun file video-screens.ts | 3 | 0 | 0.1 h | 0.3% | 0.1 h | 135 s | 269 | 0.0% | 52k | 0.0% | 3k | 0.1% |
| script record.sh | 3 | 0 | 0.1 h | 0.3% | 0.1 h | 131 s | 849 | 0.0% | 37k | 0.0% | 839 | 0.0% |
| bunx | 51 | 2 | 0.1 h | 0.3% | 0.1 h | 7 s | 7k | 0.2% | 807k | 0.2% | 25k | 0.5% |
| script race2.sh | 3 | 0 | 0.1 h | 0.3% | 0.1 h | 124 s | 522 | 0.0% | 70k | 0.0% | 2k | 0.0% |
| git add | 295 | 14 | 0.1 h | 0.3% | 0.1 h | 1 s | 34k | 0.9% | 4.0M | 1.0% | 117k | 2.4% |
| script ci-dryrun.sh | 4 | 0 | 0.1 h | 0.3% | 0.1 h | 80 s | 237 | 0.0% | 15k | 0.0% | 2k | 0.0% |
| bun run lint | 58 | 2 | 0.1 h | 0.2% | 0.1 h | 5 s | 9k | 0.2% | 673k | 0.2% | 14k | 0.3% |
| which | 19 | 3 | 0.1 h | 0.2% | 0.1 h | 15 s | 5k | 0.1% | 415k | 0.1% | 18k | 0.4% |
| python3 file task_pr.py | 36 | 0 | 0.1 h | 0.2% | 0.1 h | 8 s | 3k | 0.1% | 515k | 0.1% | 16k | 0.3% |
| curl | 110 | 8 | 0.1 h | 0.2% | 0.1 h | 3 s | 16k | 0.4% | 1.9M | 0.5% | 55k | 1.1% |
| script open-pr.sh | 29 | 1 | 0.1 h | 0.2% | 0.1 h | 9 s | 8k | 0.2% | 1.3M | 0.3% | 7k | 0.1% |
| git checkout | 105 | 3 | 0.1 h | 0.2% | 0.1 h | 3 s | 14k | 0.4% | 2.4M | 0.6% | 43k | 0.9% |

### What fills the context (by tokens re-read)

| name | calls | result tok | avg per call | re-read in context | share |
|---|---:|---:|---:|---:|---:|
| Read | 893 | 1.3M | 1k | 143.6M | 24.3% |
| sed -n (read) | 1128 | 885k | 784 | 96.2M | 16.2% |
| cat | 451 | 495k | 1k | 66.9M | 11.3% |
| grep | 1806 | 608k | 336 | 64.5M | 10.9% |
| ls | 449 | 180k | 400 | 20.9M | 3.5% |
| Write | 1440 | 84k | 58 | 11.6M | 2.0% |
| python3 inline script | 577 | 82k | 142 | 10.5M | 1.8% |
| git status | 225 | 72k | 317 | 9.2M | 1.6% |
| echo | 60 | 66k | 1k | 8.8M | 1.5% |
| git log | 209 | 122k | 584 | 8.2M | 1.4% |
| tail | 256 | 67k | 263 | 8.2M | 1.4% |
| wc | 49 | 42k | 867 | 6.7M | 1.1% |
| bun file worktree-setup.ts | 42 | 28k | 669 | 5.8M | 1.0% |
| python3 -c/-e one-liner | 100 | 37k | 373 | 5.7M | 1.0% |
| git diff | 190 | 90k | 471 | 5.3M | 0.9% |

Tool calls per API call (3 = 3 or more): 0: 740, 1: 10018, 2: 2078, 3: 686

### Context size per API call

| context | calls | share | cache-read tokens | share | avg wait per call |
|---|---:|---:|---:|---:|---:|
| <50k | 593 | 4.4% | 19.8M | 0.7% | 64.9 s |
| 50-100k | 2717 | 20.1% | 195.9M | 7.3% | 5.7 s |
| 100-150k | 2477 | 18.3% | 305.3M | 11.3% | 6.4 s |
| 150-200k | 2138 | 15.8% | 366.8M | 13.6% | 6.1 s |
| 200-300k | 3021 | 22.3% | 734.5M | 27.2% | 6.1 s |
| 300-500k | 2014 | 14.9% | 751.8M | 27.9% | 7.3 s |
| 500k+ | 562 | 4.2% | 324.8M | 12.0% | 6.7 s |

Context at the first API call (system prompt, tools, rules), median: main 55k, subagent 39k

Wait on the model per API call: <10 s 11695, 10-60 s 1808, 1-5 min 17, 5-30 min 1, 30 min-2 h 0, >2 h 1

### Compactions

- 1 compactions (0 auto, 1 manual); median context before: 427k; time spent compacting: 0.0 h

### Errors by kind

| kind | count |
|---|---:|
| shell non-zero exit: git | 145 |
| shell non-zero exit: read/search | 116 |
| shell non-zero exit: run | 102 |
| shell non-zero exit: gh | 44 |
| shell non-zero exit: wait | 44 |
| shell non-zero exit: edit (shell) | 43 |
| shell non-zero exit: video | 35 |
| shell non-zero exit: build | 31 |
| shell non-zero exit: check | 27 |
| file or path missing | 25 |
| other error: TaskStop | 22 |
| shell non-zero exit: process | 13 |
| shell non-zero exit: test | 12 |
| other error: Edit | 12 |
| denied by user or permission | 8 |
| shell non-zero exit: network | 8 |
| shell non-zero exit: other | 7 |
| other error: Write | 6 |
| other error: mcp:playwright | 4 |
| edit: file changed since read | 3 |
| other error: Monitor | 3 |
| timed out | 3 |
| other error: EnterWorktree | 3 |
| shell non-zero exit: package | 3 |
| input validation | 2 |

### Mistakes, repeats and waits

| measure | value |
|---|---:|
| Bash calls stopped at the 10-min cap | 37 |
| api errors | 2 |
| build runs | 418 |
| check runs | 303 |
| edit undoing an earlier edit | 1 |
| failed build runs before a green one | 115 |
| failed build runs hidden by a pipe (exit 0) | 96 |
| failed check runs before a green one | 61 |
| failed check runs hidden by a pipe (exit 0) | 44 |
| failed test runs before a green one | 45 |
| failed test runs hidden by a pipe (exit 0) | 41 |
| file edits | 2066 |
| files edited 5+ times in one session | 42 |
| git undo: checkout | 65 |
| git undo: reset | 4 |
| git undo: restore | 3 |
| git undo: revert | 4 |
| git undo: stash | 11 |
| human prompts | 100 |
| human prompts that read as a correction | 5 |
| re-read tokens | 139k |
| re-read, file unchanged | 87 |
| repeated failing signatures | 1 |
| same call failed again | 1 |
| shell sleep seconds asked | 3806 |
| shell sleeps | 224 |
| test runs | 292 |
| tool denials | 10 |
| user interruptions | 20 |

Failed build/test/check runs in a row before the next green one (6 = 6 or more): 1: 120, 2: 27, 3: 9, 4: 5

Calls that failed again with the same input, by command: mcp__claude-in-chrome__tabs_context_mcp 1

Waits before a prompt or notice: <10 s 336, 10-60 s 125, 1-5 min 195, 5-30 min 190, 30 min-2 h 10, >2 h 4

### Longest single calls

| seconds | tool | general form | kind | date |
|---:|---|---|---|---|
| 601 | Bash | gh run | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | tail | subagent | 2026-10-04 |
| 601 | Bash | npx playwright | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | sleep | subagent | 2026-10-04 |
| 601 | Bash | script record-features.sh | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-05 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-06 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-06 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-06 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-06 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-06 |

### Biggest main sessions (by output tokens)

| session | date | span | API calls | tool calls | peak context | compactions | output | cache read | cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| f24a82d0 | 2026-10-04 | 20.4 h | 432 | 496 | 426k | 1 | 212k | 93.6M | $175 |
| 9474d1e1 | 2026-10-06 | 10.4 h | 308 | 365 | 412k | 0 | 120k | 77.4M | - |
| 0e6a28b9 | 2026-10-05 | 6.0 h | 224 | 231 | 298k | 0 | 87k | 42.1M | $183 |
| 40842fb9 | 2026-10-04 | 1.9 h | 96 | 170 | 246k | 0 | 80k | 15.1M | $34 |
| 6e82ade1 | 2026-10-05 | 10.9 h | 230 | 246 | 293k | 0 | 78k | 40.9M | $138 |
| 7b9ea25c | 2026-09-06 | 1.2 h | 55 | 67 | 151k | 0 | 41k | 5.7M | - |
| e2d4c16e | 2026-10-05 | 2.6 h | 84 | 90 | 174k | 0 | 35k | 10.2M | $39 |
| d4a9ec05 | 2026-10-05 | 3.7 h | 90 | 87 | 143k | 0 | 32k | 9.1M | - |
| f03abb01 | 2026-09-06 | 0.1 h | 39 | 43 | 170k | 0 | 19k | 3.0M | - |
| 0ba0a084 | 2026-10-06 | 0.7 h | 39 | 38 | 153k | 0 | 16k | 5.1M | $12 |

## best-remote-desktop

- transcripts: 2878 (948 main sessions, 1930 subagents)
- API calls: 156732; output tokens 118.2M (5.7M in calls with no tool, i.e. replies); input: fresh 377k, cache write 546.0M, cache read 39.31B; peak context 967k
- thinking time reported: 23.4 h; turn time reported: 327.7 h

- input-equivalent tokens, weighted by list-price ratios (fresh 1, cache write 2, cache read 0.1, output 5): fresh 377k, cache write 1.09B, cache read 3.93B, output 591.2M

### Headline

- active agent time (model + tools, main and subagents): 559.0 h, of it waiting on the model 69.4%
- API calls with exactly one tool call: 87.8%; with two or more: 7.2%
- API calls over 300k context: 31.2% of calls, 60.5% of cache reads
- cache reads are 70.0% of weighted tokens
- fixed prompt (first-call context x calls): 20.1% of cache reads; subagent start-up writes: 90.2M (16.5% of cache writes)
- tool results re-read: 25.7% of cache reads; file reads and searches (sed -n, Read, grep, cat, rg, head, tail): 72.5% of that
- blocking tool time 160.7 h: build/test/check 79.5 h (49.5%), behind a lock wrapper 31.9 h, wait/sleep 34.0 h (21.2%)
- build/test/check runs: 13754, failed 2871 (20.9%), failed but exit 0 behind a pipe 2837; fixes needing 3+ failed runs: 209, 5+: 41

### Main sessions and subagents

| | transcripts | API calls | output | cache write | cache read | model wait | tool time |
|---|---:|---:|---:|---:|---:|---:|---:|
| main | 948 | 62706 | 46.8M | 207.8M | 19.22B | 158.5 h | 74.2 h |
| subagent | 1930 | 94026 | 71.5M | 338.2M | 20.08B | 229.7 h | 96.6 h |

### Wall clock of main sessions (where the lead and the user wait)

| where | time | share of span |
|---|---:|---:|
| waiting on background or teammates | 437.7 h | 35.8% |
| user away (>30 min) | 307.4 h | 25.1% |
| waiting on user (questions) | 176.2 h | 14.4% |
| model | 158.5 h | 13.0% |
| tools | 74.2 h | 6.1% |
| waiting on user | 68.7 h | 5.6% |
| other | 0.0 h | 0.0% |
| compacting | 0.0 h | 0.0% |
| (span, first to last event) | 1222.8 h | |

### Wall clock of subagents and teammates

| where | time | share of span |
|---|---:|---:|
| waiting on background or teammates | 248.4 h | 41.4% |
| model | 229.7 h | 38.3% |
| tools | 96.6 h | 16.1% |
| user away (>30 min) | 24.6 h | 4.1% |
| waiting on user | 0.2 h | 0.0% |
| compacting | 0.1 h | 0.0% |
| other | 0.0 h | 0.0% |
| (span, first to last event) | 599.6 h | |

### By tool (MCP servers grouped)

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| AskUserQuestion | 530 | 6 | 176.2 h | 50.5% | 176.2 h | 1197 s | 71k | 0.1% | 17.7M | 0.2% | 496k | 0.4% |
| Bash | 133708 | 2257 | 156.6 h | 44.9% | 155.9 h | 4 s | 89.4M | 75.2% | 7.94B | 78.5% | 87.7M | 77.9% |
| ExitPlanMode | 32 | 9 | 10.1 h | 2.9% | 10.1 h | 1140 s | 85k | 0.1% | 18.6M | 0.2% | 10k | 0.0% |
| Agent | 759 | 0 | 2.0 h | 0.6% | 1.5 h | 9 s | 456k | 0.4% | 90.8M | 0.9% | 1.3M | 1.2% |
| TaskOutput | 34 | 2 | 1.8 h | 0.5% | 1.8 h | 194 s | 12k | 0.0% | 1.4M | 0.0% | 8k | 0.0% |
| Read | 8135 | 46 | 0.6 h | 0.2% | 0.3 h | 0 s | 23.3M | 19.6% | 1.63B | 16.1% | 2.8M | 2.5% |
| WebSearch | 133 | 0 | 0.3 h | 0.1% | 0.2 h | 9 s | 114k | 0.1% | 7.0M | 0.1% | 15k | 0.0% |
| WebFetch | 133 | 3 | 0.2 h | 0.1% | 0.2 h | 6 s | 68k | 0.1% | 5.8M | 0.1% | 30k | 0.0% |
| SendMessage | 6231 | 15 | 0.2 h | 0.1% | 0.1 h | 0 s | 421k | 0.4% | 93.1M | 0.9% | 3.4M | 3.0% |
| Edit | 4333 | 32 | 0.2 h | 0.0% | 0.2 h | 0 s | 207k | 0.2% | 18.8M | 0.2% | 3.3M | 2.9% |
| mcp:supermanager | 1243 | 25 | 0.1 h | 0.0% | 0.1 h | 0 s | 3.9M | 3.3% | 221.1M | 2.2% | 1.2M | 1.1% |
| Write | 1851 | 9 | 0.1 h | 0.0% | 0.1 h | 0 s | 98k | 0.1% | 12.2M | 0.1% | 4.9M | 4.4% |
| mcp:playwright | 531 | 37 | 0.1 h | 0.0% | 0.1 h | 0 s | 57k | 0.0% | 4.6M | 0.0% | 128k | 0.1% |
| mcp:context7 | 127 | 2 | 0.1 h | 0.0% | 0.1 h | 2 s | 102k | 0.1% | 12.4M | 0.1% | 50k | 0.0% |
| mcp:claude-in-chrome | 38 | 4 | 0.1 h | 0.0% | 0.1 h | 5 s | 11k | 0.0% | 905k | 0.0% | 7k | 0.0% |
| mcp:codex | 1 | 0 | 0.0 h | 0.0% | 0.0 h | 120 s | 80 | 0.0% | 21k | 0.0% | 4k | 0.0% |
| mcp:better-tasks | 653 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 49k | 0.0% | 11.3M | 0.1% | 231k | 0.2% |
| Skill | 194 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 2k | 0.0% | 241k | 0.0% | 85k | 0.1% |
| Glob | 12 | 0 | 0.0 h | 0.0% | 0.0 h | 2 s | 2k | 0.0% | 4k | 0.0% | 1k | 0.0% |
| Grep | 1090 | 10 | 0.0 h | 0.0% | 0.0 h | 0 s | 375k | 0.3% | 1.6M | 0.0% | 847k | 0.8% |
| Monitor | 320 | 3 | 0.0 h | 0.0% | 0.0 h | 0 s | 23k | 0.0% | 3.2M | 0.0% | 128k | 0.1% |
| ToolSearch | 819 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 33k | 0.0% | 4.1M | 0.0% | 298k | 0.3% |
| ListAgents | 163 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 40k | 0.0% | 9.8M | 0.1% | 69k | 0.1% |
| Artifact | 9 | 0 | 0.0 h | 0.0% | 0.0 h | 1 s | 11k | 0.0% | 424k | 0.0% | 9k | 0.0% |
| mcp:xcode | 14 | 10 | 0.0 h | 0.0% | 0.0 h | 1 s | 18k | 0.0% | 2.6M | 0.0% | 2k | 0.0% |
| StructuredOutput | 1674 | 57 | 0.0 h | 0.0% | 0.0 h | 0 s | 18k | 0.0% | 5k | 0.0% | 5.4M | 4.8% |
| TaskStop | 187 | 9 | 0.0 h | 0.0% | 0.0 h | 0 s | 24k | 0.0% | 4.0M | 0.0% | 33k | 0.0% |
| SendUserFile | 3 | 0 | 0.0 h | 0.0% | 0.0 h | 1 s | 338 | 0.0% | 87k | 0.0% | 1k | 0.0% |
| LSP | 8 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 7k | 0.0% | 953k | 0.0% | 4k | 0.0% |
| ScheduleWakeup | 74 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 3k | 0.0% | 293k | 0.0% | 40k | 0.0% |

### By kind of work (Bash split by what the command does)

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| asking the user | 530 | 6 | 176.2 h | 50.5% | 176.2 h | 1197 s | 71k | 0.1% | 17.7M | 0.2% | 496k | 0.4% |
| check | 7207 | 106 | 35.7 h | 10.2% | 35.7 h | 18 s | 1.1M | 1.0% | 142.2M | 1.4% | 5.1M | 4.5% |
| wait | 3329 | 249 | 34.0 h | 9.8% | 34.0 h | 37 s | 425k | 0.4% | 57.9M | 0.6% | 1.8M | 1.6% |
| test | 3977 | 35 | 27.3 h | 7.8% | 27.2 h | 25 s | 892k | 0.7% | 90.3M | 0.9% | 2.9M | 2.6% |
| run | 15776 | 386 | 26.8 h | 7.7% | 26.6 h | 6 s | 3.9M | 3.3% | 547.4M | 5.4% | 16.4M | 14.6% |
| build | 3065 | 69 | 16.7 h | 4.8% | 16.6 h | 20 s | 433k | 0.4% | 63.2M | 0.6% | 3.0M | 2.6% |
| ExitPlanMode | 32 | 9 | 10.1 h | 2.9% | 10.1 h | 1140 s | 85k | 0.1% | 18.6M | 0.2% | 10k | 0.0% |
| read/search | 80746 | 918 | 3.9 h | 1.1% | 3.8 h | 0 s | 74.5M | 62.6% | 6.17B | 61.0% | 45.0M | 40.0% |
| network | 2335 | 86 | 3.4 h | 1.0% | 3.4 h | 5 s | 530k | 0.4% | 68.0M | 0.7% | 1.7M | 1.5% |
| git | 12290 | 275 | 3.2 h | 0.9% | 3.2 h | 1 s | 6.1M | 5.1% | 612.1M | 6.1% | 8.2M | 7.3% |
| agent | 759 | 0 | 2.0 h | 0.6% | 1.5 h | 9 s | 456k | 0.4% | 90.8M | 0.9% | 1.3M | 1.2% |
| TaskOutput | 34 | 2 | 1.8 h | 0.5% | 1.8 h | 194 s | 12k | 0.0% | 1.4M | 0.0% | 8k | 0.0% |
| device | 785 | 21 | 1.8 h | 0.5% | 1.8 h | 8 s | 191k | 0.2% | 45.4M | 0.4% | 413k | 0.4% |
| video | 685 | 34 | 1.5 h | 0.4% | 1.4 h | 8 s | 87k | 0.1% | 13.6M | 0.1% | 483k | 0.4% |
| process | 1208 | 28 | 1.4 h | 0.4% | 1.4 h | 4 s | 490k | 0.4% | 70.6M | 0.7% | 604k | 0.5% |
| Read | 8135 | 46 | 0.6 h | 0.2% | 0.3 h | 0 s | 23.3M | 19.6% | 1.63B | 16.1% | 2.8M | 2.5% |
| other | 354 | 13 | 0.4 h | 0.1% | 0.3 h | 4 s | 17k | 0.0% | 1.8M | 0.0% | 148k | 0.1% |
| edit (shell) | 1744 | 34 | 0.3 h | 0.1% | 0.3 h | 1 s | 672k | 0.6% | 51.7M | 0.5% | 2.0M | 1.8% |
| WebSearch | 133 | 0 | 0.3 h | 0.1% | 0.2 h | 9 s | 114k | 0.1% | 7.0M | 0.1% | 15k | 0.0% |
| WebFetch | 133 | 3 | 0.2 h | 0.1% | 0.2 h | 6 s | 68k | 0.1% | 5.8M | 0.1% | 30k | 0.0% |
| gh | 194 | 3 | 0.2 h | 0.1% | 0.2 h | 3 s | 42k | 0.0% | 4.1M | 0.0% | 78k | 0.1% |
| SendMessage | 6231 | 15 | 0.2 h | 0.1% | 0.1 h | 0 s | 421k | 0.4% | 93.1M | 0.9% | 3.4M | 3.0% |
| Edit | 4333 | 32 | 0.2 h | 0.0% | 0.2 h | 0 s | 207k | 0.2% | 18.8M | 0.2% | 3.3M | 2.9% |
| mcp:supermanager | 1243 | 25 | 0.1 h | 0.0% | 0.1 h | 0 s | 3.9M | 3.3% | 221.1M | 2.2% | 1.2M | 1.1% |
| Write | 1851 | 9 | 0.1 h | 0.0% | 0.1 h | 0 s | 98k | 0.1% | 12.2M | 0.1% | 4.9M | 4.4% |
| mcp:playwright | 531 | 37 | 0.1 h | 0.0% | 0.1 h | 0 s | 57k | 0.0% | 4.6M | 0.0% | 128k | 0.1% |
| mcp:context7 | 127 | 2 | 0.1 h | 0.0% | 0.1 h | 2 s | 102k | 0.1% | 12.4M | 0.1% | 50k | 0.0% |
| mcp:claude-in-chrome | 38 | 4 | 0.1 h | 0.0% | 0.1 h | 5 s | 11k | 0.0% | 905k | 0.0% | 7k | 0.0% |
| mcp:codex | 1 | 0 | 0.0 h | 0.0% | 0.0 h | 120 s | 80 | 0.0% | 21k | 0.0% | 4k | 0.0% |
| mcp:better-tasks | 653 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 49k | 0.0% | 11.3M | 0.1% | 231k | 0.2% |

### Bash commands, general form

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sleep | 2527 | 240 | 33.8 h | 21.6% | 33.7 h | 48 s | 353k | 0.4% | 47.7M | 0.6% | 1.5M | 1.7% |
| python3 file check.py | 1014 | 5 | 11.7 h | 7.5% | 11.7 h | 41 s | 189k | 0.2% | 27.0M | 0.3% | 612k | 0.7% |
| serial.py lock: cargo test | 1363 | 4 | 9.9 h | 6.3% | 9.9 h | 26 s | 246k | 0.3% | 34.4M | 0.4% | 968k | 1.1% |
| cargo test | 1356 | 13 | 7.2 h | 4.6% | 7.1 h | 19 s | 308k | 0.3% | 16.5M | 0.2% | 865k | 1.0% |
| rustfmt | 994 | 21 | 5.6 h | 3.5% | 5.6 h | 20 s | 180k | 0.2% | 18.8M | 0.2% | 932k | 1.1% |
| cargo fmt | 1158 | 17 | 4.5 h | 2.9% | 4.5 h | 14 s | 179k | 0.2% | 15.7M | 0.2% | 845k | 1.0% |
| python3 -c/-e one-liner | 2390 | 92 | 4.4 h | 2.8% | 4.4 h | 7 s | 856k | 1.0% | 110.9M | 1.4% | 1.5M | 1.7% |
| xcodebuild test | 179 | 0 | 3.4 h | 2.2% | 3.4 h | 68 s | 24k | 0.0% | 4.6M | 0.1% | 191k | 0.2% |
| serial.py lock: cargo check | 818 | 5 | 3.3 h | 2.1% | 3.3 h | 15 s | 119k | 0.1% | 24.4M | 0.3% | 667k | 0.8% |
| python3 inline script | 8656 | 150 | 2.9 h | 1.9% | 2.9 h | 1 s | 1.7M | 1.9% | 252.9M | 3.2% | 11.7M | 13.3% |
| ssh | 2022 | 74 | 2.8 h | 1.8% | 2.8 h | 5 s | 460k | 0.5% | 61.1M | 0.8% | 1.4M | 1.6% |
| cargo check | 1095 | 9 | 2.8 h | 1.8% | 2.8 h | 9 s | 135k | 0.2% | 18.2M | 0.2% | 794k | 0.9% |
| xcodebuild build | 492 | 4 | 2.6 h | 1.7% | 2.5 h | 19 s | 53k | 0.1% | 10.1M | 0.1% | 534k | 0.6% |
| serial.py lock: cargo clippy | 425 | 1 | 2.5 h | 1.6% | 2.5 h | 21 s | 55k | 0.1% | 6.0M | 0.1% | 263k | 0.3% |
| serial.py lock: cargo build | 467 | 2 | 2.5 h | 1.6% | 2.5 h | 19 s | 72k | 0.1% | 17.4M | 0.2% | 534k | 0.6% |
| script loop | 192 | 2 | 2.2 h | 1.4% | 2.2 h | 42 s | 71k | 0.1% | 9.3M | 0.1% | 78k | 0.1% |
| serial.py lock: xcodebuild build | 229 | 3 | 2.1 h | 1.4% | 2.1 h | 33 s | 19k | 0.0% | 3.5M | 0.0% | 205k | 0.2% |
| cargo clippy | 421 | 2 | 2.1 h | 1.3% | 2.1 h | 18 s | 64k | 0.1% | 2.7M | 0.0% | 131k | 0.1% |
| serial.py lock: xcodebuild test | 38 | 2 | 2.1 h | 1.3% | 2.1 h | 195 s | 6k | 0.0% | 1.2M | 0.0% | 38k | 0.0% |
| serial.py lock: script loop | 60 | 1 | 1.8 h | 1.2% | 1.8 h | 109 s | 19k | 0.0% | 2.8M | 0.0% | 29k | 0.0% |
| xcrun devicectl device | 505 | 14 | 1.4 h | 0.9% | 1.4 h | 10 s | 113k | 0.1% | 23.7M | 0.3% | 274k | 0.3% |
| swift test | 157 | 1 | 1.4 h | 0.9% | 1.4 h | 31 s | 32k | 0.0% | 7.1M | 0.1% | 167k | 0.2% |
| serial.py lock: script macbook.sh | 85 | 0 | 1.4 h | 0.9% | 1.4 h | 58 s | 20k | 0.0% | 3.1M | 0.0% | 33k | 0.0% |
| serial.py lock: cargo fmt | 296 | 2 | 1.3 h | 0.8% | 1.3 h | 16 s | 40k | 0.0% | 5.9M | 0.1% | 148k | 0.2% |
| git checkout | 265 | 7 | 1.3 h | 0.8% | 1.3 h | 17 s | 46k | 0.1% | 7.6M | 0.1% | 195k | 0.2% |
| cargo build | 249 | 3 | 1.3 h | 0.8% | 1.3 h | 18 s | 37k | 0.0% | 2.1M | 0.0% | 209k | 0.2% |
| script macbook.sh | 180 | 0 | 1.2 h | 0.8% | 1.2 h | 24 s | 54k | 0.1% | 12.6M | 0.2% | 66k | 0.1% |
| python3 file apple-test.py | 90 | 1 | 1.2 h | 0.8% | 1.2 h | 48 s | 11k | 0.0% | 3.4M | 0.0% | 60k | 0.1% |
| python3 file phone-rig.py | 102 | 0 | 1.2 h | 0.8% | 1.2 h | 42 s | 22k | 0.0% | 4.7M | 0.1% | 40k | 0.0% |
| grep | 24713 | 206 | 1.2 h | 0.8% | 1.2 h | 0 s | 11.3M | 12.6% | 1.30B | 16.4% | 15.8M | 18.0% |
| serial.py lock: swift build | 110 | 2 | 1.1 h | 0.7% | 1.1 h | 36 s | 10k | 0.0% | 1.1M | 0.0% | 89k | 0.1% |
| git log | 2104 | 62 | 1.0 h | 0.6% | 1.0 h | 2 s | 988k | 1.1% | 123.6M | 1.6% | 1.3M | 1.5% |
| serial.py lock: npm run build:dev | 26 | 0 | 0.9 h | 0.6% | 0.9 h | 130 s | 4k | 0.0% | 726k | 0.0% | 21k | 0.0% |
| make build-dev | 33 | 0 | 0.8 h | 0.5% | 0.8 h | 87 s | 2k | 0.0% | 497k | 0.0% | 23k | 0.0% |
| pgrep | 392 | 18 | 0.8 h | 0.5% | 0.8 h | 7 s | 129k | 0.1% | 17.5M | 0.2% | 202k | 0.2% |
| script pause.sh | 22 | 0 | 0.8 h | 0.5% | 0.8 h | 124 s | 429 | 0.0% | 38k | 0.0% | 10k | 0.0% |
| tail | 1089 | 30 | 0.7 h | 0.5% | 0.7 h | 2 s | 330k | 0.4% | 43.9M | 0.6% | 418k | 0.5% |
| codesign | 180 | 2 | 0.7 h | 0.4% | 0.7 h | 14 s | 32k | 0.0% | 3.3M | 0.0% | 130k | 0.1% |
| python3 | 95 | 1 | 0.6 h | 0.4% | 0.6 h | 24 s | 13k | 0.0% | 2.3M | 0.0% | 58k | 0.1% |
| serial.py lock: python3 file apple-test.py | 38 | 0 | 0.6 h | 0.4% | 0.6 h | 57 s | 3k | 0.0% | 425k | 0.0% | 19k | 0.0% |

### What fills the context (by tokens re-read)

| name | calls | result tok | avg per call | re-read in context | share |
|---|---:|---:|---:|---:|---:|
| sed -n (read) | 31686 | 41.8M | 1k | 3.40B | 33.6% |
| Read | 8135 | 23.3M | 3k | 1.63B | 16.1% |
| grep | 24713 | 11.3M | 456 | 1.30B | 12.8% |
| cat | 4752 | 8.7M | 2k | 762.1M | 7.5% |
| python3 inline script | 8656 | 1.7M | 196 | 252.9M | 2.5% |
| git diff | 3697 | 2.4M | 649 | 215.5M | 2.1% |
| ls | 4147 | 2.1M | 505 | 206.2M | 2.0% |
| rg | 9888 | 6.5M | 660 | 133.8M | 1.3% |
| git log | 2104 | 988k | 469 | 123.6M | 1.2% |
| wc | 1360 | 1.6M | 1k | 117.7M | 1.2% |
| python3 -c/-e one-liner | 2390 | 856k | 357 | 110.9M | 1.1% |
| git show | 1458 | 1.2M | 812 | 95.5M | 0.9% |
| SendMessage | 6231 | 421k | 67 | 93.1M | 0.9% |
| Agent | 759 | 456k | 600 | 90.8M | 0.9% |
| git status | 1482 | 553k | 373 | 74.1M | 0.7% |

Tool calls per API call (3 = 3 or more): 0: 7881, 1: 137619, 2: 9472, 3: 1760

### Context size per API call

| context | calls | share | cache-read tokens | share | avg wait per call |
|---|---:|---:|---:|---:|---:|
| <50k | 4775 | 3.0% | 127.1M | 0.3% | 22.7 s |
| 50-100k | 31816 | 20.3% | 2.28B | 5.8% | 7.8 s |
| 100-150k | 23226 | 14.8% | 2.81B | 7.1% | 8.9 s |
| 150-200k | 19154 | 12.2% | 3.29B | 8.4% | 8.9 s |
| 200-300k | 28875 | 18.4% | 7.02B | 17.9% | 8.9 s |
| 300-500k | 30740 | 19.6% | 11.78B | 30.0% | 8.3 s |
| 500k+ | 18146 | 11.6% | 12.00B | 30.5% | 8.3 s |

Context at the first API call (system prompt, tools, rules), median: main 53k, subagent 48k

Wait on the model per API call: <10 s 123926, 10-60 s 31355, 1-5 min 1438, 5-30 min 9, 30 min-2 h 0, >2 h 4

### Compactions

- 35 compactions (24 auto, 11 manual); median context before: 967k; time spent compacting: 0.8 h

### Errors by kind

| kind | count |
|---|---:|
| shell non-zero exit: read/search | 792 |
| shell non-zero exit: run | 338 |
| shell non-zero exit: git | 258 |
| shell non-zero exit: wait | 235 |
| file or path missing | 212 |
| shell non-zero exit: check | 96 |
| denied by user or permission | 75 |
| shell non-zero exit: network | 64 |
| shell non-zero exit: build | 62 |
| input validation | 47 |
| other error: StructuredOutput | 35 |
| shell non-zero exit: test | 32 |
| shell non-zero exit: edit (shell) | 31 |
| shell non-zero exit: process | 27 |
| timed out | 26 |
| shell non-zero exit: video | 26 |
| other error: mcp:supermanager | 25 |
| shell non-zero exit: device | 18 |
| other error: mcp:playwright | 17 |
| other error: Edit | 16 |
| other error: SendMessage | 15 |
| edit: text to replace not found | 12 |
| command not found | 12 |
| shell non-zero exit: other | 12 |
| edit: file changed since read | 10 |

### Mistakes, repeats and waits

| measure | value |
|---|---:|
| Bash calls stopped at the 10-min cap | 97 |
| api errors | 100 |
| build runs | 2931 |
| check runs | 6990 |
| edit undoing an earlier edit | 7 |
| failed build runs before a green one | 396 |
| failed build runs hidden by a pipe (exit 0) | 354 |
| failed check runs before a green one | 1544 |
| failed check runs hidden by a pipe (exit 0) | 1522 |
| failed test runs before a green one | 931 |
| failed test runs hidden by a pipe (exit 0) | 961 |
| file edits | 6143 |
| files edited 5+ times in one session | 273 |
| git undo: checkout | 156 |
| git undo: reset | 15 |
| git undo: restore | 3 |
| git undo: revert | 4 |
| git undo: stash | 135 |
| human prompts | 3947 |
| human prompts that read as a correction | 614 |
| re-read tokens | 291k |
| re-read, file unchanged | 263 |
| repeated failing signatures | 7 |
| same call failed again | 7 |
| shell sleep seconds asked | 89155 |
| shell sleeps | 3156 |
| test runs | 3833 |
| tool denials | 102 |
| user interruptions | 70 |

Failed build/test/check runs in a row before the next green one (6 = 6 or more): 1: 1305, 2: 381, 3: 118, 4: 50, 5: 20, 6: 21

Calls that failed again with the same input, by command: mcp__supermanager__complete_task 1, mcp__plugin_playwright_playwright__browser_navigate 1, cargo check 1, cargo fmt 1, TaskStop 1, script open-pr.sh 1, Read 1

Waits before a prompt or notice: <10 s 4697, 10-60 s 1597, 1-5 min 1587, 5-30 min 843, 30 min-2 h 135, >2 h 72

### Longest single calls

| seconds | tool | general form | kind | date |
|---:|---|---|---|---|
| 1758 | Bash | clang | main | 2026-09-06 |
| 768 | Bash | cargo build | subagent | 2026-09-07 |
| 601 | Bash | sleep | main | 2026-09-13 |
| 601 | Bash | serial.py lock: cargo test | main | 2026-09-13 |
| 601 | Bash | sleep | main | 2026-09-15 |
| 601 | Bash | sleep | main | 2026-09-15 |
| 601 | Bash | serial.py lock: script loop | main | 2026-09-15 |
| 601 | Bash | serial.py lock: script macbook.sh | main | 2026-09-15 |
| 601 | Bash | sleep | main | 2026-09-07 |
| 601 | Bash | cargo test | subagent | 2026-09-07 |
| 601 | Bash | cargo test | subagent | 2026-09-07 |
| 601 | Bash | sleep | subagent | 2026-10-02 |
| 601 | Bash | cargo fmt | subagent | 2026-10-02 |
| 601 | Bash | sleep | main | 2026-09-11 |
| 601 | Bash | serial.py lock: script loop | main | 2026-09-12 |
| 601 | Bash | sleep | main | 2026-09-17 |
| 601 | Bash | script break.sh | subagent | 2026-09-23 |
| 601 | Bash | sleep | subagent | 2026-09-23 |
| 601 | Bash | sleep | subagent | 2026-09-23 |
| 601 | Bash | serial.py lock: cargo fmt | main | 2026-09-13 |
| 601 | Bash | sleep | main | 2026-09-23 |
| 601 | Bash | sleep | main | 2026-09-23 |
| 601 | Bash | serial.py lock: npm run build:dev | main | 2026-09-21 |
| 601 | Bash | sleep | main | 2026-09-10 |
| 601 | Bash | sleep | subagent | 2026-10-05 |

### Biggest main sessions (by output tokens)

| session | date | span | API calls | tool calls | peak context | compactions | output | cache read | cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 3bb58ee1 | 2026-09-30 | 33.0 h | 2539 | 2576 | 967k | 4 | 2.2M | 1.28B | $363 |
| 3a42d21c | 2026-09-22 | 25.4 h | 1447 | 1466 | 966k | 2 | 1.4M | 709.4M | $229 |
| 1d5905c6 | 2026-10-01 | 22.6 h | 1140 | 1224 | 966k | 2 | 1.1M | 549.9M | $170 |
| c52c135f | 2026-09-23 | 46.5 h | 1168 | 1136 | 965k | 2 | 1.1M | 578.8M | $71 |
| f91f5ef7 | 2026-09-16 | 13.2 h | 1158 | 1199 | 966k | 1 | 756k | 598.1M | $383 |
| 257f3021 | 2026-09-22 | 17.0 h | 672 | 675 | 966k | 1 | 661k | 319.3M | $106 |
| 3f027c0f | 2026-09-09 | 11.8 h | 446 | 431 | 733k | 1 | 646k | 145.4M | - |
| 7378cc3b | 2026-09-10 | 16.6 h | 996 | 995 | 769k | 1 | 528k | 385.6M | - |
| b00caf99 | 2026-10-02 | 15.9 h | 1667 | 813 | 925k | 1 | 525k | 796.7M | $1445 |
| d0ddb020 | 2026-09-21 | 6.2 h | 515 | 487 | 850k | 0 | 514k | 260.2M | $161 |

## all

- transcripts: 3032 (962 main sessions, 2070 subagents)
- API calls: 170254; output tokens 126.2M (6.1M in calls with no tool, i.e. replies); input: fresh 405k, cache write 580.4M, cache read 42.01B; peak context 967k
- thinking time reported: 29.4 h; turn time reported: 368.3 h

- input-equivalent tokens, weighted by list-price ratios (fresh 1, cache write 2, cache read 0.1, output 5): fresh 405k, cache write 1.16B, cache read 4.20B, output 631.2M

### Headline

- active agent time (model + tools, main and subagents): 626.5 h, of it waiting on the model 67.3%
- API calls with exactly one tool call: 86.7%; with two or more: 8.2%
- API calls over 300k context: 30.2% of calls, 59.2% of cache reads
- cache reads are 70.1% of weighted tokens
- fixed prompt (first-call context x calls): 20.2% of cache reads; subagent start-up writes: 95.9M (16.5% of cache writes)
- tool results re-read: 25.5% of cache reads; file reads and searches (sed -n, Read, grep, cat, rg, head, tail): 72.0% of that
- blocking tool time 194.9 h: build/test/check 84.5 h (43.3%), behind a lock wrapper 31.9 h, wait/sleep 45.4 h (23.3%)
- build/test/check runs: 14767, failed 3092 (20.9%), failed but exit 0 behind a pipe 3018; fixes needing 3+ failed runs: 223, 5+: 41

### Main sessions and subagents

| | transcripts | API calls | output | cache write | cache read | model wait | tool time |
|---|---:|---:|---:|---:|---:|---:|---:|
| main | 962 | 64365 | 47.5M | 210.9M | 19.53B | 171.4 h | 75.2 h |
| subagent | 2070 | 105889 | 78.7M | 369.5M | 22.48B | 250.0 h | 129.9 h |

### Wall clock of main sessions (where the lead and the user wait)

| where | time | share of span |
|---|---:|---:|
| waiting on background or teammates | 455.4 h | 35.5% |
| user away (>30 min) | 307.4 h | 24.0% |
| waiting on user (questions) | 199.8 h | 15.6% |
| model | 171.4 h | 13.4% |
| tools | 75.2 h | 5.9% |
| waiting on user | 72.6 h | 5.7% |
| other | 0.0 h | 0.0% |
| compacting | 0.0 h | 0.0% |
| (span, first to last event) | 1281.8 h | |

### Wall clock of subagents and teammates

| where | time | share of span |
|---|---:|---:|
| waiting on background or teammates | 292.8 h | 42.0% |
| model | 250.0 h | 35.8% |
| tools | 129.9 h | 18.6% |
| user away (>30 min) | 24.6 h | 3.5% |
| waiting on user | 0.2 h | 0.0% |
| compacting | 0.1 h | 0.0% |
| other | 0.1 h | 0.0% |
| (span, first to last event) | 697.6 h | |

### By tool (MCP servers grouped)

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| AskUserQuestion | 709 | 9 | 199.8 h | 49.1% | 199.8 h | 1014 s | 108k | 0.1% | 21.6M | 0.2% | 632k | 0.5% |
| Bash | 144682 | 2911 | 191.0 h | 46.9% | 189.8 h | 5 s | 93.2M | 74.9% | 8.35B | 78.0% | 92.6M | 77.1% |
| ExitPlanMode | 32 | 9 | 10.1 h | 2.5% | 10.1 h | 1140 s | 85k | 0.1% | 18.6M | 0.2% | 10k | 0.0% |
| Agent | 903 | 0 | 2.0 h | 0.5% | 1.5 h | 8 s | 494k | 0.4% | 96.0M | 0.9% | 1.4M | 1.2% |
| TaskOutput | 34 | 2 | 1.8 h | 0.4% | 1.8 h | 194 s | 12k | 0.0% | 1.4M | 0.0% | 8k | 0.0% |
| Read | 9028 | 54 | 0.8 h | 0.2% | 0.4 h | 0 s | 24.6M | 19.8% | 1.77B | 16.5% | 3.0M | 2.5% |
| WebSearch | 141 | 0 | 0.3 h | 0.1% | 0.2 h | 8 s | 119k | 0.1% | 7.2M | 0.1% | 15k | 0.0% |
| WebFetch | 153 | 3 | 0.2 h | 0.1% | 0.2 h | 6 s | 91k | 0.1% | 5.8M | 0.1% | 33k | 0.0% |
| SendMessage | 6827 | 15 | 0.2 h | 0.0% | 0.1 h | 0 s | 440k | 0.4% | 95.1M | 0.9% | 3.6M | 3.0% |
| Edit | 4982 | 46 | 0.2 h | 0.0% | 0.2 h | 0 s | 238k | 0.2% | 21.8M | 0.2% | 3.5M | 2.9% |
| Write | 3291 | 18 | 0.1 h | 0.0% | 0.1 h | 0 s | 182k | 0.1% | 23.8M | 0.2% | 6.2M | 5.2% |
| mcp:playwright | 560 | 43 | 0.1 h | 0.0% | 0.1 h | 1 s | 68k | 0.1% | 6.2M | 0.1% | 148k | 0.1% |
| mcp:supermanager | 1243 | 25 | 0.1 h | 0.0% | 0.1 h | 0 s | 3.9M | 3.2% | 221.1M | 2.1% | 1.2M | 1.0% |
| mcp:context7 | 151 | 2 | 0.1 h | 0.0% | 0.1 h | 2 s | 118k | 0.1% | 14.1M | 0.1% | 54k | 0.0% |
| mcp:claude-in-chrome | 40 | 6 | 0.1 h | 0.0% | 0.1 h | 6 s | 11k | 0.0% | 910k | 0.0% | 7k | 0.0% |
| mcp:better-tasks | 1544 | 0 | 0.1 h | 0.0% | 0.0 h | 0 s | 107k | 0.1% | 16.9M | 0.2% | 518k | 0.4% |
| mcp:codex | 1 | 0 | 0.0 h | 0.0% | 0.0 h | 120 s | 80 | 0.0% | 21k | 0.0% | 4k | 0.0% |
| Skill | 300 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 2k | 0.0% | 334k | 0.0% | 103k | 0.1% |
| ToolSearch | 978 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 39k | 0.0% | 4.8M | 0.0% | 338k | 0.3% |
| TaskStop | 257 | 31 | 0.0 h | 0.0% | 0.0 h | 0 s | 34k | 0.0% | 4.9M | 0.0% | 45k | 0.0% |
| Glob | 12 | 0 | 0.0 h | 0.0% | 0.0 h | 2 s | 2k | 0.0% | 4k | 0.0% | 1k | 0.0% |
| Grep | 1090 | 10 | 0.0 h | 0.0% | 0.0 h | 0 s | 375k | 0.3% | 1.6M | 0.0% | 847k | 0.7% |
| Monitor | 346 | 8 | 0.0 h | 0.0% | 0.0 h | 0 s | 26k | 0.0% | 3.4M | 0.0% | 137k | 0.1% |
| ListAgents | 165 | 0 | 0.0 h | 0.0% | 0.0 h | 0 s | 41k | 0.0% | 9.9M | 0.1% | 69k | 0.1% |
| Artifact | 9 | 0 | 0.0 h | 0.0% | 0.0 h | 1 s | 11k | 0.0% | 424k | 0.0% | 9k | 0.0% |
| mcp:xcode | 14 | 10 | 0.0 h | 0.0% | 0.0 h | 1 s | 18k | 0.0% | 2.6M | 0.0% | 2k | 0.0% |
| SendUserFile | 8 | 0 | 0.0 h | 0.0% | 0.0 h | 1 s | 523 | 0.0% | 104k | 0.0% | 2k | 0.0% |
| mcp:github | 6 | 0 | 0.0 h | 0.0% | 0.0 h | 1 s | 16k | 0.0% | 401k | 0.0% | 3k | 0.0% |
| StructuredOutput | 1674 | 57 | 0.0 h | 0.0% | 0.0 h | 0 s | 18k | 0.0% | 5k | 0.0% | 5.4M | 4.5% |
| mcp:idea | 15 | 1 | 0.0 h | 0.0% | 0.0 h | 0 s | 100 | 0.0% | 11k | 0.0% | 2k | 0.0% |

### By kind of work (Bash split by what the command does)

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| asking the user | 709 | 9 | 199.8 h | 49.1% | 199.8 h | 1014 s | 108k | 0.1% | 21.6M | 0.2% | 632k | 0.5% |
| wait | 3666 | 297 | 45.4 h | 11.1% | 45.4 h | 45 s | 463k | 0.4% | 61.3M | 0.6% | 1.9M | 1.6% |
| check | 7514 | 134 | 36.1 h | 8.9% | 36.1 h | 17 s | 1.2M | 1.0% | 149.1M | 1.4% | 5.2M | 4.3% |
| run | 17285 | 489 | 32.9 h | 8.1% | 32.7 h | 7 s | 4.2M | 3.4% | 585.9M | 5.5% | 17.4M | 14.5% |
| test | 4272 | 47 | 27.8 h | 6.8% | 27.7 h | 23 s | 992k | 0.8% | 100.4M | 0.9% | 3.0M | 2.5% |
| build | 3533 | 101 | 21.0 h | 5.2% | 20.7 h | 21 s | 505k | 0.4% | 69.6M | 0.7% | 3.2M | 2.6% |
| ExitPlanMode | 32 | 9 | 10.1 h | 2.5% | 10.1 h | 1140 s | 85k | 0.1% | 18.6M | 0.2% | 10k | 0.0% |
| read/search | 85133 | 1044 | 7.4 h | 1.8% | 7.3 h | 0 s | 76.9M | 61.8% | 6.45B | 60.2% | 46.7M | 38.9% |
| video | 1157 | 71 | 4.6 h | 1.1% | 4.5 h | 14 s | 140k | 0.1% | 18.4M | 0.2% | 691k | 0.6% |
| git | 14009 | 422 | 4.0 h | 1.0% | 3.9 h | 1 s | 6.6M | 5.3% | 654.5M | 6.1% | 8.9M | 7.4% |
| gh | 993 | 47 | 3.8 h | 0.9% | 3.7 h | 14 s | 155k | 0.1% | 14.6M | 0.1% | 405k | 0.3% |
| network | 2450 | 94 | 3.5 h | 0.9% | 3.5 h | 5 s | 546k | 0.4% | 70.0M | 0.7% | 1.7M | 1.4% |
| agent | 903 | 0 | 2.0 h | 0.5% | 1.5 h | 8 s | 494k | 0.4% | 96.0M | 0.9% | 1.4M | 1.2% |
| TaskOutput | 34 | 2 | 1.8 h | 0.4% | 1.8 h | 194 s | 12k | 0.0% | 1.4M | 0.0% | 8k | 0.0% |
| device | 785 | 21 | 1.8 h | 0.4% | 1.8 h | 8 s | 191k | 0.2% | 45.4M | 0.4% | 413k | 0.3% |
| process | 1316 | 42 | 1.5 h | 0.4% | 1.5 h | 4 s | 511k | 0.4% | 73.6M | 0.7% | 644k | 0.5% |
| Read | 9028 | 54 | 0.8 h | 0.2% | 0.4 h | 0 s | 24.6M | 19.8% | 1.77B | 16.5% | 3.0M | 2.5% |
| edit (shell) | 2049 | 78 | 0.7 h | 0.2% | 0.7 h | 1 s | 733k | 0.6% | 56.8M | 0.5% | 2.2M | 1.8% |
| other | 457 | 20 | 0.4 h | 0.1% | 0.4 h | 3 s | 24k | 0.0% | 2.5M | 0.0% | 185k | 0.2% |
| WebSearch | 141 | 0 | 0.3 h | 0.1% | 0.2 h | 8 s | 119k | 0.1% | 7.2M | 0.1% | 15k | 0.0% |
| WebFetch | 153 | 3 | 0.2 h | 0.1% | 0.2 h | 6 s | 91k | 0.1% | 5.8M | 0.1% | 33k | 0.0% |
| SendMessage | 6827 | 15 | 0.2 h | 0.0% | 0.1 h | 0 s | 440k | 0.4% | 95.1M | 0.9% | 3.6M | 3.0% |
| Edit | 4982 | 46 | 0.2 h | 0.0% | 0.2 h | 0 s | 238k | 0.2% | 21.8M | 0.2% | 3.5M | 2.9% |
| Write | 3291 | 18 | 0.1 h | 0.0% | 0.1 h | 0 s | 182k | 0.1% | 23.8M | 0.2% | 6.2M | 5.2% |
| mcp:playwright | 560 | 43 | 0.1 h | 0.0% | 0.1 h | 1 s | 68k | 0.1% | 6.2M | 0.1% | 148k | 0.1% |
| mcp:supermanager | 1243 | 25 | 0.1 h | 0.0% | 0.1 h | 0 s | 3.9M | 3.2% | 221.1M | 2.1% | 1.2M | 1.0% |
| mcp:context7 | 151 | 2 | 0.1 h | 0.0% | 0.1 h | 2 s | 118k | 0.1% | 14.1M | 0.1% | 54k | 0.0% |
| mcp:claude-in-chrome | 40 | 6 | 0.1 h | 0.0% | 0.1 h | 6 s | 11k | 0.0% | 910k | 0.0% | 7k | 0.0% |
| mcp:better-tasks | 1544 | 0 | 0.1 h | 0.0% | 0.0 h | 0 s | 107k | 0.1% | 16.9M | 0.2% | 518k | 0.4% |
| package | 63 | 4 | 0.0 h | 0.0% | 0.0 h | 3 s | 9k | 0.0% | 847k | 0.0% | 26k | 0.0% |

### Bash commands, general form

| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | share | re-read in context (est) | share | output tok | share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| sleep | 2817 | 281 | 45.1 h | 23.6% | 45.1 h | 58 s | 387k | 0.4% | 50.8M | 0.6% | 1.6M | 1.7% |
| python3 file check.py | 1014 | 5 | 11.7 h | 6.1% | 11.7 h | 41 s | 189k | 0.2% | 27.0M | 0.3% | 612k | 0.7% |
| serial.py lock: cargo test | 1363 | 4 | 9.9 h | 5.2% | 9.9 h | 26 s | 246k | 0.3% | 34.4M | 0.4% | 968k | 1.0% |
| cargo test | 1357 | 13 | 7.2 h | 3.8% | 7.2 h | 19 s | 309k | 0.3% | 16.5M | 0.2% | 866k | 0.9% |
| rustfmt | 995 | 21 | 5.6 h | 2.9% | 5.6 h | 20 s | 180k | 0.2% | 18.8M | 0.2% | 932k | 1.0% |
| cargo fmt | 1159 | 17 | 4.5 h | 2.3% | 4.5 h | 14 s | 179k | 0.2% | 15.8M | 0.2% | 846k | 0.9% |
| python3 -c/-e one-liner | 2490 | 98 | 4.4 h | 2.3% | 4.4 h | 6 s | 893k | 1.0% | 116.6M | 1.4% | 1.6M | 1.7% |
| python3 inline script | 9233 | 199 | 3.5 h | 1.8% | 3.5 h | 1 s | 1.8M | 1.9% | 263.4M | 3.2% | 12.2M | 13.1% |
| grep | 26519 | 234 | 3.4 h | 1.8% | 3.4 h | 0 s | 11.9M | 12.8% | 1.36B | 16.3% | 16.6M | 17.9% |
| xcodebuild test | 179 | 0 | 3.4 h | 1.8% | 3.4 h | 68 s | 24k | 0.0% | 4.6M | 0.1% | 191k | 0.2% |
| serial.py lock: cargo check | 818 | 5 | 3.3 h | 1.7% | 3.3 h | 15 s | 119k | 0.1% | 24.4M | 0.3% | 667k | 0.7% |
| cargo check | 1110 | 9 | 2.8 h | 1.5% | 2.8 h | 9 s | 136k | 0.1% | 18.5M | 0.2% | 800k | 0.9% |
| ssh | 2024 | 74 | 2.8 h | 1.5% | 2.8 h | 5 s | 460k | 0.5% | 61.1M | 0.7% | 1.4M | 1.5% |
| gh run | 127 | 5 | 2.6 h | 1.4% | 2.6 h | 74 s | 23k | 0.0% | 1.4M | 0.0% | 31k | 0.0% |
| xcodebuild build | 492 | 4 | 2.6 h | 1.4% | 2.5 h | 19 s | 53k | 0.1% | 10.1M | 0.1% | 534k | 0.6% |
| serial.py lock: cargo clippy | 425 | 1 | 2.5 h | 1.3% | 2.5 h | 21 s | 55k | 0.1% | 6.0M | 0.1% | 263k | 0.3% |
| serial.py lock: cargo build | 467 | 2 | 2.5 h | 1.3% | 2.5 h | 19 s | 72k | 0.1% | 17.4M | 0.2% | 534k | 0.6% |
| script record-features.sh | 145 | 9 | 2.3 h | 1.2% | 2.3 h | 58 s | 23k | 0.0% | 1.9M | 0.0% | 84k | 0.1% |
| script loop | 192 | 2 | 2.2 h | 1.2% | 2.2 h | 42 s | 71k | 0.1% | 9.3M | 0.1% | 78k | 0.1% |
| perl -c/-e one-liner | 84 | 1 | 2.2 h | 1.2% | 2.2 h | 95 s | 13k | 0.0% | 1.2M | 0.0% | 34k | 0.0% |
| serial.py lock: xcodebuild build | 229 | 3 | 2.1 h | 1.1% | 2.1 h | 33 s | 19k | 0.0% | 3.5M | 0.0% | 205k | 0.2% |
| bun run build | 277 | 21 | 2.1 h | 1.1% | 2.1 h | 28 s | 51k | 0.1% | 4.7M | 0.1% | 146k | 0.2% |
| cargo clippy | 426 | 2 | 2.1 h | 1.1% | 2.1 h | 18 s | 64k | 0.1% | 2.8M | 0.0% | 134k | 0.1% |
| serial.py lock: xcodebuild test | 38 | 2 | 2.1 h | 1.1% | 2.1 h | 195 s | 6k | 0.0% | 1.2M | 0.0% | 38k | 0.0% |
| serial.py lock: script loop | 60 | 1 | 1.8 h | 0.9% | 1.8 h | 109 s | 19k | 0.0% | 2.8M | 0.0% | 29k | 0.0% |
| tail | 1345 | 33 | 1.7 h | 0.9% | 1.7 h | 5 s | 397k | 0.4% | 52.0M | 0.6% | 503k | 0.5% |
| xcrun devicectl device | 505 | 14 | 1.4 h | 0.7% | 1.4 h | 10 s | 113k | 0.1% | 23.7M | 0.3% | 274k | 0.3% |
| swift test | 157 | 1 | 1.4 h | 0.7% | 1.4 h | 31 s | 32k | 0.0% | 7.1M | 0.1% | 167k | 0.2% |
| serial.py lock: script macbook.sh | 85 | 0 | 1.4 h | 0.7% | 1.4 h | 58 s | 20k | 0.0% | 3.1M | 0.0% | 33k | 0.0% |
| git checkout | 370 | 10 | 1.3 h | 0.7% | 1.3 h | 13 s | 60k | 0.1% | 10.0M | 0.1% | 239k | 0.3% |
| serial.py lock: cargo fmt | 296 | 2 | 1.3 h | 0.7% | 1.3 h | 16 s | 40k | 0.0% | 5.9M | 0.1% | 148k | 0.2% |
| cargo build | 251 | 3 | 1.3 h | 0.7% | 1.3 h | 19 s | 37k | 0.0% | 2.1M | 0.0% | 210k | 0.2% |
| script macbook.sh | 180 | 0 | 1.2 h | 0.6% | 1.2 h | 24 s | 54k | 0.1% | 12.6M | 0.2% | 66k | 0.1% |
| python3 file apple-test.py | 90 | 1 | 1.2 h | 0.6% | 1.2 h | 48 s | 11k | 0.0% | 3.4M | 0.0% | 60k | 0.1% |
| python3 file phone-rig.py | 102 | 0 | 1.2 h | 0.6% | 1.2 h | 42 s | 22k | 0.0% | 4.7M | 0.1% | 40k | 0.0% |
| serial.py lock: swift build | 110 | 2 | 1.1 h | 0.6% | 1.1 h | 36 s | 10k | 0.0% | 1.1M | 0.0% | 89k | 0.1% |
| script pr-build-links.sh | 32 | 3 | 1.1 h | 0.6% | 1.1 h | 120 s | 5k | 0.0% | 541k | 0.0% | 10k | 0.0% |
| git log | 2313 | 74 | 1.0 h | 0.5% | 1.0 h | 2 s | 1.1M | 1.2% | 131.8M | 1.6% | 1.4M | 1.5% |
| gh pr | 539 | 17 | 1.0 h | 0.5% | 1.0 h | 7 s | 74k | 0.1% | 8.0M | 0.1% | 228k | 0.2% |
| script demo-video.sh | 236 | 15 | 1.0 h | 0.5% | 0.9 h | 15 s | 37k | 0.0% | 4.9M | 0.1% | 143k | 0.2% |

### What fills the context (by tokens re-read)

| name | calls | result tok | avg per call | re-read in context | share |
|---|---:|---:|---:|---:|---:|
| sed -n (read) | 32814 | 42.6M | 1k | 3.50B | 32.7% |
| Read | 9028 | 24.6M | 3k | 1.77B | 16.5% |
| grep | 26519 | 11.9M | 448 | 1.36B | 12.7% |
| cat | 5203 | 9.2M | 2k | 828.9M | 7.7% |
| python3 inline script | 9233 | 1.8M | 193 | 263.4M | 2.5% |
| ls | 4596 | 2.3M | 495 | 227.0M | 2.1% |
| git diff | 3887 | 2.5M | 640 | 220.8M | 2.1% |
| rg | 9971 | 6.6M | 662 | 134.3M | 1.3% |
| git log | 2313 | 1.1M | 479 | 131.8M | 1.2% |
| wc | 1409 | 1.6M | 1k | 124.4M | 1.2% |
| python3 -c/-e one-liner | 2490 | 893k | 358 | 116.6M | 1.1% |
| git show | 1538 | 1.2M | 798 | 97.8M | 0.9% |
| Agent | 903 | 494k | 547 | 96.0M | 0.9% |
| SendMessage | 6827 | 440k | 64 | 95.1M | 0.9% |
| git status | 1707 | 625k | 365 | 83.3M | 0.8% |

Tool calls per API call (3 = 3 or more): 0: 8621, 1: 147637, 2: 11550, 3: 2446

### Context size per API call

| context | calls | share | cache-read tokens | share | avg wait per call |
|---|---:|---:|---:|---:|---:|
| <50k | 5368 | 3.2% | 146.9M | 0.3% | 27.3 s |
| 50-100k | 34533 | 20.3% | 2.47B | 5.9% | 7.6 s |
| 100-150k | 25703 | 15.1% | 3.11B | 7.4% | 8.7 s |
| 150-200k | 21292 | 12.5% | 3.66B | 8.7% | 8.6 s |
| 200-300k | 31896 | 18.7% | 7.76B | 18.5% | 8.7 s |
| 300-500k | 32754 | 19.2% | 12.53B | 29.8% | 8.2 s |
| 500k+ | 18708 | 11.0% | 12.33B | 29.3% | 8.3 s |

Context at the first API call (system prompt, tools, rules), median: main 53k, subagent 48k

Wait on the model per API call: <10 s 135621, 10-60 s 33163, 1-5 min 1455, 5-30 min 10, 30 min-2 h 0, >2 h 5

### Compactions

- 36 compactions (24 auto, 12 manual); median context before: 967k; time spent compacting: 0.8 h

### Errors by kind

| kind | count |
|---|---:|
| shell non-zero exit: read/search | 908 |
| shell non-zero exit: run | 440 |
| shell non-zero exit: git | 403 |
| shell non-zero exit: wait | 279 |
| file or path missing | 237 |
| shell non-zero exit: check | 123 |
| shell non-zero exit: build | 93 |
| denied by user or permission | 83 |
| shell non-zero exit: edit (shell) | 74 |
| shell non-zero exit: network | 72 |
| shell non-zero exit: video | 61 |
| input validation | 49 |
| shell non-zero exit: gh | 47 |
| shell non-zero exit: test | 44 |
| shell non-zero exit: process | 40 |
| other error: StructuredOutput | 35 |
| other error: TaskStop | 29 |
| timed out | 29 |
| other error: Edit | 28 |
| other error: mcp:supermanager | 25 |
| other error: mcp:playwright | 21 |
| shell non-zero exit: other | 19 |
| shell non-zero exit: device | 18 |
| other error: SendMessage | 15 |
| edit: file changed since read | 13 |

### Mistakes, repeats and waits

| measure | value |
|---|---:|
| Bash calls stopped at the 10-min cap | 134 |
| api errors | 102 |
| build runs | 3349 |
| check runs | 7293 |
| edit undoing an earlier edit | 8 |
| failed build runs before a green one | 511 |
| failed build runs hidden by a pipe (exit 0) | 450 |
| failed check runs before a green one | 1605 |
| failed check runs hidden by a pipe (exit 0) | 1566 |
| failed test runs before a green one | 976 |
| failed test runs hidden by a pipe (exit 0) | 1002 |
| file edits | 8209 |
| files edited 5+ times in one session | 315 |
| git undo: checkout | 221 |
| git undo: reset | 19 |
| git undo: restore | 6 |
| git undo: revert | 8 |
| git undo: stash | 146 |
| human prompts | 4047 |
| human prompts that read as a correction | 619 |
| re-read tokens | 430k |
| re-read, file unchanged | 350 |
| repeated failing signatures | 8 |
| same call failed again | 8 |
| shell sleep seconds asked | 92961 |
| shell sleeps | 3380 |
| test runs | 4125 |
| tool denials | 112 |
| user interruptions | 90 |

Failed build/test/check runs in a row before the next green one (6 = 6 or more): 1: 1425, 2: 408, 3: 127, 4: 55, 5: 20, 6: 21

Calls that failed again with the same input, by command: mcp__claude-in-chrome__tabs_context_mcp 1, mcp__supermanager__complete_task 1, mcp__plugin_playwright_playwright__browser_navigate 1, cargo check 1, cargo fmt 1, TaskStop 1, script open-pr.sh 1, Read 1

Waits before a prompt or notice: <10 s 5033, 10-60 s 1722, 1-5 min 1782, 5-30 min 1033, 30 min-2 h 145, >2 h 76

### Longest single calls

| seconds | tool | general form | kind | date |
|---:|---|---|---|---|
| 1758 | Bash | clang | main | 2026-09-06 |
| 768 | Bash | cargo build | subagent | 2026-09-07 |
| 601 | Bash | gh run | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | tail | subagent | 2026-10-04 |
| 601 | Bash | npx playwright | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-05 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | sleep | subagent | 2026-10-04 |
| 601 | Bash | script record-features.sh | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-04 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | sleep | subagent | 2026-10-06 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-05 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-06 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-06 |
| 601 | Bash | perl -c/-e one-liner | subagent | 2026-10-06 |

### Biggest main sessions (by output tokens)

| session | date | span | API calls | tool calls | peak context | compactions | output | cache read | cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 3bb58ee1 | 2026-09-30 | 33.0 h | 2539 | 2576 | 967k | 4 | 2.2M | 1.28B | $363 |
| 3a42d21c | 2026-09-22 | 25.4 h | 1447 | 1466 | 966k | 2 | 1.4M | 709.4M | $229 |
| 1d5905c6 | 2026-10-01 | 22.6 h | 1140 | 1224 | 966k | 2 | 1.1M | 549.9M | $170 |
| c52c135f | 2026-09-23 | 46.5 h | 1168 | 1136 | 965k | 2 | 1.1M | 578.8M | $71 |
| f91f5ef7 | 2026-09-16 | 13.2 h | 1158 | 1199 | 966k | 1 | 756k | 598.1M | $383 |
| 257f3021 | 2026-09-22 | 17.0 h | 672 | 675 | 966k | 1 | 661k | 319.3M | $106 |
| 3f027c0f | 2026-09-09 | 11.8 h | 446 | 431 | 733k | 1 | 646k | 145.4M | - |
| 7378cc3b | 2026-09-10 | 16.6 h | 996 | 995 | 769k | 1 | 528k | 385.6M | - |
| b00caf99 | 2026-10-02 | 15.9 h | 1667 | 813 | 925k | 1 | 525k | 796.7M | $1445 |
| d0ddb020 | 2026-09-21 | 6.2 h | 515 | 487 | 850k | 0 | 514k | 260.2M | $161 |
