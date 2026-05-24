const STORAGE_KEY = "jinwen-glyph-annotation-drafts-v1";
const EXPORT_SCHEMA = "jinwen-glyph-annotations-v1";
const BATCH_SIZE = 80;

const PERIOD_ORDER = [
  "商代",
  "商代早期",
  "商代中期",
  "商代晚期",
  "西周",
  "西周早期",
  "西周中期",
  "西周晚期",
  "春秋",
  "春秋早期",
  "春秋中期",
  "春秋晚期",
  "戰國",
  "戰國早期",
  "戰國中期",
  "戰國晚期",
  "秦代",
  "漢代",
];

const PERIOD_RANK = new Map(PERIOD_ORDER.map((period, index) => [period, index]));
const BOOK_RANK = new Map([
  ["正文", 0],
  ["合文", 1],
  ["單一族徽", 2],
  ["複合族徽", 3],
]);
const CID_RE = /\(cid:\d+\)/gi;

const state = {
  records: [],
  recordMap: new Map(),
  baseAnnotations: {},
  annotations: {},
  inlineGlyphs: {},
  cidGlyphs: {},
  meta: null,
  filtered: [],
  selectedId: "",
  query: "",
  book: "",
  period: "",
  progress: "all",
  visible: BATCH_SIZE,
  renderingEditor: false,
};

const els = {
  meta: document.querySelector("#annotationMeta"),
  search: document.querySelector("#annotationSearch"),
  bookFilter: document.querySelector("#annotationBookFilter"),
  periodFilter: document.querySelector("#annotationPeriodFilter"),
  progressFilter: document.querySelector("#annotationProgressFilter"),
  importInput: document.querySelector("#annotationImport"),
  exportButton: document.querySelector("#annotationExport"),
  clearButton: document.querySelector("#annotationClear"),
  count: document.querySelector("#annotationCount"),
  saveState: document.querySelector("#annotationSaveState"),
  list: document.querySelector("#annotationList"),
  loadMore: document.querySelector("#annotationLoadMore"),
  listTemplate: document.querySelector("#annotationListTemplate"),
  empty: document.querySelector("#annotationEmpty"),
  editor: document.querySelector("#annotationEditor"),
  form: document.querySelector("#annotationForm"),
  selectedGlyphImage: document.querySelector("#selectedGlyphImage"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedHeads: document.querySelector("#selectedHeads"),
  selectedSource: document.querySelector("#selectedSource"),
  selectedPages: document.querySelector("#selectedPages"),
  mainOverride: document.querySelector("#mainOverride"),
  subOverride: document.querySelector("#subOverride"),
  xieshengDomain: document.querySelector("#xieshengDomain"),
  semanticComponents: document.querySelector("#semanticComponents"),
  phoneticRows: document.querySelector("#phoneticRows"),
  wordRows: document.querySelector("#wordRows"),
  addPhonetic: document.querySelector("#addPhonetic"),
  addWord: document.querySelector("#addWord"),
  note: document.querySelector("#annotationNote"),
  clearCurrent: document.querySelector("#clearCurrent"),
  previousRecord: document.querySelector("#previousRecord"),
  nextRecord: document.querySelector("#nextRecord"),
  currentSaveState: document.querySelector("#currentSaveState"),
  phoneticRowTemplate: document.querySelector("#phoneticRowTemplate"),
  wordRowTemplate: document.querySelector("#wordRowTemplate"),
};

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path}: ${response.status}`);
  }
  return response.json();
}

async function loadOptionalJson(path) {
  try {
    return await loadJson(path);
  } catch {
    return {};
  }
}

function compactSpaces(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function splitTags(value) {
  if (Array.isArray(value)) {
    return value.map(compactSpaces).filter(Boolean);
  }
  return String(value || "")
    .split(/[、,，;；\n\r\t ]+/)
    .map(compactSpaces)
    .filter(Boolean);
}

function normalize(value) {
  return compactSpaces(value).toLocaleLowerCase();
}

function stripCidPlaceholders(value) {
  return (value || "").replace(CID_RE, " ");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-Hant");
}

function periodRank(period) {
  if (!period) {
    return 999;
  }
  return PERIOD_RANK.has(period) ? PERIOD_RANK.get(period) : 900;
}

function compareRecords(a, b) {
  return (
    periodRank(a.period) - periodRank(b.period) ||
    (BOOK_RANK.get(a.book) ?? 99) - (BOOK_RANK.get(b.book) ?? 99) ||
    Number(a.group || 0) - Number(b.group || 0) ||
    Number(a.pdfPage || 0) - Number(b.pdfPage || 0) ||
    String(a.title || "").localeCompare(String(b.title || ""), "zh-Hant") ||
    String(a.id || "").localeCompare(String(b.id || ""))
  );
}

function sortedPeriods(values) {
  return [...values].filter(Boolean).sort((a, b) => periodRank(a) - periodRank(b) || a.localeCompare(b, "zh-Hant"));
}

function setOptions(select, values, allLabel) {
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = allLabel;
  select.append(all);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function normalizeAnnotations(data) {
  const source = data?.records || data?.annotations || data || {};
  const output = {};
  for (const [id, raw] of Object.entries(source)) {
    const annotation = normalizeAnnotation(raw);
    if (hasAnnotation(annotation)) {
      output[id] = annotation;
    }
  }
  return output;
}

function normalizeAnnotation(raw = {}) {
  const headOverride = raw.headOverride || {};
  const phoneticSource = raw.phoneticInitials || raw.phonetics || [];
  const wordSource = raw.words || [];
  return {
    headOverride: {
      main: compactSpaces(headOverride.main || raw.mainOverride || ""),
      sub: compactSpaces(headOverride.sub || raw.subOverride || ""),
    },
    xieshengDomain: compactSpaces(raw.xieshengDomain || raw.domain || "").toUpperCase(),
    phoneticInitials: Array.isArray(phoneticSource)
      ? phoneticSource
          .map((item) => ({
            primary: compactSpaces(item?.primary || item?.level1 || ""),
            secondary: splitTags(item?.secondary || item?.level2 || []),
          }))
          .filter((item) => item.primary || item.secondary.length)
      : [],
    semanticComponents: splitTags(raw.semanticComponents || raw.semantic || []),
    words: Array.isArray(wordSource)
      ? wordSource
          .map((item) => ({
            meaning: compactSpaces(item?.meaning || item?.sense || ""),
            example: compactSpaces(item?.example || ""),
          }))
          .filter((item) => item.meaning || item.example)
      : [],
    note: compactSpaces(raw.note || raw.remark || ""),
  };
}

function hasAnnotation(annotation) {
  return Boolean(
    annotation &&
      (annotation.headOverride?.main ||
        annotation.headOverride?.sub ||
        annotation.xieshengDomain ||
        annotation.phoneticInitials?.length ||
        annotation.semanticComponents?.length ||
        annotation.words?.length ||
        annotation.note)
  );
}

function displayMain(record) {
  return state.annotations[record.id]?.headOverride?.main || record.main;
}

function displaySub(record) {
  return state.annotations[record.id]?.headOverride?.sub || record.sub;
}

function annotationText(annotation) {
  if (!annotation) {
    return "";
  }
  return [
    annotation.headOverride?.main,
    annotation.headOverride?.sub,
    annotation.xieshengDomain,
    ...(annotation.semanticComponents || []),
    ...(annotation.phoneticInitials || []).flatMap((item) => [item.primary, ...(item.secondary || [])]),
    ...(annotation.words || []).flatMap((item) => [item.meaning, item.example]),
    annotation.note,
  ]
    .filter(Boolean)
    .join(" ");
}

function recordSearchText(record) {
  return normalize(
    [
      record.id,
      stripCidPlaceholders(record.main),
      stripCidPlaceholders(record.sub),
      stripCidPlaceholders(displayMain(record)),
      stripCidPlaceholders(displaySub(record)),
      stripCidPlaceholders(record.title),
      stripCidPlaceholders(record.source),
      record.book,
      record.period,
      annotationText(state.annotations[record.id]),
    ].join(" ")
  );
}

function applyFilters() {
  const terms = normalize(state.query).split(/\s+/).filter(Boolean);
  state.filtered = state.records.filter((record) => {
    if (state.book && record.book !== state.book) {
      return false;
    }
    if (state.period && record.period !== state.period) {
      return false;
    }
    const filled = hasAnnotation(state.annotations[record.id]);
    if (state.progress === "filled" && !filled) {
      return false;
    }
    if (state.progress === "empty" && filled) {
      return false;
    }
    const text = recordSearchText(record);
    return terms.every((term) => text.includes(term));
  });
  state.visible = Math.min(state.visible, Math.max(BATCH_SIZE, state.visible));
  renderList();
  renderMeta();
  if (!state.filtered.some((record) => record.id === state.selectedId)) {
    selectRecord(state.filtered[0]?.id || "", { updateHash: false });
  }
}

function isInlineGlyphChar(char) {
  const codepoint = char.codePointAt(0);
  return (
    (0xE000 <= codepoint && codepoint <= 0xF8FF) ||
    (0xF0000 <= codepoint && codepoint <= 0x10FFFF) ||
    codepoint > 0x323AF
  );
}

function cidLabel(token) {
  const number = /\d+/.exec(token || "")?.[0] || "";
  return number ? `PDF 未解碼字 ${number}` : "PDF 未解碼字";
}

function appendCidGlyph(parent, token) {
  const path = state.cidGlyphs[token];
  if (!path) {
    const span = document.createElement("span");
    span.className = "cid-fallback";
    span.textContent = cidLabel(token);
    parent.append(span);
    return;
  }
  const image = document.createElement("img");
  image.className = "cid-inline-glyph";
  image.src = path;
  image.alt = cidLabel(token);
  image.title = cidLabel(token);
  image.loading = "lazy";
  parent.append(image);
}

function appendRichText(parent, value) {
  const text = value || "";
  let offset = 0;
  for (const match of text.matchAll(CID_RE)) {
    appendRichText(parent, text.slice(offset, match.index));
    appendCidGlyph(parent, match[0]);
    offset = match.index + match[0].length;
  }
  for (const char of Array.from(text.slice(offset))) {
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

function setRichText(element, value, fallback = "") {
  element.replaceChildren();
  appendRichText(element, value || fallback);
}

function codepoints(value) {
  if (/^\(cid:\d+\)$/i.test(value || "")) {
    return cidLabel(value);
  }
  return [...(value || "")]
    .map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

function renderMeta() {
  const filled = Object.values(state.annotations).filter(hasAnnotation).length;
  els.meta.textContent = `${formatNumber(state.records.length)} 筆字形記錄 · ${formatNumber(filled)} 筆本機/已載入標註`;
  els.count.textContent = `${formatNumber(state.filtered.length)} 筆字圖 · 已顯示 ${formatNumber(
    Math.min(state.visible, state.filtered.length)
  )} 筆`;
}

function renderList() {
  els.list.replaceChildren();
  const visibleRecords = state.filtered.slice(0, state.visible);
  const fragment = document.createDocumentFragment();
  for (const record of visibleRecords) {
    fragment.append(renderListItem(record));
  }
  els.list.append(fragment);
  els.loadMore.hidden = state.filtered.length <= state.visible;
}

function renderListItem(record) {
  const node = els.listTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.id = record.id;
  node.classList.toggle("active", record.id === state.selectedId);
  const image = node.querySelector(".annotation-list-image");
  image.src = record.image;
  image.alt = `${displayMain(record) || ""} ${displaySub(record) || ""} ${record.title || ""}`.trim();
  setRichText(node.querySelector(".annotation-item-title"), record.title, "器名未標註");
  const meta = node.querySelector(".annotation-item-meta");
  meta.replaceChildren();
  appendRichText(meta, `主:${displayMain(record) || "未標註"} · 子:${displaySub(record) || "未標註"}`);
  meta.append(document.createTextNode(` · ${[record.period || "時期未標註", record.source || ""].filter(Boolean).join(" · ")}`));
  const pill = node.querySelector(".annotation-status-pill");
  const filled = hasAnnotation(state.annotations[record.id]);
  pill.classList.toggle("filled", filled);
  pill.textContent = filled ? "已標註" : "未標註";
  node.addEventListener("click", () => selectRecord(record.id));
  return node;
}

function selectRecord(id, { updateHash = true } = {}) {
  state.selectedId = id || "";
  if (updateHash && id) {
    history.replaceState(null, "", `#id=${encodeURIComponent(id)}`);
  }
  renderList();
  renderEditor();
}

function renderEditor() {
  const record = state.recordMap.get(state.selectedId);
  els.empty.hidden = Boolean(record);
  els.editor.hidden = !record;
  if (!record) {
    els.currentSaveState.textContent = "尚未選擇";
    return;
  }

  state.renderingEditor = true;
  const annotation = state.annotations[record.id] || normalizeAnnotation();
  els.selectedGlyphImage.src = record.image;
  els.selectedGlyphImage.alt = `${displayMain(record) || ""} ${displaySub(record) || ""} ${record.title || ""}`.trim();
  setRichText(els.selectedTitle, record.title, "器名未標註");
  els.selectedHeads.replaceChildren();
  els.selectedHeads.append(document.createTextNode("主字頭："));
  appendRichText(els.selectedHeads, record.main || "未標註");
  els.selectedHeads.append(document.createTextNode(" · 子字頭："));
  appendRichText(els.selectedHeads, record.sub || "未標註");
  els.selectedHeads.append(document.createTextNode(` · 記錄 ID：${record.id}`));
  els.selectedSource.textContent = [record.source, record.period, record.book].filter(Boolean).join(" · ");
  els.selectedPages.textContent = [
    record.group ? `第 ${record.group} 組` : "",
    record.pdfPage ? `PDF 第 ${record.pdfPage} 頁` : "",
    record.printPage ? `原書頁 ${record.printPage}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  els.mainOverride.value = annotation.headOverride?.main || "";
  els.subOverride.value = annotation.headOverride?.sub || "";
  els.xieshengDomain.value = annotation.xieshengDomain || "";
  els.semanticComponents.value = (annotation.semanticComponents || []).join(" ");
  els.note.value = annotation.note || "";
  renderPhoneticRows(annotation.phoneticInitials?.length ? annotation.phoneticInitials : [{ primary: "", secondary: [] }]);
  renderWordRows(annotation.words?.length ? annotation.words : [{ meaning: "", example: "" }]);
  updateCurrentSaveState();
  state.renderingEditor = false;
}

function renderPhoneticRows(rows) {
  els.phoneticRows.replaceChildren();
  for (const row of rows) {
    const node = els.phoneticRowTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".phonetic-primary").value = row.primary || "";
    node.querySelector(".phonetic-secondary").value = (row.secondary || []).join(" ");
    els.phoneticRows.append(node);
  }
}

function renderWordRows(rows) {
  els.wordRows.replaceChildren();
  for (const row of rows) {
    const node = els.wordRowTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".word-meaning").value = row.meaning || "";
    node.querySelector(".word-example").value = row.example || "";
    els.wordRows.append(node);
  }
}

function captureAnnotation() {
  if (state.renderingEditor || !state.selectedId) {
    return;
  }
  const phoneticInitials = [...els.phoneticRows.querySelectorAll(".phonetic-row")]
    .map((row) => ({
      primary: compactSpaces(row.querySelector(".phonetic-primary").value),
      secondary: splitTags(row.querySelector(".phonetic-secondary").value),
    }))
    .filter((item) => item.primary || item.secondary.length);
  const words = [...els.wordRows.querySelectorAll(".word-row")]
    .map((row) => ({
      meaning: compactSpaces(row.querySelector(".word-meaning").value),
      example: compactSpaces(row.querySelector(".word-example").value),
    }))
    .filter((item) => item.meaning || item.example);

  const annotation = normalizeAnnotation({
    headOverride: {
      main: els.mainOverride.value,
      sub: els.subOverride.value,
    },
    xieshengDomain: els.xieshengDomain.value,
    semanticComponents: els.semanticComponents.value,
    phoneticInitials,
    words,
    note: els.note.value,
  });

  if (hasAnnotation(annotation)) {
    state.annotations[state.selectedId] = annotation;
  } else {
    delete state.annotations[state.selectedId];
  }
  persistDrafts();
  renderMeta();
  renderList();
  updateCurrentSaveState();
}

function updateCurrentSaveState() {
  const record = state.recordMap.get(state.selectedId);
  if (!record) {
    els.currentSaveState.textContent = "尚未選擇";
    return;
  }
  els.currentSaveState.textContent = hasAnnotation(state.annotations[record.id])
    ? "已保存到本機草稿"
    : "此條尚無標註";
}

function persistDrafts() {
  const payload = exportPayload();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    els.saveState.textContent = `已保存 ${formatNumber(Object.keys(payload.records).length)} 筆本機草稿；分享前請導出 JSON。`;
  } catch (error) {
    els.saveState.textContent = `本機保存失敗：${error.message}。請立即導出 JSON。`;
  }
}

function loadDrafts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeAnnotations(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function recordContext(record) {
  return {
    main: record.main || "",
    sub: record.sub || "",
    title: record.title || "",
    source: record.source || "",
    period: record.period || "",
    book: record.book || "",
    group: record.group || "",
    pdfPage: record.pdfPage || "",
    printPage: record.printPage || "",
    image: record.image || "",
  };
}

function exportPayload() {
  const records = {};
  for (const [id, annotation] of Object.entries(state.annotations)) {
    if (!hasAnnotation(annotation)) {
      continue;
    }
    records[id] = {
      ...annotation,
      record: recordContext(state.recordMap.get(id) || {}),
    };
  }
  return {
    schema: EXPORT_SCHEMA,
    updatedAt: new Date().toISOString(),
    recordCount: Object.keys(records).length,
    records,
  };
}

function downloadExport() {
  const payload = exportPayload();
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `jinwen-annotations-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importFile(file) {
  if (!file) {
    return;
  }
  try {
    const imported = normalizeAnnotations(JSON.parse(await file.text()));
    state.annotations = {
      ...state.annotations,
      ...imported,
    };
    persistDrafts();
    applyFilters();
    const first = Object.keys(imported)[0];
    if (first) {
      selectRecord(first);
    }
    els.saveState.textContent = `已匯入 ${formatNumber(Object.keys(imported).length)} 筆標註，並保存到本機草稿。`;
  } catch (error) {
    els.saveState.textContent = `匯入失敗：${error.message}`;
  } finally {
    els.importInput.value = "";
  }
}

function clearLocalDrafts() {
  if (!confirm("確定清空本機草稿？已導入但尚未導出的內容也會被移除。")) {
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures; the in-memory reset still works.
  }
  state.annotations = { ...state.baseAnnotations };
  applyFilters();
  renderEditor();
  els.saveState.textContent = "本機草稿已清空，仍保留網站內建標註資料。";
}

function clearCurrentAnnotation() {
  if (!state.selectedId) {
    return;
  }
  delete state.annotations[state.selectedId];
  persistDrafts();
  renderEditor();
  renderList();
  renderMeta();
}

function moveSelection(delta) {
  const index = state.filtered.findIndex((record) => record.id === state.selectedId);
  if (index < 0) {
    return;
  }
  const next = state.filtered[index + delta];
  if (next) {
    selectRecord(next.id);
    const button = els.list.querySelector(`[data-id="${CSS.escape(next.id)}"]`);
    button?.scrollIntoView({ block: "nearest" });
  }
}

function addPhoneticRow() {
  const node = els.phoneticRowTemplate.content.firstElementChild.cloneNode(true);
  els.phoneticRows.append(node);
  node.querySelector("input")?.focus();
}

function addWordRow() {
  const node = els.wordRowTemplate.content.firstElementChild.cloneNode(true);
  els.wordRows.append(node);
  node.querySelector("input")?.focus();
}

function handleRowRemove(event) {
  const button = event.target.closest("[data-remove-row]");
  if (!button) {
    return;
  }
  const row = button.closest(".phonetic-row, .word-row");
  row?.remove();
  captureAnnotation();
}

function wireEvents() {
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    state.visible = BATCH_SIZE;
    applyFilters();
  });

  els.bookFilter.addEventListener("change", () => {
    state.book = els.bookFilter.value;
    state.visible = BATCH_SIZE;
    applyFilters();
  });

  els.periodFilter.addEventListener("change", () => {
    state.period = els.periodFilter.value;
    state.visible = BATCH_SIZE;
    applyFilters();
  });

  els.progressFilter.addEventListener("change", () => {
    state.progress = els.progressFilter.value;
    state.visible = BATCH_SIZE;
    applyFilters();
  });

  els.loadMore.addEventListener("click", () => {
    state.visible = Math.min(state.filtered.length, state.visible + BATCH_SIZE);
    renderList();
    renderMeta();
  });

  els.form.addEventListener("submit", (event) => event.preventDefault());
  els.form.addEventListener("input", captureAnnotation);
  els.form.addEventListener("click", handleRowRemove);
  els.xieshengDomain.addEventListener("input", () => {
    const cursor = els.xieshengDomain.selectionStart;
    els.xieshengDomain.value = els.xieshengDomain.value.toUpperCase();
    els.xieshengDomain.setSelectionRange(cursor, cursor);
  });
  els.addPhonetic.addEventListener("click", addPhoneticRow);
  els.addWord.addEventListener("click", addWordRow);
  els.clearCurrent.addEventListener("click", clearCurrentAnnotation);
  els.previousRecord.addEventListener("click", () => moveSelection(-1));
  els.nextRecord.addEventListener("click", () => moveSelection(1));
  els.exportButton.addEventListener("click", downloadExport);
  els.importInput.addEventListener("change", () => importFile(els.importInput.files?.[0]));
  els.clearButton.addEventListener("click", clearLocalDrafts);
}

function initialSelectedId() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const id = params.get("id");
  return id && state.recordMap.has(id) ? id : state.filtered[0]?.id || "";
}

async function boot() {
  try {
    const [records, meta, inlineGlyphs, cidGlyphs, annotations] = await Promise.all([
      loadJson("./data/records.json"),
      loadJson("./data/meta.json"),
      loadOptionalJson("./data/inline_glyphs.json"),
      loadOptionalJson("./data/cid_glyphs.json"),
      loadOptionalJson("./data/annotations.json"),
    ]);
    state.records = records.slice().sort(compareRecords);
    state.recordMap = new Map(state.records.map((record) => [record.id, record]));
    state.meta = meta;
    state.inlineGlyphs = inlineGlyphs;
    state.cidGlyphs = cidGlyphs;
    state.baseAnnotations = normalizeAnnotations(annotations);
    state.annotations = {
      ...state.baseAnnotations,
      ...loadDrafts(),
    };

    setOptions(els.bookFilter, meta.books || [], "全部分編");
    setOptions(els.periodFilter, sortedPeriods(meta.periods || []), "全部時期");
    wireEvents();
    applyFilters();
    selectRecord(initialSelectedId(), { updateHash: false });
  } catch (error) {
    els.meta.textContent = "資料載入失敗";
    els.list.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = error.message;
    els.list.append(empty);
  }
}

boot();
