#!/usr/bin/env python3
"""Measures where time and tokens go in Claude Code session transcripts (T-095).
Run it to redo the analysis: python3 -I analyse.py [--out DIR] [PROJECT ...]

Reads ~/.claude/projects/-Users-iosif-Documents-Projects-<PROJECT>* (worktree and
scratchpad folders of the project included), main sessions and subagents, read-only.
Writes DIR/tables.md (and DIR/stats.json with --json): tool names, commands in general form
(program + subcommand) and numbers only, never command text or file contents.
"""
import argparse
import collections
import glob
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECTS_DIR = os.path.expanduser('~/.claude/projects')
DEFAULT_PROJECTS = ['church-hub', 'best-remote-desktop']
AWAY_SECONDS = 30 * 60
CONTEXT_BUCKETS = [50e3, 100e3, 150e3, 200e3, 300e3, 500e3, float('inf')]
IMAGE_TOKENS = 1600
LONG_CALLS_KEPT = 40

# ---------- small helpers ----------

def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()


def digest(*parts):
    return hashlib.md5('\x00'.join(map(str, parts)).encode('utf-8', 'replace')).hexdigest()[:16]


def est_tokens(content):
    """Tokens a tool result puts into the context, estimated (4 chars a token, images flat)."""
    if content is None:
        return 0
    if isinstance(content, str):
        return len(content) // 4
    total = 0
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get('type') == 'image':
            total += IMAGE_TOKENS
        elif block.get('type') == 'text':
            total += len(block.get('text', '')) // 4
        else:
            total += len(json.dumps(block)) // 4
    return total


def result_text(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ' '.join(b.get('text', '') for b in content if isinstance(b, dict))
    return ''


def bucket_of(value, edges):
    for i, edge in enumerate(edges):
        if value < edge:
            return i
    return len(edges) - 1


# ---------- general form of a command ----------

PREFIXES = {'sudo', 'time', 'env', 'nohup', 'exec', 'command', 'then', 'do', 'else', 'if',
            'while', 'until', '!', '(', '{', 'xargs', 'caffeinate', 'arch'}
SUBCOMMAND_PROGRAMS = {'git', 'gh', 'npm', 'pnpm', 'yarn', 'bun', 'npx', 'swift', 'cargo', 'xcrun',
                       'docker', 'adb', 'flutter', 'go', 'brew', 'pip', 'pip3', 'uv', 'claude',
                       'launchctl', 'defaults', 'tmux', 'gcloud', 'wrangler', 'kubectl', 'pod',
                       'make', 'just', 'tauri', 'expo', 'eas', 'fastlane', 'bundle'}
LOCK_WRAPPERS = {'serial.py'}  # run the command after -- once a shared build lock is free
SAFE_WORD = re.compile(r'^[a-z][a-z0-9:._-]{0,30}$')
SPLIT = re.compile(r'\s*(?:&&|\|\||;|\||\n|\$\(|`)\s*')

READ_PROGRAMS = {'grep', 'rg', 'find', 'ls', 'cat', 'head', 'tail', 'sed', 'awk', 'wc', 'jq', 'tree',
                 'file', 'stat', 'du', 'diff', 'sort', 'uniq', 'cut', 'tr', 'xxd', 'strings', 'less',
                 'echo', 'printf', 'pwd', 'which', 'realpath', 'basename', 'dirname', 'cd', 'test',
                 'otool', 'nm', 'plutil', 'md5', 'shasum', 'date', 'fd', 'bat', 'column', 'tee', 'true'}
PROCESS_PROGRAMS = {'ps', 'pkill', 'kill', 'killall', 'pgrep', 'lsof', 'top', 'vm_stat', 'log', 'pmset'}
NETWORK_PROGRAMS = {'curl', 'wget', 'nc', 'ping', 'ssh', 'scp', 'rsync', 'dig', 'nslookup', 'websocat'}
RUN_PROGRAMS = {'python', 'python3', 'node', 'deno', 'ruby', 'bash', 'sh', 'zsh', 'osascript', 'open',
                'perl', 'swift-frontend'}
VIDEO_WORDS = re.compile(r'ffmpeg|ffprobe|screencapture|video|record|kokoro|^say$|poster|gif', re.I)
CATEGORY_PRIORITY = ['test', 'build', 'check', 'device', 'video', 'package', 'wait', 'gh', 'git',
                     'network', 'process', 'run', 'edit (shell)', 'read/search', 'other']


def segment_label(tokens):
    """(program label, category) of one simple command."""
    while tokens:
        word = tokens[0]
        if word == 'timeout' or word == 'gtimeout':
            tokens = tokens[2:]
        elif word in PREFIXES or re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', word):
            tokens = tokens[1:]
        else:
            break
    if not tokens or tokens[0] in ('Q', '<<HEREDOC') or not re.match(r'^[\w./~$-]', tokens[0]):
        return None
    program = os.path.basename(tokens[0].strip('()\'"{}')) or tokens[0]
    args = [t for t in tokens[1:] if not t.startswith('-')]
    sub = args[0] if args and SAFE_WORD.match(args[0]) else ''
    if program in ('python', 'python3') and len(tokens) > 2 and tokens[1] == '-m':
        program, sub = 'python -m', tokens[2] if SAFE_WORD.match(tokens[2]) else ''
    rest = ' '.join(tokens[1:])

    if program in ('bash', 'sh', 'zsh') and args and args[0].endswith('.sh'):
        program, sub = 'script', os.path.basename(args[0])
    elif program.endswith('.sh') or program.endswith('.py') or tokens[0].startswith('./'):
        program, sub = 'script', program
    if program in ('npm', 'pnpm', 'yarn', 'bun') and sub == 'run' and len(args) > 1:
        sub = 'run ' + (args[1] if SAFE_WORD.match(args[1]) else '?')
    if program == 'xcrun' and len(args) > 1:
        sub = args[0] + ' ' + (args[1] if SAFE_WORD.match(args[1]) else '')
    if program == 'xcodebuild':
        sub = 'test' if re.search(r'\btest(-without-building)?\b', rest) else 'build'
    if program == 'claude':
        sub = '-p' if ' -p' in ' ' + rest or '--print' in rest else sub
    if program in ('python', 'python3', 'node', 'bun', 'ruby', 'perl') and program == tokens[0].split('/')[-1]:
        scripts = [a for a in args if re.search(r'\.(py|js|ts|mjs|rb|pl)$', a)]
        if '<<HEREDOC' in tokens or tokens[1:2] == ['-']:
            program, sub = program + ' inline script', ''
        elif '-c' in tokens or '-e' in tokens:
            program, sub = program + ' -c/-e one-liner', ''
        elif scripts:
            program, sub = program + ' file', os.path.basename(scripts[0])
            if sub in LOCK_WRAPPERS and '--' in tokens:
                inner = segment_label(tokens[tokens.index('--') + 1:])
                if inner:
                    return sub + ' lock: ' + inner[0], inner[1]
    if program == 'sed':
        program = 'sed -i (edit)' if any(t.startswith('-i') for t in tokens) else 'sed -n (read)' \
            if '-n' in tokens else 'sed'
    if program == 'cat' and '<<HEREDOC' in tokens:
        program = 'cat heredoc (write)'
    label = (program + ' ' + sub).strip() if (program in SUBCOMMAND_PROGRAMS or program in (
        'script', 'xcodebuild', 'python -m') or program.endswith(' file')) else program
    return label, categorise(program, sub, rest)


def categorise(program, sub, rest):
    words = (program + ' ' + sub).lower()
    if re.search(r'\b(pytest|vitest|jest|bats|mocha)\b', words) or re.search(
            r'(^|\s)(test|tests|e2e|test:\S*)$', sub) or 'xcodebuild test' in words or (
            (program == 'script' or program.endswith(' file')) and re.search(r'test|e2e', sub)) or (program == 'playwright' and sub == 'test'):
        return 'test'
    if re.search(r'lint|typecheck|clippy|fmt|format|eslint|prettier|swiftlint|check', words) or program in (
            'eslint', 'prettier', 'swiftlint', 'shellcheck', 'ruff', 'mypy'):
        return 'check'
    if program in ('xcodebuild', 'tsc', 'swiftc', 'clang', 'cmake', 'ninja', 'gradle', 'gradlew', 'make',
                   'vite', 'webpack', 'esbuild', 'codesign', 'notarytool', 'ditto', 'lipo') or re.search(
            r'\b(build|assemble|archive|bundle|compile|install(Debug|Release)?)\b', sub) or (
            program == 'script' and re.search(r'build|bundle|package', sub)):
        if not (program in ('npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'brew', 'pod') and sub == 'install'):
            return 'build'
    if program in ('adb', 'emulator', 'idb', 'ios-deploy', 'maestro') or re.search(
            r'simctl|devicectl', words) or (program == 'open' and 'Simulator' in rest):
        return 'device'
    if VIDEO_WORDS.search(words):
        return 'video'
    if program in ('npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'brew', 'pod', 'uv') and sub in (
            'install', 'i', 'ci', 'add', 'update', 'upgrade', 'sync') or 'package resolve' in words:
        return 'package'
    if program in ('sleep', 'wait'):
        return 'wait'
    if program == 'gh':
        return 'gh'
    if program == 'git':
        return 'git'
    if program in NETWORK_PROGRAMS:
        return 'network'
    if program in PROCESS_PROGRAMS:
        return 'process'
    if program.endswith(('inline script', 'one-liner', ' file')) or program.startswith('sed') or \
            program == 'cat heredoc (write)':
        return 'read/search' if program == 'sed -n (read)' else 'run' if not program.startswith(
            ('sed', 'cat')) else 'edit (shell)'
    if program in RUN_PROGRAMS or program in ('script', 'python -m', 'npx', 'claude') or program in (
            'npm', 'pnpm', 'yarn', 'bun', 'cargo', 'swift', 'go', 'docker', 'tmux'):
        return 'run'
    if program in READ_PROGRAMS:
        return 'read/search'
    return 'other'


HEREDOC = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n.*?\n\s*\1\b", re.S)
QUOTED = re.compile(r'"(?:[^"\\]|\\.)*"|\'[^\']*\'', re.S)
PERL_TIMEOUT = re.compile(r"\bperl\s+-e\s+Q\s+")
TRIVIAL = {'cd', 'echo', 'printf', 'true', 'pwd', 'set', 'export', 'source', '.', 'exit', 'fi', 'done',
           'unset', 'local', 'return', 'trap', 'shift', 'read', 'test', '[', '[['}


def without_bodies(command):
    """The command with heredoc bodies and quoted strings blanked, so only programs remain."""
    command = HEREDOC.sub('<<HEREDOC', command)
    command = QUOTED.sub('Q', command)
    return PERL_TIMEOUT.sub('', command)  # perl -e 'alarm N; exec @ARGV' is a timeout wrapper


def classify_bash(command):
    """General form of a shell command: (label, category), the most telling part of a pipeline."""
    best = None
    for segment in SPLIT.split(without_bodies(command or '')):
        words = segment.split()
        if words and words[0] in TRIVIAL and len(SPLIT.split(command)) > 1:
            continue
        found = segment_label(words)
        if not found:
            continue
        rank = CATEGORY_PRIORITY.index(found[1])
        if best is None or rank < best[0]:
            best = (rank, found)
    return best[1] if best else ('(empty)', 'other')


def tool_group(name):
    if name.startswith('mcp__'):
        parts = name.split('__')
        server = parts[1] if len(parts) > 1 else name
        if server.startswith('plugin_'):
            server = server.split('_', 2)[-1]
        return 'mcp:' + server
    return name


def tool_label(name, tool_input):
    """(label, category) for any tool call; Bash in general form."""
    if name == 'Bash':
        label, category = classify_bash(tool_input.get('command', ''))
        if tool_input.get('run_in_background'):
            label += ' (background)'
        return label, category
    if name in ('Agent', 'Task'):
        kind = tool_input.get('subagent_type') or 'general'
        return name + ' ' + (kind if SAFE_WORD.match(kind.lower().replace(':', '-')) else '?'), 'agent'
    if name == 'AskUserQuestion':
        return name, 'asking the user'
    if name == 'Skill':
        return 'Skill ' + str(tool_input.get('skill', ''))[:40], 'skill'
    return name, tool_group(name)


ERROR_PATTERNS = [
    ('edit: text to replace not found', r'String to replace not found|old_string.*not found'),
    ('edit: file not read first', r'has not been read yet|must read|Read it first'),
    ('edit: file changed since read', r'modified since (it was )?read|has been modified'),
    ('edit: several matches', r'Found \d+ matches'),
    ('denied by user or permission', r"doesn't want to proceed|was rejected|denied|Permission to use|not allowed"),
    ('interrupted', r'[Ii]nterrupted'),
    ('cancelled with a sibling call', r'[Ss]ibling tool call|[Cc]ancelled'),
    ('input validation', r'InputValidationError|Invalid input|invalid_type|required parameter'),
    ('timed out', r'timed out|[Tt]imeout'),
    ('file or path missing', r'No such file|does not exist|ENOENT|not found: /|File not found'),
    ('command not found', r'command not found'),
    ('file too large to read', r'exceeds maximum allowed|too large|maximum allowed tokens'),
    ('tool not loaded', r'not available|No such tool|Unknown tool|deferred'),
]


def error_kind(name, category, text):
    for kind, pattern in ERROR_PATTERNS:
        if re.search(pattern, text[:600]):
            return kind
    if name == 'Bash':
        return 'shell non-zero exit: ' + category
    return 'other error: ' + tool_group(name)


FAILED_OUTPUT = re.compile(r'error(\[E\d+\])?: |BUILD FAILED|\*\* (TEST|BUILD) FAILED|test result: FAILED|'
                           r'\b[1-9]\d* fail(ed|ing|ures?)\b|^FAIL\b|Tests? failed|'
                           r'error TS\d+|panicked at|Traceback \(most recent', re.M)
CORRECTION = re.compile(r"\b(still|doesn'?t|does not|didn'?t|did not|not working|isn'?t|wrong|broken|again|"
                        r"revert|undo|stop|nope|instead)\b|^no\b", re.I)


# ---------- one transcript ----------

def new_tool_stats():
    return {'count': 0, 'errors': 0, 'duration': 0.0, 'wall': 0.0, 'result_tokens': 0,
            'output_tokens': 0.0, 'carried_tokens': 0.0}


def human_prompt(record):
    origin = record.get('origin') or {}
    if origin:
        return origin.get('kind') == 'human'
    if record.get('isMeta') or record.get('isSidechain'):
        return False
    content = record['message'].get('content')
    if isinstance(content, list):
        if any(b.get('type') == 'tool_result' for b in content if isinstance(b, dict)):
            return False
        content = result_text(content)
    return bool(content) and not content.lstrip().startswith(('<', '[SYSTEM', 'Caveat'))


def user_text(record):
    content = record['message'].get('content')
    if isinstance(content, list):
        return result_text([b for b in content if isinstance(b, dict) and b.get('type') == 'text'])
    return content or ''


def parse_file(job):
    path, project = job
    kind = 'subagent' if '/subagents/' in path else 'main'
    events = []          # (time, order, kind, payload)
    calls = {}           # tool_use id -> call info
    messages = {}        # message id -> api call info
    message_order = []
    compactions = []
    turn_ms = 0
    cost = None
    interruptions = denials = api_errors = corrections = humans = 0
    order = 0
    try:
        handle = open(path, encoding='utf-8', errors='replace')
    except OSError:
        return None
    with handle:
        for line in handle:
            if not ('"type":"assistant"' in line or '"type":"user"' in line or '"subtype":"compact_boundary"'
                    in line or '"subtype":"turn_duration"' in line or '"type":"cost-state"' in line):
                continue
            try:
                record = json.loads(line)
            except ValueError:
                continue
            rtype = record.get('type')
            order += 1
            if rtype == 'cost-state':
                cost = {k: record.get(k) for k in ('totalCostUSD', 'totalAPIDuration', 'totalToolDuration',
                                                    'totalDuration', 'totalLinesAdded', 'totalLinesRemoved')}
                continue
            if 'timestamp' not in record:
                continue
            t = ts(record['timestamp'])
            if rtype == 'system':
                if record.get('subtype') == 'compact_boundary':
                    meta = record.get('compactMetadata') or {}
                    compactions.append({'trigger': meta.get('trigger'), 'pre': meta.get('preTokens') or 0,
                                        'ms': meta.get('durationMs') or 0, 'at_call': len(message_order), 't': t})
                    events.append((t, order, 'compact', None))
                elif record.get('subtype') == 'turn_duration':
                    turn_ms += record.get('durationMs') or 0
                continue
            message = record.get('message') or {}
            if rtype == 'assistant':
                if record.get('isApiErrorMessage'):
                    api_errors += 1
                mid = message.get('id') or record.get('requestId') or record.get('uuid')
                usage = message.get('usage') or {}
                info = messages.get(mid)
                if info is None:
                    info = messages[mid] = {'t0': t, 't1': t, 'usage': usage, 'tools': [],
                                            'thinking_ms': 0, 'index': len(message_order)}
                    message_order.append(mid)
                info['t1'] = t
                if (usage.get('output_tokens') or 0) >= (info['usage'].get('output_tokens') or 0):
                    info['usage'] = usage
                info['thinking_ms'] += record.get('thinkingDurationMs') or 0
                events.append((t, order, 'assistant', mid))
                for block in message.get('content') or []:
                    if isinstance(block, dict) and block.get('type') == 'tool_use':
                        tool_input = block.get('input') or {}
                        name = block.get('name', '?')
                        label, category = tool_label(name, tool_input)
                        calls[block['id']] = {'name': name, 'label': label, 'category': category, 't0': t,
                                              'input': tool_input, 'message': mid, 'order': order,
                                              'async': bool(tool_input.get('run_in_background'))}
                        info['tools'].append(block['id'])
                        events.append((t, order, 'tool_use', block['id']))
                continue
            if rtype != 'user':
                continue
            content = message.get('content')
            results = [b for b in content if isinstance(b, dict) and b.get('type') == 'tool_result'] \
                if isinstance(content, list) else []
            for block in results:
                call = calls.get(block.get('tool_use_id'))
                if call is None or 't1' in call:
                    continue
                text = result_text(block.get('content'))
                call.update(t1=t, error=bool(block.get('is_error')), tokens=est_tokens(block.get('content')),
                            after_call=len(message_order), text=text[:600] + '\n' + text[-1500:])
                if record.get('toolDenialKind'):
                    denials += 1
                events.append((t, order, 'tool_result', block['tool_use_id']))
            if results:
                continue
            text = user_text(record)
            if '[Request interrupted by user' in text:
                interruptions += 1
            if human_prompt(record):
                humans += 1
                if CORRECTION.search(text[:400]):
                    corrections += 1
                events.append((t, order, 'human', None))
            else:
                events.append((t, order, 'notice', None))

    if not messages:
        return None
    return summarise(path, project, kind, events, calls, messages, message_order, compactions, turn_ms, cost,
                     interruptions, denials, api_errors, corrections, humans)


def summarise(path, project, kind, events, calls, messages, message_order, compactions, turn_ms, cost,
              interruptions, denials, api_errors, corrections, humans):
    out = empty_total()
    out.update(project=project, kind=kind, files=1, sessions_main=int(kind == 'main'))

    # wall clock, partitioned: each gap between events goes to what was running in it
    events.sort(key=lambda e: (e[0], e[1]))
    pending = set()
    model_gaps = {}  # message id -> seconds the session waited on that API call
    for (t, _, ekind, payload), (t_next, _, next_kind, next_payload) in zip(
            events, events[1:] + [(events[-1][0], 0, 'end', None)]):
        if ekind == 'tool_use':
            pending.add(payload)
        elif ekind == 'tool_result':
            pending.discard(payload)
        gap = max(0.0, t_next - t)
        running = [c for c in pending if not calls[c]['async'] and 't1' in calls[c]]
        asking = [c for c in running if calls[c]['name'] == 'AskUserQuestion']
        if asking and len(asking) == len(running):
            out['wall']['waiting on user (questions)'] += gap
            for c in running:
                calls[c]['wall'] = calls[c].get('wall', 0.0) + gap / len(running)
        elif running:
            for c in running:
                calls[c]['wall'] = calls[c].get('wall', 0.0) + gap / len(running)
            out['wall']['tools'] += gap
        elif next_kind == 'assistant':
            out['wall']['model'] += gap
            model_gaps[next_payload] = model_gaps.get(next_payload, 0.0) + gap
        elif next_kind == 'human':
            out['wall']['waiting on user' if gap < AWAY_SECONDS else 'user away (>30 min)'] += gap
            out['gaps'][gap_bucket(gap)] += 1
        elif next_kind == 'notice':
            out['wall']['waiting on background or teammates'] += gap
            out['gaps'][gap_bucket(gap)] += 1
        elif next_kind == 'compact':
            out['wall']['compacting'] += gap
        elif next_kind != 'end':
            out['wall']['other'] += gap
    span = events[-1][0] - events[0][0]
    out['wall']['span'] += span

    # api calls: tokens, context size, and how long each tool result stays in context
    segment_ends = [c['at_call'] for c in compactions] + [len(message_order)]
    for mid in message_order:
        info = messages[mid]
        usage = info['usage']
        fresh = usage.get('input_tokens') or 0
        created = usage.get('cache_creation_input_tokens') or 0
        read = usage.get('cache_read_input_tokens') or 0
        context = fresh + created + read
        output = usage.get('output_tokens') or 0
        out['api'].update({'calls': 1, 'input_fresh': fresh, 'cache_write': created, 'cache_read': read,
                           'output': output, 'thinking_ms': info['thinking_ms']})
        out['api']['peak_context'] = max(out['api']['peak_context'], context)
        b = bucket_of(context, CONTEXT_BUCKETS)
        out['context_calls'][b] += 1
        out['context_cache_read'][b] += read
        out['context_model_seconds'][b] += model_gaps.get(mid, 0.0)
        out['model_waits'][gap_bucket(model_gaps.get(mid, 0.0))] += 1
        out['tools_per_call'][min(len(info['tools']), 3)] += 1
        share = output / len(info['tools']) if info['tools'] else 0
        for c in info['tools']:
            calls[c]['output_share'] = share
        if not info['tools']:
            out['api']['output_text_only'] += output
    for comp in compactions:
        out['compactions'].append({'trigger': comp['trigger'], 'pre': comp['pre'], 'ms': comp['ms'],
                                   'project': project})

    # per call: time, tokens, failures, repeats
    session = os.path.basename(path)[:8]
    fail_signatures = collections.Counter()
    seen_reads = {}
    edits_by_file = collections.defaultdict(list)
    edit_counts = collections.Counter()
    file_version = collections.Counter()
    streak = collections.Counter()
    for cid, call in sorted(calls.items(), key=lambda kv: kv[1]['order']):
        name, label, category = call['name'], call['label'], call['category']
        duration = (call['t1'] - call['t0']) if 't1' in call else 0.0
        tokens = call.get('tokens', 0)
        if 'after_call' in call:
            end = next(e for e in segment_ends if e >= call['after_call'])
            carried = tokens * max(0, end - call['after_call'])
        else:
            carried = 0
        error = call.get('error', False)
        for table, key in (('tools', name), ('labels', label if name == 'Bash' else name),
                           ('categories', category), ('groups', tool_group(name))):
            s = out[table][key]
            s['count'] += 1
            s['errors'] += int(error)
            s['duration'] += duration
            s['wall'] += call.get('wall', 0.0)
            s['result_tokens'] += tokens
            s['output_tokens'] += call.get('output_share', 0)
            s['carried_tokens'] += carried
        if name == 'Bash' and duration >= 595 and not call['async']:
            out['mistakes']['Bash calls stopped at the 10-min cap'] += 1
        if duration >= 60 and category != 'asking the user' and name != 'ExitPlanMode':
            out['long_calls'].append({'seconds': round(duration), 'tool': name, 'label': label,
                                      'project': project, 'kind': kind, 'async': call['async'],
                                      'date': datetime.utcfromtimestamp(call['t0']).strftime('%Y-%m-%d')})
        tool_input = call['input']
        signature = digest(name, json.dumps(tool_input, sort_keys=True, default=str))
        if error:
            out['errors'][error_kind(name, category, call.get('text', ''))] += 1
            fail_signatures[signature] += 1
            if fail_signatures[signature] >= 2:
                out['mistakes']['same call failed again'] += 1
                out['repeat_fail_labels'][label] += 1

        # build / test / check runs until green
        if name == 'Bash' and category in ('build', 'test', 'check') and not call['async'] and 't1' in call:
            key = category
            failed = error or bool(FAILED_OUTPUT.search(call.get('text', '')))
            if failed and not error:
                out['mistakes']['failed %s runs hidden by a pipe (exit 0)' % key] += 1
            if failed:
                streak[key] += 1
            else:
                if streak[key]:
                    out['fix_streaks'][min(streak[key], 6)] += 1
                    out['mistakes']['failed %s runs before a green one' % key] += streak[key]
                streak[key] = 0
            out['mistakes'][category + ' runs'] += 1

        # reads of a file that did not change since the same read
        if name == 'Read' and not error:
            path_ = tool_input.get('file_path', '')
            key = (path_, tool_input.get('offset'), tool_input.get('limit'))
            if key in seen_reads and seen_reads[key] == file_version[path_]:
                out['mistakes']['re-read, file unchanged'] += 1
                out['mistakes']['re-read tokens'] += tokens
                out['reread_labels']['Read'] += 1
            seen_reads[key] = file_version[path_]

        # edits: churn and edits that undo an earlier one
        if name in ('Edit', 'MultiEdit', 'Write') and not error:
            path_ = tool_input.get('file_path', '')
            file_version[path_] += 1
            edit_counts[path_] += 1
            pairs = [(e.get('old_string', ''), e.get('new_string', '')) for e in tool_input.get('edits', [])] \
                if name == 'MultiEdit' else [(tool_input.get('old_string', ''), tool_input.get('new_string', ''))]
            if name == 'Write':
                pairs = []
            history = edits_by_file[path_]
            for old, new in pairs:
                h_old, h_new = digest(old), digest(new)
                if (h_new, h_old) in history:
                    out['mistakes']['edit undoing an earlier edit'] += 1
                history.append((h_old, h_new))
            out['mistakes']['file edits'] += 1
        if name == 'Bash':
            command = tool_input.get('command', '')
            undo = re.search(r'git (revert|restore|checkout (\S+ )?--|reset --hard|stash( push| save)?)(\s|$)',
                             without_bodies(command))
            if undo:
                out['mistakes']['git undo: ' + undo.group(1).split()[0]] += 1
            if re.search(r'(^|[;&|]\s*)sleep\s+\d', command):
                out['mistakes']['shell sleeps'] += 1
                m = re.findall(r'sleep\s+(\d+)', command)
                out['mistakes']['shell sleep seconds asked'] += sum(int(x) for x in m)
    for path_, n in edit_counts.items():
        if n >= 5:
            out['mistakes']['files edited 5+ times in one session'] += 1
    out['mistakes']['repeated failing signatures'] += sum(1 for v in fail_signatures.values() if v >= 2)
    out['mistakes'].update({'user interruptions': interruptions, 'tool denials': denials,
                            'api errors': api_errors, 'human prompts': humans,
                            'human prompts that read as a correction': corrections})
    out['api']['turn_ms'] += turn_ms
    first_context = sum((messages[message_order[0]]['usage'].get(k) or 0) for k in (
        'input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'))
    out['api_' + kind].update(out['api'])
    out['wall_' + kind].update(out['wall'])
    out['long_calls'] = sorted(out['long_calls'], key=lambda c: -c['seconds'])[:LONG_CALLS_KEPT]
    out['sessions'].append({'id': session, 'project': project, 'kind': kind, 'span_h': round(span / 3600, 2),
                            'calls': len(message_order), 'tool_calls': len(calls),
                            'peak_context': out['api']['peak_context'], 'compactions': len(compactions),
                            'output': out['api']['output'], 'cache_read': out['api']['cache_read'],
                            'cost_usd': (cost or {}).get('totalCostUSD'), 'first_context': first_context,
                            'date': datetime.utcfromtimestamp(events[0][0]).strftime('%Y-%m-%d')})
    return out


GAP_EDGES = ((10, '<10 s'), (60, '10-60 s'), (300, '1-5 min'), (1800, '5-30 min'), (7200, '30 min-2 h'),
             (float('inf'), '>2 h'))
GAP_NAMES = [name for _, name in GAP_EDGES]


def gap_bucket(gap):
    return next(name for edge, name in GAP_EDGES if gap < edge)


def weighted(api):
    return tuple(kilo(api[k] * w) for k, w in (('input_fresh', 1), ('cache_write', 2), ('cache_read', 0.1),
                                               ('output', 5)))


def headline(t):
    """The derived numbers report.md quotes."""
    api, wm, ws = t['api'], t['wall_main'], t['wall_subagent']
    active = wm['model'] + wm['tools'] + ws['model'] + ws['tools']
    base = sum(s['first_context'] * s['calls'] for s in t['sessions'])
    spawn = sum(s['first_context'] for s in t['sessions'] if s['kind'] == 'subagent')
    carried = sum(v['carried_tokens'] for v in t['labels'].values())
    big = t['context_calls'][5] + t['context_calls'][6]
    big_read = t['context_cache_read'][5] + t['context_cache_read'][6]
    cats = t['categories']
    blocking = sum(v['wall'] for k, v in cats.items() if k not in ('asking the user', 'ExitPlanMode'))
    verify = sum(cats[k]['wall'] for k in ('build', 'test', 'check') if k in cats)
    locked = sum(v['wall'] for k, v in t['labels'].items() if ' lock: ' in k)
    runs = sum(t['mistakes'][k + ' runs'] for k in ('build', 'test', 'check'))
    failed = sum(t['mistakes']['failed %s runs before a green one' % k] for k in ('build', 'test', 'check'))
    hidden = sum(t['mistakes']['failed %s runs hidden by a pipe (exit 0)' % k] for k in ('build', 'test', 'check'))
    reads = sum(t['labels'][k]['carried_tokens'] for k in ('sed -n (read)', 'Read', 'grep', 'cat', 'rg', 'head', 'tail')
                if k in t['labels'])
    return ['### Headline', '',
            '- active agent time (model + tools, main and subagents): %s, of it waiting on the model %s' % (
                hours(active), pct(wm['model'] + ws['model'], active)),
            '- API calls with exactly one tool call: %s; with two or more: %s' % (
                pct(t['tools_per_call'][1], api['calls']), pct(t['tools_per_call'][2] + t['tools_per_call'][3], api['calls'])),
            '- API calls over 300k context: %s of calls, %s of cache reads' % (
                pct(big, api['calls']), pct(big_read, sum(t['context_cache_read'].values()))),
            '- cache reads are %s of weighted tokens' % pct(api['cache_read'] * 0.1, api['input_fresh'] + 2 * api[
                'cache_write'] + 0.1 * api['cache_read'] + 5 * api['output']),
            '- fixed prompt (first-call context x calls): %s of cache reads; subagent start-up writes: %s (%s of cache '
            'writes)' % (pct(base, api['cache_read']), kilo(spawn), pct(spawn, api['cache_write'])),
            '- tool results re-read: %s of cache reads; file reads and searches (sed -n, Read, grep, cat, rg, head, '
            'tail): %s of that' % (pct(carried, api['cache_read']), pct(reads, carried)),
            '- blocking tool time %s: build/test/check %s (%s), behind a lock wrapper %s, wait/sleep %s (%s)' % (
                hours(blocking), hours(verify), pct(verify, blocking), hours(locked),
                hours(cats['wait']['wall'] if 'wait' in cats else 0),
                pct(cats['wait']['wall'] if 'wait' in cats else 0, blocking)),
            '- build/test/check runs: %d, failed %d (%s), failed but exit 0 behind a pipe %d; fixes needing 3+ '
            'failed runs: %d, 5+: %d' % (runs, failed, pct(failed, runs), hidden,
                                        sum(t['fix_streaks'][k] for k in (3, 4, 5, 6)),
                                        sum(t['fix_streaks'][k] for k in (5, 6))), '']


def kind_table(t):
    lines = ['### Main sessions and subagents', '',
             '| | transcripts | API calls | output | cache write | cache read | model wait | tool time |',
             '|---|---:|---:|---:|---:|---:|---:|---:|']
    for kind in ('main', 'subagent'):
        api, wall = t['api_' + kind], t['wall_' + kind]
        n = sum(1 for s in t['sessions'] if s['kind'] == kind)
        lines.append('| %s | %d | %d | %s | %s | %s | %s | %s |' % (
            kind, n, api['calls'], kilo(api['output']), kilo(api['cache_write']), kilo(api['cache_read']),
            hours(wall['model']), hours(wall['tools'])))
    return lines + ['']


# ---------- merge and render ----------

def merge(into, part):
    for key in ('tools', 'labels', 'categories', 'groups'):
        for name, stats in part[key].items():
            target = into[key][name]
            for k, v in stats.items():
                target[k] += v
    for key in COUNTERS:
        peak = max(into[key].get('peak_context', 0), part[key].get('peak_context', 0))
        into[key].update(part[key])
        if peak:
            into[key]['peak_context'] = peak
    into['compactions'] += part['compactions']
    into['long_calls'] = sorted(into['long_calls'] + part['long_calls'], key=lambda c: -c['seconds'])[:LONG_CALLS_KEPT]
    into['sessions'] += part['sessions']
    for key in ('files', 'sessions_main'):
        into[key] += part[key]


COUNTERS = ('wall', 'wall_main', 'wall_subagent', 'gaps', 'model_waits', 'errors', 'api', 'api_main',
            'api_subagent', 'context_calls', 'context_cache_read', 'context_model_seconds', 'mistakes',
            'repeat_fail_labels', 'reread_labels', 'fix_streaks', 'tools_per_call')


def empty_total():
    total = {'files': 0, 'sessions_main': 0, 'compactions': [], 'long_calls': [], 'sessions': []}
    total.update({k: collections.defaultdict(new_tool_stats) for k in ('tools', 'labels', 'categories', 'groups')})
    total.update({k: collections.Counter() for k in COUNTERS})
    return total


def hours(seconds):
    return '%.1f h' % (seconds / 3600)


def kilo(n):
    if n >= 1e9:
        return '%.2fB' % (n / 1e9)
    if n >= 1e6:
        return '%.1fM' % (n / 1e6)
    if n >= 1e3:
        return '%.0fk' % (n / 1e3)
    return '%d' % n


def pct(part, whole):
    return '%.1f%%' % (100.0 * part / whole) if whole else '-'


def tool_table(stats, title, limit=30):
    rows = sorted(stats.items(), key=lambda kv: -kv[1]['duration'])[:limit]
    total_d = sum(s['duration'] for s in stats.values())
    total_w = sum(s['wall'] for s in stats.values())
    total_r = sum(s['result_tokens'] for s in stats.values())
    total_c = sum(s['carried_tokens'] for s in stats.values())
    total_o = sum(s['output_tokens'] for s in stats.values())
    lines = ['### ' + title, '',
             '| name | calls | errors | call time | share | blocking wall | median-free avg | result tok (est) | '
             'share | re-read in context (est) | share | output tok | share |',
             '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for name, s in rows:
        lines.append('| %s | %d | %d | %s | %s | %s | %.0f s | %s | %s | %s | %s | %s | %s |' % (
            name.replace('|', '/'), s['count'], s['errors'], hours(s['duration']), pct(s['duration'], total_d),
            hours(s['wall']), s['duration'] / max(1, s['count']), kilo(s['result_tokens']),
            pct(s['result_tokens'], total_r), kilo(s['carried_tokens']), pct(s['carried_tokens'], total_c),
            kilo(s['output_tokens']), pct(s['output_tokens'], total_o)))
    lines.append('')
    return lines


def render(totals):
    lines = ['# T-095 measured tables', 'Made by analyse.py; open it for the numbers behind report.md. '
             'Regenerate: python3 -I analyse.py', '',
             'Columns: call time = sum of (result time - call time) per call; blocking wall = the share of '
             'wall clock in which this call was what the session waited on (parallel calls split it); '
             'result tok = tokens the result added to the context (chars/4, images 1600); re-read in '
             'context = result tokens x the API calls that carried them until the next compaction; '
             'output tok = output of the message that made the call, split over its calls.', '']
    for project, t in totals.items():
        api = t['api']
        wall = t['wall']
        lines += ['## ' + project, '',
                  '- transcripts: %d (%d main sessions, %d subagents)' % (t['files'], t['sessions_main'],
                                                                          t['files'] - t['sessions_main']),
                  '- API calls: %d; output tokens %s (%s in calls with no tool, i.e. replies); input: fresh %s, '
                  'cache write %s, cache read %s; peak context %s' % (
                      api['calls'], kilo(api['output']), kilo(api['output_text_only']), kilo(api['input_fresh']),
                      kilo(api['cache_write']), kilo(api['cache_read']), kilo(api['peak_context'])),
                  '- thinking time reported: %s; turn time reported: %s' % (hours(api['thinking_ms'] / 1000),
                                                                            hours(api['turn_ms'] / 1000)), '',
                  '- input-equivalent tokens, weighted by list-price ratios (fresh 1, cache write 2, cache read '
                  '0.1, output 5): fresh %s, cache write %s, cache read %s, output %s' % weighted(api), '']
        lines += headline(t) + kind_table(t)
        lines += ['### Wall clock of main sessions (where the lead and the user wait)', '',
                  '| where | time | share of span |', '|---|---:|---:|']
        wall = t['wall_main']
        for k, v in sorted(wall.items(), key=lambda kv: -kv[1]):
            if k != 'span':
                lines.append('| %s | %s | %s |' % (k, hours(v), pct(v, wall['span'])))
        lines += ['| (span, first to last event) | %s | |' % hours(wall['span']), '',
                  '### Wall clock of subagents and teammates', '', '| where | time | share of span |',
                  '|---|---:|---:|']
        wall = t['wall_subagent']
        for k, v in sorted(wall.items(), key=lambda kv: -kv[1]):
            if k != 'span':
                lines.append('| %s | %s | %s |' % (k, hours(v), pct(v, wall['span'])))
        lines += ['| (span, first to last event) | %s | |' % hours(wall['span']), '']
        lines += tool_table(t['groups'], 'By tool (MCP servers grouped)')
        lines += tool_table(t['categories'], 'By kind of work (Bash split by what the command does)')
        lines += tool_table({k: v for k, v in t['labels'].items() if k not in t['tools'] or k == 'Bash'},
                            'Bash commands, general form', 40)
        by_tokens = sorted(t['labels'].items(), key=lambda kv: -kv[1]['carried_tokens'])[:15]
        lines += ['### What fills the context (by tokens re-read)', '',
                  '| name | calls | result tok | avg per call | re-read in context | share |', '|---|---:|---:|---:|---:|---:|']
        carried_total = sum(v['carried_tokens'] for v in t['labels'].values())
        lines += ['| %s | %d | %s | %s | %s | %s |' % (k, v['count'], kilo(v['result_tokens']),
                                                     kilo(v['result_tokens'] / max(1, v['count'])),
                                                     kilo(v['carried_tokens']), pct(v['carried_tokens'], carried_total))
                  for k, v in by_tokens]
        lines += ['', 'Tool calls per API call (3 = 3 or more): ' + ', '.join(
            '%d: %d' % (k, t['tools_per_call'][k]) for k in range(4)), '']
        lines += ['### Context size per API call', '', '| context | calls | share | cache-read tokens | share |',
                  '|---|---:|---:|---:|---:|']
        names = ['<50k', '50-100k', '100-150k', '150-200k', '200-300k', '300-500k', '500k+']
        cr_total = sum(t['context_cache_read'].values())
        lines[-2:] = ['| context | calls | share | cache-read tokens | share | avg wait per call |',
                      '|---|---:|---:|---:|---:|---:|']
        for i, n in enumerate(names):
            lines.append('| %s | %d | %s | %s | %s | %.1f s |' % (
                n, t['context_calls'][i], pct(t['context_calls'][i], api['calls']), kilo(t['context_cache_read'][i]),
                pct(t['context_cache_read'][i], cr_total), t['context_model_seconds'][i] / max(1, t['context_calls'][i])))
        firsts = sorted(s['first_context'] for s in t['sessions'] if s['kind'] == 'main')
        subs = sorted(s['first_context'] for s in t['sessions'] if s['kind'] == 'subagent')
        lines += ['', 'Context at the first API call (system prompt, tools, rules), median: main %s, subagent %s' % (
            kilo(firsts[len(firsts) // 2]) if firsts else '-', kilo(subs[len(subs) // 2]) if subs else '-'),
                  '', 'Wait on the model per API call: ' + ', '.join(
                      '%s %d' % (k, t['model_waits'][k]) for k in GAP_NAMES)]
        comps = t['compactions']
        auto = [c for c in comps if c['trigger'] == 'auto']
        lines += ['', '### Compactions', '',
                  '- %d compactions (%d auto, %d manual); median context before: %s; time spent compacting: %s' % (
                      len(comps), len(auto), len(comps) - len(auto),
                      kilo(sorted(c['pre'] for c in comps)[len(comps) // 2]) if comps else '-',
                      hours(sum(c['ms'] for c in comps) / 1000)), '']
        lines += ['### Errors by kind', '', '| kind | count |', '|---|---:|']
        lines += ['| %s | %d |' % kv for kv in t['errors'].most_common(25)]
        lines += ['', '### Mistakes, repeats and waits', '', '| measure | value |', '|---|---:|']
        lines += ['| %s | %s |' % (k, kilo(v) if 'tokens' in k else v) for k, v in sorted(t['mistakes'].items())]
        lines += ['', 'Failed build/test/check runs in a row before the next green one (6 = 6 or more): ' +
                  ', '.join('%s: %d' % (k, t['fix_streaks'][k]) for k in sorted(t['fix_streaks'])), '',
                  'Calls that failed again with the same input, by command: ' +
                  ', '.join('%s %d' % kv for kv in t['repeat_fail_labels'].most_common(12)), '',
                  'Waits before a prompt or notice: ' + ', '.join('%s %d' % (k, t['gaps'][k]) for k in GAP_NAMES), '']
        lines += ['### Longest single calls', '', '| seconds | tool | general form | kind | date |',
                  '|---:|---|---|---|---|']
        lines += ['| %d | %s | %s | %s | %s |' % (c['seconds'], c['tool'], c['label'].replace('|', '/'), c['kind'],
                                                  c['date']) for c in t['long_calls'][:25]]
        top = sorted((s for s in t['sessions'] if s['kind'] == 'main'), key=lambda s: -s['output'])[:10]
        lines += ['', '### Biggest main sessions (by output tokens)', '',
                  '| session | date | span | API calls | tool calls | peak context | compactions | output | '
                  'cache read | cost |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
        lines += ['| %s | %s | %.1f h | %d | %d | %s | %d | %s | %s | %s |' % (
            s['id'], s['date'], s['span_h'], s['calls'], s['tool_calls'], kilo(s['peak_context']), s['compactions'],
            kilo(s['output']), kilo(s['cache_read']), '$%.0f' % s['cost_usd'] if s['cost_usd'] else '-')
            for s in top]
        lines.append('')
    return '\n'.join(lines)


def transcript_files(project):
    pattern = os.path.join(PROJECTS_DIR, '*-Users-iosif-Documents-Projects-' + project)
    dirs = [d for d in glob.glob(pattern) + glob.glob(pattern + '-*') + glob.glob(pattern + '--*')
            if os.path.isdir(d) and not d.endswith(project + '-swift')]
    files = []
    for d in sorted(set(dirs)):
        files += glob.glob(os.path.join(d, '*.jsonl')) + glob.glob(os.path.join(d, '*', 'subagents', '**', '*.jsonl'),
                                                                   recursive=True)
    return sorted(set(files))


def jsonable(value):
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('projects', nargs='*', default=DEFAULT_PROJECTS)
    parser.add_argument('--out', default=HERE)
    parser.add_argument('--json', action='store_true', help='also write stats.json, every number in raw form')
    args = parser.parse_args()
    jobs = [(f, p) for p in args.projects for f in transcript_files(p)]
    print('%d transcripts' % len(jobs), file=sys.stderr)
    totals = {p: empty_total() for p in args.projects}
    totals['all'] = empty_total()
    with Pool() as pool:
        for i, part in enumerate(pool.imap_unordered(parse_file, jobs, chunksize=4)):
            if part:
                merge(totals[part['project']], part)
                merge(totals['all'], part)
            if i % 500 == 0:
                print('.. %d' % i, file=sys.stderr)
    with open(os.path.join(args.out, 'tables.md'), 'w') as f:
        f.write(render(totals))
    if args.json:
        with open(os.path.join(args.out, 'stats.json'), 'w') as f:
            json.dump(jsonable(totals), f, separators=(',', ':'))
    print('wrote tables.md%s to %s' % (' and stats.json' if args.json else '', args.out), file=sys.stderr)


if __name__ == '__main__':
    main()
