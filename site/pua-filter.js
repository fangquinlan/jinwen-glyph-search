const BATCH_SIZE = 96;

const FIELD_LABELS = {
  main: "主字頭",
  sub: "子字頭",
  title: "器名",
  source: "來源",
};

const KIND_ORDER = new Map([
  ["head", 0],
  ["context", 1],
  ["cid", 2],
  ["unlocated", 3],
]);

const KIND_LABELS = {
  head: "字頭可定位",
  context: "僅上下文命中",
  cid: "CID",
  unlocated: "未定位",
};

const state = {
  rows: [],
  records: [],
  inlineGlyphs: {},
  headIndex: new Map(),
  contextIndex: new Map(),
  cursors: new Map(),
  query: "",
  kind: "all",
  sort: "head",
  visible: BATCH_SIZE,
  filtered: [],
  summary: {
    head: 0,
    context: 0,
    cid: 0,
    unlocated: 0,
  },
};

const els = {
  meta: document.querySelector("#reviewMeta"),
  search: document.querySelector("#reviewSearch"),
  kindFilter: document.querySelector("#kindFilter"),
  sortMode: document.querySelector("#sortMode"),
  list: document.querySelector("#reviewList"),
  count: document.querySelector("#reviewCount"),
  note: document.querySelector("#saveStatus"),
  template: document.querySelector("#reviewTemplate"),
  loadMore: document.querySelector("#reviewLoadMore"),
};

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status}`);
  }
  return response.json();
}

async function loadText(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    return "";
  }
  return response.text();
}

function parseTsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function normalize(value) {
  return (value || "").trim().toLocaleLowerCase();
}

function codepoints(value) {
  if (isCidToken(value)) {
    return value;
  }
  return Array.from(value || "")
    .map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

function isCidToken(value) {
  return /^\(cid:\d+\)$/i.test(value || "");
}

function isInlineGlyphChar(char) {
  const codepoint = char.codePointAt(0);
  return (
    (0xE000 <= codepoint && codepoint <= 0xF8FF) ||
    (0xF0000 <= codepoint && codepoint <= 0x10FFFF) ||
    codepoint > 0x323AF
  );
}

function appendRichText(parent, value) {
  if (isCidToken(value)) {
    parent.append(document.createTextNode(value));
    return;
  }
  for (const char of Array.from(value || "")) {
    if (isInlineGlyphChar(char)) {
      const glyphPath = state.inlineGlyphs[`U+${char.codePointAt(0).toString(16).toUpperCase()}`];
      const span = document.createElement("span");
      if (glyphPath) {
        span.className = "inline-glyph-mask";
        span.setAttribute("role", "img");
        span.setAttribute("aria-label", char);
        span.style.setProperty("--inline-glyph-url", `url("${glyphPath}")`);
      } else {
        span.className = "inline-glyph";
        span.textContent = char;
      }
      span.title = codepoints(char);
      parent.append(span);
    } else {
      parent.append(document.createTextNode(char));
    }
  }
}

function appendHighlightedText(parent, value, token) {
  const text = value || "";
  if (!token || !text.includes(token) || isCidToken(token)) {
    appendRichText(parent, text);
    return;
  }

  let offset = 0;
  while (offset < text.length) {
    const index = text.indexOf(token, offset);
    if (index < 0) {
      appendRichText(parent, text.slice(offset));
      break;
    }
    appendRichText(parent, text.slice(offset, index));
    const mark = document.createElement("mark");
    mark.className = "pua-hit";
    appendRichText(mark, token);
    parent.append(mark);
    offset = index + token.length;
  }
}

function iterManualTokens(text) {
  const source = text || "";
  const cidPattern = /\(cid:\d+\)/gi;
  const cids = [...source.matchAll(cidPattern)].map((match) => match[0]);
  const withoutCid = source.replace(cidPattern, "");
  return [...cids, ...Array.from(withoutCid).filter((char) => !/\s/.test(char))];
}

function buildOccurrenceIndex(records, rows, fields) {
  const wanted = new Set(rows.map((row) => row.token));
  const index = new Map(rows.map((row) => [row.token, []]));

  for (const record of records) {
    const fieldHits = new Map();
    for (const field of fields) {
      for (const token of iterManualTokens(record[field])) {
        if (!wanted.has(token)) {
          continue;
        }
        if (!fieldHits.has(token)) {
          fieldHits.set(token, new Set());
        }
        fieldHits.get(token).add(field);
      }
    }
    for (const [token, hitFields] of fieldHits) {
      index.get(token).push({
        record,
        fields: [...hitFields],
      });
    }
  }

  return index;
}

function prepareRows(rows, records) {
  const headIndex = buildOccurrenceIndex(records, rows, ["main", "sub"]);
  const contextIndex = buildOccurrenceIndex(records, rows, ["main", "sub", "title", "source"]);

  const preparedRows = rows.map((row) => {
    const headCount = headIndex.get(row.token)?.length || 0;
    const contextCount = contextIndex.get(row.token)?.length || 0;
    let kind = "unlocated";
    if (isCidToken(row.token)) {
      kind = "cid";
    } else if (headCount > 0) {
      kind = "head";
    } else if (contextCount > 0) {
      kind = "context";
    }
    return {
      ...row,
      codepoint: row.codepoint || codepoints(row.token),
      headCount,
      contextCount,
      kind,
    };
  });

  state.summary = preparedRows.reduce(
    (summary, row) => {
      summary[row.kind] += 1;
      return summary;
    },
    { head: 0, context: 0, cid: 0, unlocated: 0 }
  );

  return { preparedRows, headIndex, contextIndex };
}

function occurrencesFor(row) {
  const head = state.headIndex.get(row.token) || [];
  if (head.length) {
    return head;
  }
  return state.contextIndex.get(row.token) || [];
}

function occurrenceFor(row) {
  const occurrences = occurrencesFor(row);
  if (!occurrences.length) {
    return null;
  }
  const cursor = Math.min(state.cursors.get(row.token) || 0, occurrences.length - 1);
  state.cursors.set(row.token, cursor);
  return occurrences[cursor];
}

function textForSearch(row) {
  const occurrence = occurrenceFor(row);
  const record = occurrence?.record;
  return normalize(
    [
      row.token,
      row.codepoint,
      row.category,
      KIND_LABELS[row.kind],
      row.first_book,
      row.first_main,
      row.first_sub,
      row.first_title,
      record?.main,
      record?.sub,
      record?.title,
      record?.source,
      record?.period,
      occurrence?.fields.map((field) => FIELD_LABELS[field]).join(" "),
    ].join(" ")
  );
}

function compareRows(a, b) {
  if (state.sort === "codepoint") {
    return String(a.codepoint || "").localeCompare(String(b.codepoint || ""), "zh-Hant");
  }
  if (state.sort === "kind") {
    const kindDelta = (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99);
    if (kindDelta) {
      return kindDelta;
    }
  }
  if (state.sort === "count") {
    return Number(b.count || 0) - Number(a.count || 0) || String(a.codepoint || "").localeCompare(String(b.codepoint || ""), "zh-Hant");
  }
  return (
    Number(b.headCount || 0) - Number(a.headCount || 0) ||
    Number(b.contextCount || 0) - Number(a.contextCount || 0) ||
    Number(b.count || 0) - Number(a.count || 0) ||
    String(a.codepoint || "").localeCompare(String(b.codepoint || ""), "zh-Hant")
  );
}

function applyFilters() {
  const terms = normalize(state.query).split(/\s+/).filter(Boolean);
  state.filtered = state.rows
    .filter((row) => {
      if (state.kind !== "all" && row.kind !== state.kind) {
        return false;
      }
      if (!terms.length) {
        return true;
      }
      const haystack = textForSearch(row);
      return terms.every((term) => haystack.includes(term));
    })
    .sort(compareRows);
  state.visible = Math.min(state.visible, Math.max(BATCH_SIZE, state.visible));
  renderList();
}

function formatRecordMeta(match) {
  const record = match?.record;
  if (!record) {
    return "未找到對應記錄";
  }
  const hitFields = match.fields.map((field) => FIELD_LABELS[field]).join("、");
  const parts = [
    hitFields ? `命中：${hitFields}` : "",
    record.source,
    record.period,
    record.book ? `${record.book} · 第 ${record.group} 組` : "",
  ].filter(Boolean);
  parts.push(`PDF 第 ${record.pdfPage} 頁`);
  if (record.printPage) {
    parts.push(`原書頁 ${record.printPage}`);
  }
  return parts.join(" · ");
}

function appendLidingLine(parent, label, value, token, highlight = true) {
  const line = document.createElement("div");
  line.className = "review-liding-line";
  const labelNode = document.createElement("span");
  labelNode.className = "review-liding-label";
  labelNode.textContent = label;
  const valueNode = document.createElement("span");
  valueNode.className = "review-liding-value";
  if (highlight) {
    appendHighlightedText(valueNode, value || "未標註", token);
  } else {
    appendRichText(valueNode, value || "未標註");
  }
  line.append(labelNode, valueNode);
  parent.append(line);
}

function renderFilterCard(row) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const occurrences = occurrencesFor(row);
  const occurrence = occurrenceFor(row);
  const record = occurrence?.record;

  node.dataset.token = row.token;
  node.dataset.kind = row.kind;

  const image = node.querySelector(".review-image");
  if (record?.image) {
    image.src = record.image;
    image.alt = [record.main, record.sub, record.title].filter(Boolean).join(" ");
  } else {
    image.removeAttribute("src");
    image.alt = "";
  }

  const token = node.querySelector(".review-token");
  appendRichText(token, row.token);
  token.title = codepoints(row.token);

  const codepoint = node.querySelector(".review-codepoint");
  codepoint.textContent = `${row.codepoint || codepoints(row.token)} · 清單 ${Number(row.count || 0).toLocaleString("zh-Hant")} 次 · 字頭 ${row.headCount.toLocaleString("zh-Hant")} 例`;

  const kind = node.querySelector(".pua-kind-pill");
  kind.textContent = KIND_LABELS[row.kind];
  kind.dataset.kind = row.kind;

  const context = node.querySelector(".review-context");
  appendLidingLine(context, "主字頭", record?.main || row.first_main, row.token);
  appendLidingLine(context, "子字頭", record?.sub || row.first_sub, row.token);
  appendLidingLine(context, "器名", record?.title || row.first_title, row.token, row.kind !== "head");

  const meta = document.createElement("div");
  meta.className = "review-record-meta";
  meta.textContent = formatRecordMeta(occurrence);
  context.append(meta);

  const tools = node.querySelector(".review-example-tools");
  if (occurrences.length > 1) {
    const cursor = (state.cursors.get(row.token) || 0) + 1;
    const label = document.createElement("span");
    label.textContent = `示例 ${cursor}/${occurrences.length}`;
    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "tiny-button";
    prev.dataset.action = "prev-example";
    prev.dataset.token = row.token;
    prev.textContent = "上一例";
    const next = document.createElement("button");
    next.type = "button";
    next.className = "tiny-button";
    next.dataset.action = "next-example";
    next.dataset.token = row.token;
    next.textContent = "下一例";
    tools.append(label, prev, next);
  } else {
    tools.textContent = occurrences.length ? "僅 1 個示例" : "沒有可定位示例";
  }

  return node;
}

function renderList() {
  els.list.replaceChildren();
  const visible = state.filtered.slice(0, state.visible);
  updateCount();

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "沒有匹配的 PUA/未編碼項";
    els.list.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    for (const row of visible) {
      fragment.append(renderFilterCard(row));
    }
    els.list.append(fragment);
  }

  els.loadMore.hidden = state.filtered.length <= state.visible;
}

function updateCount() {
  els.count.textContent = `${state.filtered.length.toLocaleString("zh-Hant")} 個未編碼項`;
}

function changeOccurrence(token, delta) {
  const row = state.rows.find((item) => item.token === token);
  if (!row) {
    return;
  }
  const occurrences = occurrencesFor(row);
  if (!occurrences.length) {
    return;
  }
  const current = state.cursors.get(token) || 0;
  const next = (current + delta + occurrences.length) % occurrences.length;
  state.cursors.set(token, next);
  renderList();
}

function wireEvents() {
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    state.visible = BATCH_SIZE;
    applyFilters();
  });

  els.kindFilter.addEventListener("change", () => {
    state.kind = els.kindFilter.value;
    state.visible = BATCH_SIZE;
    applyFilters();
  });

  els.sortMode.addEventListener("change", () => {
    state.sort = els.sortMode.value;
    state.visible = BATCH_SIZE;
    applyFilters();
  });

  els.list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const delta = button.dataset.action === "prev-example" ? -1 : 1;
    changeOccurrence(button.dataset.token, delta);
  });

  els.loadMore.addEventListener("click", () => {
    state.visible = Math.min(state.filtered.length, state.visible + BATCH_SIZE);
    renderList();
  });
}

async function boot() {
  try {
    const [puaText, records, inlineGlyphs] = await Promise.all([
      loadText("./data/pua_chars.tsv"),
      loadJson("./data/records.json"),
      loadJson("./data/inline_glyphs.json"),
    ]);
    const rows = parseTsv(puaText);
    state.records = records;
    state.inlineGlyphs = inlineGlyphs;
    const { preparedRows, headIndex, contextIndex } = prepareRows(rows, records);
    state.rows = preparedRows;
    state.headIndex = headIndex;
    state.contextIndex = contextIndex;
    const contextOnly = state.summary.context + state.summary.unlocated;
    els.meta.textContent = `${state.rows.length.toLocaleString("zh-Hant")} 個 PUA/未編碼項 · ${state.summary.head.toLocaleString("zh-Hant")} 個字頭可定位 · ${state.summary.cid.toLocaleString("zh-Hant")} 個 CID · ${contextOnly.toLocaleString("zh-Hant")} 個僅上下文或未定位 · ${records.length.toLocaleString("zh-Hant")} 筆字形記錄`;
    els.note.textContent = "僅供篩選與定位，不再收集 IDS";
    wireEvents();
    applyFilters();
  } catch (error) {
    els.meta.textContent = "資料載入失敗";
    els.list.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = error.message;
    els.list.append(empty);
  }
}

boot();
