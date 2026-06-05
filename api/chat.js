
// Universal API proxy for HP乙游模拟器.
// Deploy this file to Vercel as /api/chat.
// It contains NO hard-coded API key. The game sends the user's own API key in each request.

function inferFormat(format, baseUrl='') {
  if (format && format !== 'auto') return format;
  const b = String(baseUrl || '').toLowerCase();
  if (b.includes('generativelanguage.googleapis.com') || b.includes('gemini')) return 'gemini';
  if (b.includes('anthropic.com') || b.includes('claude')) return 'anthropic';
  if (b.includes('dashscope.aliyuncs.com') && !b.includes('compatible-mode')) return 'dashscope';
  if (b.includes('localhost:11434') || b.includes('ollama')) return 'ollama';
  return 'openai';
}
function plainPrompt(messages=[]) {
  return messages.map(m => `${m.role === 'system' ? '系统' : m.role === 'assistant' ? '助手' : '玩家'}：${m.content || ''}`).join('\n\n');
}
function normalizeUrl(base, suffix) {
  const b = String(base || '').trim().replace(/\/$/, '');
  if (!b) return '';
  if (!suffix) return b;
  return b.endsWith(suffix) ? b : b + suffix;
}
function cleanText(v) {
  if (v == null) return '';
  if (typeof v !== 'string') v = String(v);
  v = v.trim();
  if (!v) return '';
  const low = v.slice(0, 1200).toLowerCase();
  if (/^<!doctype\s+html/.test(low) || /^<html[\s>]/.test(low) || low.includes('<head>') || low.includes('<body') || low.includes('<script')) return '';
  return v;
}
function deepFindText(data, depth = 0) {
  if (depth > 6 || data == null) return '';
  if (typeof data === 'string') return cleanText(data);
  if (typeof data !== 'object') return '';
  const paths = [
    ['choices',0,'message','content'], ['choices',0,'text'], ['message','content'], ['response'], ['text'], ['content'], ['result'], ['answer'],
    ['output'], ['output','text'], ['output','content'], ['output','message','content'], ['output','choices',0,'message','content'],
    ['data'], ['data','text'], ['data','content'], ['data','response'], ['data','answer'], ['data','result'], ['data','output'], ['completion']
  ];
  for (const path of paths) {
    let cur = data, ok = true;
    for (const k of path) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k];
      else { ok = false; break; }
    }
    if (ok) { const txt = deepFindText(cur, depth + 1); if (txt) return txt; }
  }
  if (Array.isArray(data)) for (const item of data) { const txt = deepFindText(item, depth + 1); if (txt) return txt; }
  return '';
}
function buildRequest({ apiKey, baseUrl, model, format, messages, temperature = 0.85, max_tokens = 900 }) {
  const fmt = inferFormat(format, baseUrl);
  const prompt = plainPrompt(messages || []);
  const key = apiKey || '';
  const base = String(baseUrl || '').trim();
  const mdl = model || '';
  if (fmt === 'gemini') {
    const apiBase = base || 'https://generativelanguage.googleapis.com/v1beta';
    const m = mdl || 'gemini-1.5-flash';
    return {
      url: `${apiBase.replace(/\/$/, '')}/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`,
      headers: { 'Content-Type': 'application/json' },
      body: { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: max_tokens } }
    };
  }
  if (fmt === 'anthropic') {
    const system = (messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const ms = (messages || []).filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
    return {
      url: normalizeUrl(base || 'https://api.anthropic.com/v1', '/messages'),
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: { model: mdl || 'claude-3-5-haiku-latest', max_tokens, temperature, system, messages: ms.length ? ms : [{ role: 'user', content: prompt }] }
    };
  }
  if (fmt === 'dashscope') {
    return {
      url: base || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: { model: mdl || 'qwen-plus', input: { messages: (messages || []).map(m => ({ role: m.role, content: String(m.content || '') })) }, parameters: { temperature, max_tokens } }
    };
  }
  if (fmt === 'ollama') {
    return {
      url: normalizeUrl(base || 'http://localhost:11434', '/api/chat'),
      headers: { 'Content-Type': 'application/json' },
      body: { model: mdl || 'llama3.1', messages: (messages || []).map(m => ({ role: m.role, content: String(m.content || '') })), stream: false, options: { temperature } }
    };
  }
  if (fmt === 'generic') {
    return {
      url: base,
      headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { 'Authorization': 'Bearer ' + key } : {}),
      body: { model: mdl, messages, prompt, input: prompt, text: prompt, query: prompt, temperature, max_tokens }
    };
  }
  return {
    url: normalizeUrl(base, '/chat/completions'),
    headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { 'Authorization': 'Bearer ' + key } : {}),
    body: { model: mdl, messages, temperature, max_tokens }
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const payload = req.body || {};
    if (!payload.baseUrl) return res.status(400).json({ error: 'Missing baseUrl' });
    const request = buildRequest(payload);
    if (!request.url) return res.status(400).json({ error: 'Missing target url' });
    const upstream = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body) });
    const contentType = upstream.headers.get('content-type') || '';
    const raw = contentType.includes('application/json') ? await upstream.json() : await upstream.text();
    if (!upstream.ok) return res.status(upstream.status).json({ error: 'Upstream error', detail: typeof raw === 'string' ? raw.slice(0, 500) : raw });
    const text = cleanText(deepFindText(raw));
    if (!text) return res.status(502).json({ error: 'No text found in upstream response', raw: typeof raw === 'string' ? raw.slice(0, 500) : raw });
    return res.status(200).json({ text, raw });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}
