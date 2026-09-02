#!/usr/bin/env node
/**
 * Stop 훅 — 이번 턴의 "작업 수정사항"만 요약해서 log.md 맨 위에 기록한다.
 *
 *   형식: YYMMDD_HHMMSS : 수정 a.ts, b.ts | 생성 c.md | 실행 git commit
 *   순서: 역순(최신이 위)
 *
 * 파일을 만들거나 고치지 않았고 상태를 바꾸는 명령도 실행하지 않은 턴
 * (조회·검색·질문만 한 턴)은 아무것도 쓰지 않는다.
 *
 * 이 훅은 어떤 경우에도 세션을 막지 않는다 — 실패해도 조용히 exit 0.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MARKER = '<!-- worklog -->';
const MAX_FILES = 6;
const MAX_CMDS = 5;

/**
 * 워크스페이스 상태를 실제로 바꾸는 셸 명령만 기록 대상으로 본다.
 * `rm`/`cp`/`mv` 같은 범용 파일 명령은 일부러 뺐다 — 임시 파일 정리에 훨씬 자주
 * 쓰여서 신호보다 잡음이 크고, 의미 있는 파일 변경은 Write/Edit로 이미 잡힌다.
 */
const MUTATING_COMMANDS = [
  /^git\s+(commit|push|merge|rebase|revert|reset|checkout|switch|pull|clone|cherry-pick|stash|tag|apply|am|rm|mv|init)\b/,
  /^(npm|pnpm|yarn|bun)\s+(install|i|ci|add|remove|rm|uninstall|update|up|link)\b/,
  /^(npm|pnpm|yarn|bun)\s+run\s+(build|deploy|migrate|generate|db[:@-]\S*)/,
  /^(npx\s+)?prisma\s+(migrate|db|generate)\b/,
  /^supabase\s+(db|migration|functions)\b/,
  /^pip3?\s+(install|uninstall)\b/,
  /^(vercel|netlify)\b/,
  /\bsed\s+-i\b/,
];

/** 임시·스크래치 경로를 건드리는 명령은 작업이 아니라 잡음이다. */
const SCRATCH_HINT = /([\\/][Tt]emp[\\/]claude[\\/]|scratchpad|[\\/]tmp[\\/])/;

/** 기록에서 제외할 경로 (로그 자신, 훅 상태 파일, 스크래치패드, 의존성) */
const IGNORED_PATHS = [
  /(^|[\\/])log\.md$/i,
  /[\\/]\.claude[\\/]\.worklog[\\/]/i,
  /[\\/][Tt]emp[\\/]claude[\\/]/,
  /^[\\/]tmp[\\/]/,
  /[\\/]node_modules[\\/]/,
];

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    try {
      run(raw);
    } catch {
      // 로그 기록 실패가 작업을 방해해서는 안 된다.
    }
    process.exit(0);
  });
  process.stdin.on('error', () => process.exit(0));
}

function run(raw) {
  const input = safeParse(raw);
  if (!input || !input.transcript_path) return;
  if (!fs.existsSync(input.transcript_path)) return;

  const root = findProjectRoot(input.cwd || process.cwd());
  const logPath = process.env.WORKLOG_FILE || path.join(root, 'log.md');

  const lines = fs.readFileSync(input.transcript_path, 'utf8').split('\n');
  const statePath = path.join(root, '.claude', '.worklog', `${input.session_id || 'session'}.json`);
  const start = resolveStartIndex(lines, statePath);

  const changes = collectChanges(lines.slice(start), root);
  saveState(statePath, lines.length);

  const summary = buildSummary(changes);
  if (!summary) return;

  prependEntry(logPath, `${timestamp()} : ${summary}`);
}

/* ------------------------------------------------------------------ */
/* 트랜스크립트 읽기                                                    */
/* ------------------------------------------------------------------ */

/**
 * 지난번에 기록한 지점부터 읽는다. 상태 파일이 없으면(세션 첫 기록·재개)
 * 마지막 사용자 프롬프트 이후만 본다 — 과거 턴을 통째로 다시 쓰지 않도록.
 */
function resolveStartIndex(lines, statePath) {
  const state = safeParse(readIfExists(statePath));
  if (state && Number.isInteger(state.line) && state.line >= 0 && state.line <= lines.length) {
    return state.line;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isUserPrompt(safeParse(lines[i]))) return i;
  }
  return 0;
}

/** 도구 결과가 아닌, 사람이 직접 보낸 메시지인가 */
function isUserPrompt(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta) return false;
  const content = entry.message && entry.message.content;
  if (typeof content === 'string') return true;
  if (!Array.isArray(content)) return false;
  return !content.some((block) => block && block.type === 'tool_result');
}

function collectChanges(lines, root) {
  const created = new Set();
  const modified = new Set();
  const commands = [];
  /** tool_use id -> 결과 (Write가 생성인지 수정인지 판별하는 데 쓴다) */
  const results = new Map();
  const pending = [];

  for (const line of lines) {
    const entry = safeParse(line);
    if (!entry) continue;

    if (entry.type === 'assistant' && Array.isArray(entry.message && entry.message.content)) {
      for (const block of entry.message.content) {
        if (block && block.type === 'tool_use') pending.push(block);
      }
    }

    if (entry.toolUseResult !== undefined) {
      const id = toolResultId(entry);
      if (id) results.set(id, entry.toolUseResult);
    }
  }

  for (const call of pending) {
    const input = call.input || {};

    if (call.name === 'Write') {
      const rel = relativize(input.file_path, root);
      if (rel) (classifyWrite(results.get(call.id)) === 'created' ? created : modified).add(rel);
      continue;
    }

    if (call.name === 'Edit' || call.name === 'MultiEdit' || call.name === 'NotebookEdit') {
      const rel = relativize(input.file_path || input.notebook_path, root);
      if (rel) modified.add(rel);
      continue;
    }

    if (call.name === 'Bash' || call.name === 'PowerShell') {
      for (const label of mutatingLabels(input.command)) {
        if (!commands.includes(label)) commands.push(label);
      }
    }
  }

  // 같은 파일이 생성 후 수정되었다면 "생성"으로만 센다.
  for (const file of created) modified.delete(file);

  return { created, modified, commands };
}

function toolResultId(entry) {
  const content = entry.message && entry.message.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && block.type === 'tool_result' && block.tool_use_id) return block.tool_use_id;
    }
  }
  return null;
}

function classifyWrite(result) {
  if (result && typeof result === 'object') {
    if (result.type === 'create') return 'created';
    if (result.type === 'update') return 'modified';
  }
  const text = typeof result === 'string' ? result : '';
  return /created/i.test(text) ? 'created' : 'modified';
}

/** 명령줄에서 상태를 바꾸는 부분만 골라 "git commit" 같은 짧은 라벨로 만든다. */
function mutatingLabels(command) {
  if (typeof command !== 'string') return [];
  const labels = [];
  for (let segment of command.split(/&&|\|\||[;\n|]/)) {
    segment = segment.trim().replace(/^sudo\s+/, '').replace(/^\(+\s*/, '');
    if (!segment) continue;
    if (SCRATCH_HINT.test(segment)) continue;
    if (!MUTATING_COMMANDS.some((pattern) => pattern.test(segment))) continue;
    const words = segment.split(/\s+/).filter((word) => !word.startsWith('-'));
    const label = words.slice(0, words[0] === 'npx' ? 3 : 2).join(' ');
    if (label) labels.push(label);
  }
  return labels;
}

/* ------------------------------------------------------------------ */
/* 요약 만들기                                                          */
/* ------------------------------------------------------------------ */

function buildSummary({ created, modified, commands }) {
  const parts = [];
  if (modified.size) parts.push(`수정 ${formatFiles(modified)}`);
  if (created.size) parts.push(`생성 ${formatFiles(created)}`);
  if (commands.length) {
    const shown = commands.slice(0, MAX_CMDS).join(', ');
    const rest = commands.length - MAX_CMDS;
    parts.push(`실행 ${shown}${rest > 0 ? ` 외 ${rest}건` : ''}`);
  }
  return parts.join(' | ');
}

function formatFiles(set) {
  const files = [...set].sort();
  const shown = files.slice(0, MAX_FILES).join(', ');
  const rest = files.length - MAX_FILES;
  return rest > 0 ? `${shown} 외 ${rest}개` : shown;
}

/* ------------------------------------------------------------------ */
/* log.md 쓰기                                                          */
/* ------------------------------------------------------------------ */

function prependEntry(logPath, entry) {
  const header = `# 작업 로그\n\n${MARKER}\n`;
  let content = readIfExists(logPath);

  if (content === null) {
    fs.writeFileSync(logPath, `${header}${entry}\n`, 'utf8');
    return;
  }

  const index = content.indexOf(MARKER);
  if (index === -1) {
    fs.writeFileSync(logPath, `${entry}\n${content}`, 'utf8');
    return;
  }

  const cut = index + MARKER.length;
  const head = content.slice(0, cut);
  const tail = content.slice(cut).replace(/^\r?\n/, '');
  fs.writeFileSync(logPath, `${head}\n${entry}\n${tail}`, 'utf8');
}

/* ------------------------------------------------------------------ */
/* 유틸                                                                 */
/* ------------------------------------------------------------------ */

function timestamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yy = pad(now.getFullYear() % 100);
  return (
    `${yy}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** 절대경로를 프로젝트 상대경로로. 기록 대상이 아니면 null. */
function relativize(filePath, root) {
  if (typeof filePath !== 'string' || !filePath) return null;
  if (IGNORED_PATHS.some((pattern) => pattern.test(filePath))) return null;
  const relative = path.relative(root, path.resolve(root, filePath));
  if (!relative || relative.startsWith('..')) return path.basename(filePath);
  return relative.split(path.sep).join('/');
}

function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

function saveState(statePath, line) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ line }), 'utf8');
  } catch {
    // 상태 저장 실패는 다음 턴에 중복 기록될 수 있을 뿐, 치명적이지 않다.
  }
}

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function safeParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

main();
