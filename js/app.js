// ---------------------------------------------------------------------------
// Financial Data Extractor — runs entirely client-side.
// Calls the Google Gemini API directly from the browser using the user's own
// FREE API key (from https://aistudio.google.com/apikey). Nothing is sent to
// any server other than Google's Generative Language API.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert financial data extraction engine.

You will be given:
1. **The Source Document:** a purchase report, invoice, or receipt containing financial data.
2. **The Target Template:** a file, image, or text describing the exact Excel template layout and column headers to use.

Your task is to extract every transaction or line item from the Source Document and organize it into a table that matches the Target Template.

Follow these strict data rules:
1. **Map to Template:** Analyze the Target Template, identify its exact column headers, and arrange your output table using those exact columns in the same order.
2. **Extract All Items:** Do not summarize or skip rows. Extract every individual item or charge found in the source document.
3. **Clean for Excel:** Format dates as YYYY-MM-DD. Strip out currency symbols (like ₱, $, or €) and remove thousands-separator commas from numeric fields so they paste seamlessly as raw numbers (e.g., convert "₱1,250.75" to "1250.75").
4. **Handle Gaps:** If the template asks for a column that cannot be found or inferred from the source document, leave that cell completely blank.
5. **No Conversational Text:** Output ONLY the final data formatted in a clean Markdown table. Do not include any introduction, explanations, notes, or pleasantries.`;

const els = {
  apiKey: document.getElementById('apiKey'),
  rememberKey: document.getElementById('rememberKey'),
  model: document.getElementById('model'),
  sourceFile: document.getElementById('sourceFile'),
  templateFile: document.getElementById('templateFile'),
  sourceFileName: document.getElementById('sourceFileName'),
  templateFileName: document.getElementById('templateFileName'),
  manualTemplate: document.getElementById('manualTemplate'),
  extractBtn: document.getElementById('extractBtn'),
  status: document.getElementById('status'),
  resultCard: document.getElementById('resultCard'),
  tablePreview: document.getElementById('tablePreview'),
  rawOutput: document.getElementById('rawOutput'),
  copyBtn: document.getElementById('copyBtn'),
  downloadCsvBtn: document.getElementById('downloadCsvBtn'),
  downloadMdBtn: document.getElementById('downloadMdBtn'),
};

// --- Restore remembered API key -------------------------------------------
const savedKey = localStorage.getItem('fde_api_key');
if (savedKey) {
  els.apiKey.value = savedKey;
  els.rememberKey.checked = true;
}
els.rememberKey.addEventListener('change', () => {
  if (!els.rememberKey.checked) localStorage.removeItem('fde_api_key');
});

// --- Upload box "Choose File" buttons wire to hidden inputs ----------------
document.querySelectorAll('.upload-box .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.target).click();
  });
});

els.sourceFile.addEventListener('change', () => {
  els.sourceFileName.textContent = els.sourceFile.files[0]
    ? els.sourceFile.files[0].name
    : 'No file selected';
});

els.templateFile.addEventListener('change', () => {
  els.templateFileName.textContent = els.templateFile.files[0]
    ? els.templateFile.files[0].name
    : 'No file selected';
});

// Drag & drop support
[['sourceBox', 'sourceFile', 'sourceFileName'], ['templateBox', 'templateFile', 'templateFileName']]
  .forEach(([boxId, inputId, labelId]) => {
    const box = document.getElementById(boxId);
    box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('dragover'); });
    box.addEventListener('dragleave', () => box.classList.remove('dragover'));
    box.addEventListener('drop', e => {
      e.preventDefault();
      box.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const input = document.getElementById(inputId);
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      document.getElementById(labelId).textContent = file.name;
    });
  });

// --- Helpers ----------------------------------------------------------------

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read file: ' + file.name));
    reader.readAsDataURL(file);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file: ' + file.name));
    reader.readAsText(file);
  });
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const TEXTUAL_EXT = ['.csv', '.txt'];

function isTextual(file) {
  return TEXTUAL_EXT.some(ext => file.name.toLowerCase().endsWith(ext));
}

// Returns a Gemini "part" object: either { text } or { inlineData: { mimeType, data } }
async function fileToPart(file, label) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const data = await fileToBase64(file);
    return { inlineData: { mimeType: 'application/pdf', data } };
  }
  if (IMAGE_TYPES.includes(file.type)) {
    const data = await fileToBase64(file);
    return { inlineData: { mimeType: file.type, data } };
  }
  if (isTextual(file)) {
    const text = await fileToText(file);
    return { text: `[${label} — file "${file.name}"]\n${text}` };
  }
  // Fallback: try as text, else fail
  try {
    const text = await fileToText(file);
    return { text: `[${label} — file "${file.name}"]\n${text}` };
  } catch {
    throw new Error(`Unsupported file type for "${file.name}". Try PNG, JPG, WEBP, PDF, CSV or TXT.`);
  }
}

function setStatus(msg, kind) {
  els.status.textContent = msg;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
}

function markdownTableToHtml(md) {
  const lines = md.trim().split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return `<pre>${escapeHtml(md)}</pre>`;

  const rows = lines
    .filter(l => !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(l)) // drop separator row
    .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));

  if (rows.length === 0) return `<pre>${escapeHtml(md)}</pre>`;

  const [header, ...body] = rows;
  let html = '<table><thead><tr>';
  header.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
  html += '</tr></thead><tbody>';
  body.forEach(r => {
    html += '<tr>';
    r.forEach(c => html += `<td>${escapeHtml(c)}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function markdownTableToCsv(md) {
  const lines = md.trim().split('\n').filter(l => l.trim().startsWith('|'));
  const rows = lines
    .filter(l => !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(l))
    .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));

  return rows.map(row =>
    row.map(cell => {
      const needsQuotes = /[",\n]/.test(cell);
      const escaped = cell.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    }).join(',')
  ).join('\n');
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Main extract action -----------------------------------------------------

els.extractBtn.addEventListener('click', async () => {
  const apiKey = els.apiKey.value.trim();
  const sourceFile = els.sourceFile.files[0];
  const templateFile = els.templateFile.files[0];
  const manualTemplate = els.manualTemplate.value.trim();

  if (!apiKey) return setStatus('Please enter your free Gemini API key.', 'error');
  if (!sourceFile) return setStatus('Please upload a source document.', 'error');
  if (!templateFile && !manualTemplate) {
    return setStatus('Please upload a target template file or paste its column headers.', 'error');
  }

  if (els.rememberKey.checked) localStorage.setItem('fde_api_key', apiKey);

  els.extractBtn.disabled = true;
  setStatus('Reading files…', 'loading');

  try {
    const parts = [];

    parts.push({ text: 'SOURCE DOCUMENT:' });
    parts.push(await fileToPart(sourceFile, 'Source Document'));

    if (templateFile) {
      parts.push({ text: 'TARGET TEMPLATE:' });
      parts.push(await fileToPart(templateFile, 'Target Template'));
    }

    if (manualTemplate) {
      parts.push({
        text: `TARGET TEMPLATE COLUMN HEADERS (use these exact columns, in this exact order):\n${manualTemplate}`
      });
    }

    parts.push({
      text: 'Now extract every line item from the Source Document into a Markdown table matching the Target Template, following all the rules in your instructions. Output only the table.'
    });

    setStatus('Calling Gemini API…', 'loading');

    const model = els.model.value;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      })
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `API error (HTTP ${response.status})`);
    }

    const data = await response.json();

    const candidate = data?.candidates?.[0];
    if (!candidate) {
      const blockReason = data?.promptFeedback?.blockReason;
      throw new Error(blockReason ? `Request blocked: ${blockReason}` : 'The model returned no output. Try again.');
    }

    const text = (candidate.content?.parts || [])
      .map(p => p.text || '')
      .join('\n')
      .trim();

    if (!text) throw new Error('The model returned an empty response. Try again.');

    els.rawOutput.value = text;
    els.tablePreview.innerHTML = markdownTableToHtml(text);
    els.resultCard.hidden = false;
    els.resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('Done.', 'success');

  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong.', 'error');
  } finally {
    els.extractBtn.disabled = false;
  }
});

// --- Result actions -----------------------------------------------------------

els.copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.rawOutput.value);
    setStatus('Markdown copied to clipboard.', 'success');
  } catch {
    els.rawOutput.select();
    document.execCommand('copy');
    setStatus('Markdown copied to clipboard.', 'success');
  }
});

els.downloadMdBtn.addEventListener('click', () => {
  downloadText('extracted-data.md', els.rawOutput.value, 'text/markdown');
});

els.downloadCsvBtn.addEventListener('click', () => {
  const csv = markdownTableToCsv(els.rawOutput.value);
  downloadText('extracted-data.csv', csv, 'text/csv');
});
