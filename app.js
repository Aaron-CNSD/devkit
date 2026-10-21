'use strict';

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

const $ = (selector, root = document) => root.querySelector(selector);

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

let toastTimer = null;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 1400);
}

async function copyText(text) {
  if (!text) { toast('没有可复制的内容'); return; }
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
  } catch {
    toast('浏览器拒绝了剪贴板操作，请手动选择');
  }
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function editor(placeholder) {
  return h('textarea', { class: 'editor', spellcheck: 'false', placeholder });
}

function btn(label, onclick, cls = '') {
  return h('button', { class: `btn ${cls}`.trim(), type: 'button', onclick }, label);
}

function status(text = '', cls = '') {
  return h('span', { class: `status ${cls}`.trim(), text });
}

function setStatus(node, text, cls = '') {
  node.textContent = text;
  node.className = `status ${cls}`.trim();
}

function pane(title, body, actions = []) {
  return h('div', { class: 'pane' }, [
    h('div', { class: 'pane-head' }, [
      h('span', { class: 'pane-title', text: title }),
      h('div', { class: 'pane-actions' }, actions),
    ]),
    body,
  ]);
}

function kvRows(pairs) {
  const dl = h('dl', { class: 'kv' });
  for (const [key, value, cls] of pairs) {
    dl.append(h('dt', { text: key }), h('dd', { class: cls || '', text: value }));
  }
  return dl;
}

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/* ------------------------------------------------------------------ *
 * tools
 * ------------------------------------------------------------------ */

function buildJSON() {
  const input = editor('{"hello":"world"}');
  const output = h('pre', { class: 'output mono-nowrap' });
  const info = status('等待输入');
  let mode = 'format';

  function render() {
    const raw = input.value.trim();
    if (!raw) {
      output.textContent = '';
      setStatus(info, '等待输入');
      return;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      output.textContent = raw;
      setStatus(info, explainJSONError(error, raw), 'err');
      return;
    }
    const text = mode === 'min' ? JSON.stringify(value) : JSON.stringify(value, null, 2);
    output.textContent = text;
    const bytes = new TextEncoder().encode(text).length;
    const shape = Array.isArray(value)
      ? `数组 · ${value.length} 项`
      : value && typeof value === 'object'
        ? `对象 · ${Object.keys(value).length} 键`
        : typeof value;
    setStatus(info, `${shape} · ${bytes} B`, 'ok');
  }

  input.addEventListener('input', debounce(render, 50));

  const actions = [
    btn('格式化', () => { mode = 'format'; render(); }, 'primary'),
    btn('压缩', () => { mode = 'min'; render(); }),
    btn('复制', () => copyText(output.textContent), 'ghost'),
  ];

  const panes = h('div', { class: 'panes' }, [
    pane('输入', input, [btn('示例', () => {
      input.value = '{"name":"devkit","version":"1.0.0","tags":["json","base64","jwt"],"offline":true}';
      render();
    }, 'ghost')]),
    pane('输出', output, actions),
  ]);

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0' }, [
    panes,
    h('div', { style: 'display:flex;align-items:center;gap:10px;flex:none' }, [info]),
  ]);
}

function explainJSONError(error, text) {
  const message = String(error && error.message ? error.message : error);
  const match = message.match(/position (\d+)/);
  if (!match) return message;
  const position = Number(match[1]);
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  const column = position - before.lastIndexOf('\n');
  return `第 ${line} 行第 ${column} 列 · ${message}`;
}

function buildBase64() {
  const input = editor('要编码的文本，或要解码的 Base64…');
  const output = h('pre', { class: 'output' });
  const info = status('等待输入');
  let urlSafe = false;

  const urlToggle = h('input', { type: 'checkbox', onchange: (event) => { urlSafe = event.target.checked; } });
  const toggle = h('label', { class: 'chip', style: 'cursor:pointer;user-select:none' }, [
    urlToggle, h('span', { text: 'URL 安全' }),
  ]);

  function encode() {
    const text = input.value;
    if (!text) { output.textContent = ''; setStatus(info, '等待输入'); return; }
    let result = bytesToBase64(new TextEncoder().encode(text));
    if (urlSafe) result = result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    output.textContent = result;
    setStatus(info, `${text.length} 字符 → ${result.length} 字符`, 'ok');
  }

  function decode() {
    const raw = input.value.trim();
    if (!raw) { output.textContent = ''; setStatus(info, '等待输入'); return; }
    try {
      const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
      const pad = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
      const bytes = base64ToBytes(normalized + pad);
      const text = new TextDecoder('utf-8').decode(bytes);
      output.textContent = text;
      setStatus(info, `${raw.length} 字符 → ${text.length} 字符`, 'ok');
    } catch {
      output.textContent = '';
      setStatus(info, '不是合法的 Base64', 'err');
    }
  }

  input.addEventListener('input', debounce(() => {
    const looksEncoded = /^[A-Za-z0-9+/\-_\s]+={0,2}$/.test(input.value.trim());
    looksEncoded ? decode() : encode();
  }, 60));

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0' }, [
    h('div', { class: 'panes', style: 'flex:1' }, [
      pane('输入', input, [
        btn('编码', encode, 'primary'),
        btn('解码', decode),
        btn('复制', () => copyText(output.textContent), 'ghost'),
      ]),
      pane('输出', output),
    ]),
    h('div', { style: 'display:flex;align-items:center;gap:12px;flex:none' }, [info, toggle]),
  ]);
}

function buildURL() {
  const input = editor('含特殊字符的 URL 或查询串…');
  const output = h('pre', { class: 'output' });
  const info = status('等待输入');

  function encode() {
    try {
      const result = encodeURIComponent(input.value);
      output.textContent = result;
      setStatus(info, `已编码 · ${result.length} 字符`, 'ok');
    } catch (error) {
      setStatus(info, String(error), 'err');
    }
  }

  function decode() {
    try {
      const result = decodeURIComponent(input.value);
      output.textContent = result;
      setStatus(info, `已解码 · ${result.length} 字符`, 'ok');
    } catch {
      setStatus(info, '% 编码不完整，无法解码', 'err');
    }
  }

  function parseQuery() {
    const text = input.value.trim();
    const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
    const params = new URLSearchParams(query);
    if (![...params.keys()].length) {
      output.textContent = '';
      setStatus(info, '没找到查询参数', 'warn');
      return;
    }
    const rows = [];
    for (const [key, value] of params) rows.push(`${key} = ${value}`);
    output.textContent = rows.join('\n');
    setStatus(info, `${rows.length} 个参数`, 'ok');
  }

  input.addEventListener('input', debounce(encode, 80));

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0' }, [
    h('div', { class: 'panes', style: 'flex:1' }, [
      pane('输入', input, [
        btn('编码', encode, 'primary'),
        btn('解码', decode),
        btn('拆参数', parseQuery),
        btn('复制', () => copyText(output.textContent), 'ghost'),
      ]),
      pane('输出', output),
    ]),
    h('div', { style: 'display:flex;align-items:center;gap:10px;flex:none' }, [info]),
  ]);
}

function parseMoment(raw) {
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{10}$/.test(text)) return new Date(Number(text) * 1000);
  if (/^\d{13}$/.test(text)) return new Date(Number(text));
  if (/^\d{16}$/.test(text)) return new Date(Number(text) / 1000);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function localString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function humanDiff(targetMs, nowMs = Date.now()) {
  const diff = targetMs - nowMs;
  const abs = Math.abs(diff);
  const units = [[86400000, '天'], [3600000, '小时'], [60000, '分钟'], [1000, '秒']];
  for (const [size, name] of units) {
    if (abs >= size || size === 1000) {
      const count = Math.floor(abs / size);
      return diff >= 0 ? `${count} ${name}后` : `${count} ${name}前`;
    }
  }
  return '刚刚';
}

function buildTimestamp() {
  const input = h('input', {
    type: 'text',
    spellcheck: 'false',
    placeholder: '1700000000 / 1700000000000 / 2024-01-01 12:00:00',
  });
  input.style.fontFamily = 'var(--mono)';

  const result = h('div', { class: 'stack' });
  const info = status('');

  function render() {
    result.textContent = '';
    const now = Date.now();
    const raw = input.value.trim();
    if (!raw) {
      result.append(h('div', { class: 'empty', text: '输入时间戳或日期，自动识别秒 / 毫秒' }));
      setStatus(info, '');
      return;
    }
    const date = parseMoment(raw);
    if (!date) {
      setStatus(info, '无法识别这个时间', 'err');
      return;
    }
    const ms = date.getTime();
    result.append(kvRows([
      ['本地时间', localString(date), 'strong'],
      ['UTC', date.toUTCString(), 'dim'],
      ['ISO 8601', date.toISOString(), 'dim'],
      ['Unix 秒', String(Math.floor(ms / 1000))],
      ['Unix 毫秒', String(ms)],
      ['星期', ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]],
      ['相对现在', humanDiff(ms, now), ms > now ? 'dim' : 'strong'],
    ]));
    setStatus(info, '已识别', 'ok');
  }

  input.addEventListener('input', debounce(render, 40));

  const node = h('div', { class: 'panes' }, [
    pane('输入', h('div', { class: 'stack' }, [
      h('div', { class: 'field' }, [h('label', { text: '时间戳或日期' }), input]),
      h('div', { class: 'row' }, [
        btn('现在（秒）', () => { input.value = String(Math.floor(Date.now() / 1000)); render(); }, 'primary'),
        btn('现在（毫秒）', () => { input.value = String(Date.now()); render(); }),
        btn('复制', () => copyText(result.textContent.trim()), 'ghost'),
      ]),
    ]), [info]),
    pane('解析结果', result),
  ]);

  render();
  return node;
}

function buildHash() {
  const input = editor('输入要计算哈希的文本…');
  const output = h('pre', { class: 'output' });
  const info = status('等待输入');

  let algorithm = 'SHA-256';
  let token = 0;

  const chips = ['SHA-1', 'SHA-256', 'SHA-512'].map((name) =>
    btn(name, () => {
      algorithm = name;
      for (const chip of chips) chip.classList.toggle('primary', chip.textContent === name);
      render();
    }, name === algorithm ? 'primary' : ''));

  async function render() {
    const text = input.value;
    if (!text) {
      output.textContent = '';
      setStatus(info, '等待输入');
      return;
    }
    const mine = ++token;
    try {
      const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
      if (mine !== token) return;
      const hex = toHex(digest);
      output.textContent = hex;
      setStatus(info, `${algorithm} · ${hex.length * 4} bit`, 'ok');
    } catch (error) {
      if (mine !== token) return;
      setStatus(info, String(error), 'err');
    }
  }

  input.addEventListener('input', debounce(render, 120));

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0' }, [
    h('div', { class: 'panes', style: 'flex:1' }, [
      pane('输入', input),
      pane('摘要', output, [btn('复制', () => copyText(output.textContent), 'ghost')]),
    ]),
    h('div', { style: 'display:flex;align-items:center;gap:8px;flex:none' }, [
      ...chips,
      h('span', { style: 'width:1px;height:16px;background:var(--line);margin:0 4px' }),
      info,
    ]),
  ]);
}

function splitWords(raw) {
  return String(raw)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildCase() {
  const input = editor('粘贴变量名，例如 user_profile-name');
  const out = h('div', { class: 'stack' });
  const info = status('等待输入');

  function render() {
    out.textContent = '';
    const words = splitWords(input.value);
    if (!words.length) {
      out.append(h('div', { class: 'empty', text: '输入后下面会同时给出六种命名风格' }));
      setStatus(info, '等待输入');
      return;
    }
    const lower = words.map((w) => w.toLowerCase());
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    const rows = [
      ['camelCase', lower[0] + lower.slice(1).map(cap).join('')],
      ['PascalCase', lower.map(cap).join('')],
      ['snake_case', lower.join('_')],
      ['kebab-case', lower.join('-')],
      ['CONSTANT_CASE', words.map((w) => w.toUpperCase()).join('_')],
      ['Title Case', lower.map(cap).join(' ')],
    ];
    for (const [name, value] of rows) {
      out.append(h('div', { class: 'pane', style: 'flex:none' }, [
        h('div', { class: 'pane-head' }, [
          h('span', { class: 'pane-title', text: name }),
          h('div', { class: 'pane-actions' }, [btn('复制', () => copyText(value), 'ghost')]),
        ]),
        h('div', {
          style: 'padding:10px 13px;font-family:var(--mono);font-size:13px;word-break:break-all',
          text: value,
        }),
      ]));
    }
    setStatus(info, `${words.length} 个词`, 'ok');
  }

  input.addEventListener('input', debounce(render, 40));

  return h('div', { style: 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0' }, [
    h('div', { class: 'panes', style: 'flex:1' }, [
      pane('输入', input),
      pane('命名风格', out),
    ]),
    h('div', { style: 'display:flex;align-items:center;gap:10px;flex:none' }, [info]),
  ]);
}

function buildRegex() {
  const pattern = h('input', { type: 'text', spellcheck: 'false', placeholder: '\\b(\\w+)@(\\w+\\.\\w+)\\b' });
  pattern.style.fontFamily = 'var(--mono)';
  const flags = h('input', { type: 'text', spellcheck: 'false', value: 'gi' });
  flags.style.fontFamily = 'var(--mono)';
  flags.style.maxWidth = '110px';
  const text = editor('测试文本…');
  const preview = h('div', {
    class: 'output',
    style: 'padding:12px 14px;overflow:auto;flex:1;min-height:0;white-space:pre-wrap;word-break:break-word',
  });
  const info = status('');

  function render() {
    preview.textContent = '';
    const source = pattern.value;
    if (!source) {
      setStatus(info, '输入正则开始匹配');
      preview.append(h('div', { class: 'empty', text: '输入正则和测试文本，这里会高亮命中的部分' }));
      return;
    }
    let regex;
    try {
      regex = new RegExp(source, flags.value.replace(/[^gimsuy]/g, ''));
    } catch (error) {
      setStatus(info, String(error.message || error), 'err');
      return;
    }
    const subject = text.value;
    if (!subject) {
      setStatus(info, '正则有效，等待测试文本', 'warn');
      return;
    }

    const global = regex.global ? regex : new RegExp(regex.source, regex.flags + 'g');
    const fragment = document.createDocumentFragment();
    let last = 0;
    let count = 0;
    const groups = [];

    for (const match of subject.matchAll(global)) {
      const index = match.index || 0;
      if (index > last) fragment.append(subject.slice(last, index));
      fragment.append(h('mark', { text: match[0] }));
      last = index + match[0].length;
      count += 1;
      if (count <= 20) {
        const parts = [`#${count}  ${match[0]}`];
        match.slice(1).forEach((group, i) => parts.push(`  $${i + 1} = ${group ?? '—'}`));
        groups.push(parts.join(''));
      }
      if (count > 5000) break;
    }
    fragment.append(subject.slice(last));
    preview.append(fragment);

    if (groups.length) {
      preview.append(h('div', {
        style: 'margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted);white-space:pre-wrap',
        text: groups.join('\n'),
      }));
    }
    setStatus(info, `${count} 处匹配`, count ? 'ok' : 'warn');
  }

  pattern.addEventListener('input', debounce(render, 60));
  flags.addEventListener('input', debounce(render, 60));
  text.addEventListener('input', debounce(render, 80));

  const node = h('div', { class: 'panes' }, [
    pane('测试文本', text),
    pane('高亮结果', preview, [info]),
  ]);

  const controls = h('div', { class: 'row', style: 'flex:none;margin-bottom:12px' }, [
    h('div', { class: 'field', style: 'flex:1' }, [h('label', { text: '正则表达式' }), pattern]),
    h('div', { class: 'field', style: 'flex:none;width:110px' }, [h('label', { text: '标记' }), flags]),
  ]);

  render();
  return h('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0' }, [controls, node]);
}

function buildStats() {
  const text = editor('粘贴要统计的文本…');
  const out = h('div', { class: 'stack' });
  const info = status('');

  function render() {
    const value = text.value;
    const chars = [...value].length;
    const noSpace = [...value.replace(/\s/g, '')].length;
    const lines = value ? value.split('\n').length : 0;
    const cjk = (value.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (value.match(/[A-Za-z0-9_'-]+/g) || []).length;
    const bytes = new TextEncoder().encode(value).length;

    out.textContent = '';
    out.append(kvRows([
      ['字符数', String(chars), 'strong'],
      ['不含空白', String(noSpace)],
      ['行数', String(lines)],
      ['词数（英文）', String(words)],
      ['中文字数', String(cjk)],
      ['UTF-8 字节', String(bytes)],
    ]));
    setStatus(info, chars ? '统计完成' : '等待输入', chars ? 'ok' : '');
  }

  text.addEventListener('input', debounce(render, 40));

  return h('div', { class: 'panes' }, [
    pane('文本', text, [btn('清空', () => { text.value = ''; render(); }, 'ghost')]),
    pane('统计', out, [info]),
  ]);
}

function b64urlDecode(part) {
  const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  return new TextDecoder('utf-8').decode(base64ToBytes(normalized + pad));
}

function buildJWT() {
  const input = editor('粘贴 JWT（三段用 . 分隔）…');
  const out = h('div', { class: 'stack' });
  const info = status('');

  function render() {
    out.textContent = '';
    const token = input.value.trim();
    if (!token) {
      out.append(h('div', { class: 'empty', text: '粘贴 JWT 后会解出 header 和 payload，并检查是否过期' }));
      setStatus(info, '等待输入');
      return;
    }
    const parts = token.split('.');
    if (parts.length < 2) {
      setStatus(info, '不是 JWT：至少需要 header.payload', 'err');
      return;
    }
    let header;
    let payload;
    try {
      header = JSON.parse(b64urlDecode(parts[0]));
      payload = JSON.parse(b64urlDecode(parts[1]));
    } catch (error) {
      setStatus(info, `解码失败：${error.message}`, 'err');
      return;
    }

    out.append(h('div', { class: 'pane-title', text: 'header', style: 'margin-bottom:6px' }));
    out.append(h('pre', {
      class: 'output mono-nowrap',
      style: 'padding:10px 13px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;flex:none;max-height:160px',
      text: JSON.stringify(header, null, 2),
    }));

    out.append(h('div', { class: 'pane-title', text: 'payload', style: 'margin:10px 0 6px' }));
    out.append(h('pre', {
      class: 'output mono-nowrap',
      style: 'padding:10px 13px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;flex:none;max-height:260px',
      text: JSON.stringify(payload, null, 2),
    }));

    const rows = [];
    if (payload.exp) {
      const expMs = payload.exp * 1000;
      const expired = expMs < Date.now();
      rows.push(['过期时间', `${localString(new Date(expMs))}（${expired ? '已过期' : humanDiff(expMs)}）`, expired ? '' : 'dim']);
      rows.push(['状态', expired ? '已过期' : '有效']);
    }
    if (payload.iat) rows.push(['签发时间', localString(new Date(payload.iat * 1000)), 'dim']);
    if (payload.nbf) rows.push(['生效时间', localString(new Date(payload.nbf * 1000)), 'dim']);
    if (payload.iss) rows.push(['签发者', String(payload.iss), 'dim']);
    if (payload.sub) rows.push(['主体', String(payload.sub), 'dim']);
    if (payload.aud) rows.push(['受众', String(payload.aud), 'dim']);
    if (rows.length) {
      out.append(h('div', { style: 'margin-top:12px' }, [kvRows(rows)]));
    }

    setStatus(info, payload.exp && payload.exp * 1000 < Date.now() ? 'token 已过期' : '解析成功',
      payload.exp && payload.exp * 1000 < Date.now() ? 'warn' : 'ok');
  }

  input.addEventListener('input', debounce(render, 60));

  return h('div', { class: 'panes' }, [
    pane('JWT', input, [btn('清空', () => { input.value = ''; render(); }, 'ghost')]),
    pane('解析', out, [info]),
  ]);
}

/* ------------------------------------------------------------------ *
 * registry
 * ------------------------------------------------------------------ */

const TOOLS = [
  { id: 'json', name: 'JSON', glyph: '{ }', desc: '格式化、压缩、定位语法错误', tip: '实时校验，出错时给出行列位置。', build: buildJSON },
  { id: 'base64', name: 'Base64', glyph: 'b64', desc: '文本与 Base64 互转，支持 URL 安全', tip: '自动判断方向：看起来像 Base64 就解码。', build: buildBase64 },
  { id: 'url', name: 'URL', glyph: '%', desc: '编码、解码、拆查询参数', tip: '拆参数会把 query 展开成键值对。', build: buildURL },
  { id: 'timestamp', name: '时间戳', glyph: 'ts', desc: '秒 / 毫秒 / 日期互相换算', tip: '10 位按秒，13 位按毫秒自动识别。', build: buildTimestamp },
  { id: 'hash', name: '哈希', glyph: '#', desc: 'SHA-1 / SHA-256 / SHA-512', tip: '在浏览器本地计算，文本不会离开这台机器。', build: buildHash },
  { id: 'case', name: '命名', glyph: 'Aa', desc: ' camel / snake / kebab / 常量', tip: '一次给出六种写法，点一下就能复制。', build: buildCase },
  { id: 'regex', name: '正则', glyph: '.*', desc: '实时匹配与高亮分组', tip: '命中的部分会直接高亮在原文里。', build: buildRegex },
  { id: 'stats', name: '字数', glyph: '¶', desc: '字符、词、行、中文与字节', tip: '中文按字计，英文按词计。', build: buildStats },
  { id: 'jwt', name: 'JWT', glyph: 'jwt', desc: '解析 header / payload 与过期时间', tip: '只解码，不校验签名。', build: buildJWT },
];

/* ------------------------------------------------------------------ *
 * navigation
 * ------------------------------------------------------------------ */

let currentTool = null;

function renderNav() {
  const nav = $('#tools');
  nav.textContent = '';
  TOOLS.forEach((tool, index) => {
    nav.append(h('button', {
      class: 'tool',
      type: 'button',
      dataset: { id: tool.id },
      title: `⌘${index + 1}`,
      onclick: () => selectTool(tool.id),
    }, [
      h('span', { class: 'glyph', text: tool.glyph }),
      h('span', { text: tool.name }),
    ]));
  });
  $('#count-label').textContent = `${TOOLS.length} 个工具`;
}

function selectTool(id) {
  const tool = TOOLS.find((entry) => entry.id === id) || TOOLS[0];
  currentTool = tool.id;
  try { localStorage.setItem('devkit.tool', tool.id); } catch { /* private mode */ }

  $('#title').textContent = tool.name;
  $('#desc').textContent = tool.desc;
  $('#tip').textContent = tool.tip || '';

  const panel = $('#panel');
  panel.textContent = '';
  panel.append(tool.build());

  for (const node of document.querySelectorAll('.tool')) {
    node.classList.toggle('active', node.dataset.id === tool.id);
  }
}

/* ------------------------------------------------------------------ *
 * command palette
 * ------------------------------------------------------------------ */

let paletteMatches = [];
let paletteIndex = 0;

function openPalette() {
  const palette = $('#palette');
  palette.hidden = false;
  const input = $('#palette-input');
  input.value = '';
  renderPalette('');
  input.focus();
}

function closePalette() {
  $('#palette').hidden = true;
}

function renderPalette(query) {
  const list = $('#palette-list');
  list.textContent = '';
  const needle = query.trim().toLowerCase();
  paletteMatches = TOOLS.filter((tool) =>
    `${tool.name} ${tool.desc} ${tool.id}`.toLowerCase().includes(needle));
  paletteIndex = 0;

  if (!paletteMatches.length) {
    list.append(h('div', { class: 'palette-item', text: '没有匹配的工具' }));
    return;
  }

  paletteMatches.forEach((tool, index) => {
    list.append(h('div', {
      class: `palette-item ${index === 0 ? 'active' : ''}`,
      onclick: () => { closePalette(); selectTool(tool.id); },
    }, [
      h('span', { class: 'glyph', text: tool.glyph }),
      h('span', { text: tool.name }),
      h('span', { class: 'sub', text: tool.desc }),
    ]));
  });
}

function movePalette(delta) {
  if (!paletteMatches.length) return;
  const items = document.querySelectorAll('.palette-item');
  paletteIndex = (paletteIndex + delta + paletteMatches.length) % paletteMatches.length;
  items.forEach((item, index) => item.classList.toggle('active', index === paletteIndex));
  const active = items[paletteIndex];
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', (event) => {
  const palette = $('#palette');
  const meta = event.metaKey || event.ctrlKey;

  if (meta && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    palette.hidden ? openPalette() : closePalette();
    return;
  }

  if (!palette.hidden) {
    if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); movePalette(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); movePalette(-1); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      const tool = paletteMatches[paletteIndex];
      if (tool) { closePalette(); selectTool(tool.id); }
    }
    return;
  }

  if (meta && /^[1-9]$/.test(event.key)) {
    const tool = TOOLS[Number(event.key) - 1];
    if (tool) { event.preventDefault(); selectTool(tool.id); }
  }
});

$('#palette-input').addEventListener('input', (event) => renderPalette(event.target.value));
$('#palette').addEventListener('click', (event) => {
  if (event.target === $('#palette')) closePalette();
});

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */

renderNav();

let saved = null;
try { saved = localStorage.getItem('devkit.tool'); } catch { /* ignore */ }
selectTool(saved || TOOLS[0].id);
