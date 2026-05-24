const LANG_STORAGE_KEY = "jinwen-ui-language";
const DEFAULT_LANG = "zh-Hant";

function storedLanguage() {
  try {
    const value = localStorage.getItem(LANG_STORAGE_KEY);
    return ["zh-Hant", "en", "ja"].includes(value) ? value : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

const state = {
  records: [],
  chars: {},
  puaIds: {},
  inlineGlyphs: {},
  cidGlyphs: {},
  annotations: {},
  meta: null,
  lang: storedLanguage(),
  mode: "head",
  headScope: "all",
  view: "detail",
  headQuery: "",
  objectQuery: "",
  domainQuery: "",
  phoneticQuery: "",
  semanticQuery: "",
  wordQuery: "",
  domainRegexError: "",
  book: "",
  period: "",
  visible: 80,
  filtered: [],
};

const els = {
  datasetMeta: document.querySelector("#datasetMeta"),
  headInput: document.querySelector("#headInput"),
  objectInput: document.querySelector("#objectInput"),
  domainInput: document.querySelector("#domainInput"),
  phoneticInput: document.querySelector("#phoneticInput"),
  semanticInput: document.querySelector("#semanticInput"),
  wordInput: document.querySelector("#wordInput"),
  domainLabel: document.querySelector("#domainLabel"),
  phoneticLabel: document.querySelector("#phoneticLabel"),
  semanticLabel: document.querySelector("#semanticLabel"),
  wordLabel: document.querySelector("#wordLabel"),
  annotationFilterStatus: document.querySelector("#annotationFilterStatus"),
  bookFilter: document.querySelector("#bookFilter"),
  periodFilter: document.querySelector("#periodFilter"),
  clearButton: document.querySelector("#clearButton"),
  resultCount: document.querySelector("#resultCount"),
  puaStatus: document.querySelector("#puaStatus"),
  results: document.querySelector("#results"),
  template: document.querySelector("#resultTemplate"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  scopeStack: document.querySelector("#scopeStack"),
  scopeButtons: [...document.querySelectorAll(".scope-button")],
  viewButtons: [...document.querySelectorAll(".view-button")],
  langButtons: [...document.querySelectorAll(".lang-button")],
  puaLink: document.querySelector("#puaLink"),
  annotateLink: document.querySelector("#annotateLink"),
  searchPanel: document.querySelector(".search-panel"),
  modeLabel: document.querySelector("#modeLabel"),
  scopeLabel: document.querySelector("#scopeLabel"),
  topHeading: document.querySelector("h1"),
};

const I18N = {
  "zh-Hant": {
    appTitle: "金文字形檢索",
    loading: "正在載入資料...",
    loadFailed: "資料載入失敗",
    datasetMeta: "{records} 筆字形記錄 · {books} 個分編",
    searchPanelLabel: "檢索條件",
    headSearchLabel: "字頭檢索",
    headInputPlaceholder: "主字頭、子字頭，或部件/IDS",
    objectLabel: "器名 / 來源",
    objectPlaceholder: "器名、集成號、銘圖號",
    modeLabel: "檢索方式",
    headMode: "字頭",
    componentMode: "部件/IDS",
    modeAria: "檢索方式",
    scopeLabel: "字頭範圍",
    scopeAria: "字頭範圍",
    scopeAll: "主+子",
    scopeMain: "主字頭",
    scopeSub: "子字頭",
    bookLabel: "分編",
    periodLabel: "時期",
    allBooks: "全部分編",
    allPeriods: "全部時期",
    clear: "清空",
    resultCount: "{count} 筆結果",
    puaStatus: "PUA/未編碼：{manual} 個 · 內嵌字型：{fonts} 個 · 圖片字：{inline} 個",
    puaList: "PUA 篩選",
    annotateList: "協作標註",
    annotationSearchLabel: "擴展標註檢索",
    domainLabel: "諧聲域",
    domainPlaceholder: "支援正則，如 ^A$ 或 [AB]",
    phoneticLabel: "聲首",
    phoneticPlaceholder: "一級或二級聲首",
    semanticLabel: "義符",
    semanticPlaceholder: "義符，可用空格分隔",
    wordLabel: "詞",
    wordPlaceholder: "詞義或詞例",
    domainRegexError: "諧聲域正則式無效：{message}",
    xieshengDomain: "諧聲域",
    phoneticInitial: "聲首",
    semanticComponent: "義符",
    word: "詞",
    note: "備註",
    viewAria: "結果視圖",
    detail: "詳細",
    compact: "緊湊",
    loadMore: "載入更多",
    noResults: "沒有匹配結果",
    main: "主",
    sub: "子",
    colon: "：",
    unmarked: "未標註",
    periodMissing: "時期未標註",
    objectMissing: "器名未標註",
    sourceMissing: "來源未標註",
    pageGroup: "第 {group} 組",
    pdfPage: "PDF 第 {page} 頁",
    printPage: "原書頁 {page}",
    langAria: "介面語言",
  },
  en: {
    appTitle: "Bronze Inscription Glyph Search",
    loading: "Loading data...",
    loadFailed: "Failed to load data",
    datasetMeta: "{records} glyph records · {books} sections",
    searchPanelLabel: "Search filters",
    headSearchLabel: "Head search",
    headInputPlaceholder: "Main head, subhead, or component/IDS",
    objectLabel: "Object / Source",
    objectPlaceholder: "Object name, Jicheng no., Mingtu no.",
    modeLabel: "Search mode",
    headMode: "Head",
    componentMode: "Components/IDS",
    modeAria: "Search mode",
    scopeLabel: "Head scope",
    scopeAria: "Head scope",
    scopeAll: "Main + sub",
    scopeMain: "Main only",
    scopeSub: "Sub only",
    bookLabel: "Section",
    periodLabel: "Period",
    allBooks: "All sections",
    allPeriods: "All periods",
    clear: "Clear",
    resultCount: "{count} results",
    puaStatus: "PUA/unencoded: {manual} · embedded fonts: {fonts} · image glyphs: {inline}",
    puaList: "PUA filter",
    annotateList: "Collaborative tags",
    annotationSearchLabel: "Extended tag search",
    domainLabel: "Xiesheng domain",
    domainPlaceholder: "Regex supported, e.g. ^A$ or [AB]",
    phoneticLabel: "Phonetic initial",
    phoneticPlaceholder: "Primary or secondary initial",
    semanticLabel: "Semantic sign",
    semanticPlaceholder: "Semantic signs, separated by spaces",
    wordLabel: "Word",
    wordPlaceholder: "Meaning or example",
    domainRegexError: "Invalid xiesheng-domain regex: {message}",
    xieshengDomain: "Xiesheng",
    phoneticInitial: "Initial",
    semanticComponent: "Semantic",
    word: "Word",
    note: "Note",
    viewAria: "Result view",
    detail: "Detail",
    compact: "Compact",
    loadMore: "Load more",
    noResults: "No matching results",
    main: "Main",
    sub: "Sub",
    colon: ": ",
    unmarked: "unmarked",
    periodMissing: "period unmarked",
    objectMissing: "object unmarked",
    sourceMissing: "source unmarked",
    pageGroup: "Group {group}",
    pdfPage: "PDF p. {page}",
    printPage: "book p. {page}",
    langAria: "Interface language",
  },
  ja: {
    appTitle: "金文字形検索",
    loading: "データを読み込み中...",
    loadFailed: "データの読み込みに失敗しました",
    datasetMeta: "{records} 件の字形記録 · {books} 分類",
    searchPanelLabel: "検索条件",
    headSearchLabel: "字頭検索",
    headInputPlaceholder: "主字頭、子字頭、または構成要素/IDS",
    objectLabel: "器名 / 出典",
    objectPlaceholder: "器名、集成番号、銘図番号",
    modeLabel: "検索方式",
    headMode: "字頭",
    componentMode: "構成要素/IDS",
    modeAria: "検索方式",
    scopeLabel: "字頭範囲",
    scopeAria: "字頭範囲",
    scopeAll: "主+子",
    scopeMain: "主のみ",
    scopeSub: "子のみ",
    bookLabel: "分類",
    periodLabel: "時期",
    allBooks: "すべての分類",
    allPeriods: "すべての時期",
    clear: "クリア",
    resultCount: "{count} 件",
    puaStatus: "PUA/未符号化：{manual} 個 · 埋込フォント：{fonts} 個 · 画像字：{inline} 個",
    puaList: "PUA フィルタ",
    annotateList: "共同注記",
    annotationSearchLabel: "拡張注記検索",
    domainLabel: "諧声域",
    domainPlaceholder: "正規表現可。例：^A$ または [AB]",
    phoneticLabel: "声首",
    phoneticPlaceholder: "一次または二次声首",
    semanticLabel: "義符",
    semanticPlaceholder: "義符。空白で区切る",
    wordLabel: "語",
    wordPlaceholder: "語義または用例",
    domainRegexError: "諧声域の正規表現が無効です：{message}",
    xieshengDomain: "諧声域",
    phoneticInitial: "声首",
    semanticComponent: "義符",
    word: "語",
    note: "備考",
    viewAria: "結果表示",
    detail: "詳細",
    compact: "コンパクト",
    loadMore: "さらに表示",
    noResults: "一致する結果はありません",
    main: "主",
    sub: "子",
    colon: "：",
    unmarked: "未記載",
    periodMissing: "時期未記載",
    objectMissing: "器名未記載",
    sourceMissing: "出典未記載",
    pageGroup: "第 {group} 組",
    pdfPage: "PDF {page}ページ",
    printPage: "原書 {page}頁",
    langAria: "インターフェース言語",
  },
};

function t(key, params = {}) {
  const messages = I18N[state.lang] || I18N[DEFAULT_LANG];
  const template = messages[key] || I18N[DEFAULT_LANG][key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

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

const PERIOD_LABELS = {
  en: {
    商代: "Shang",
    商代早期: "Early Shang",
    商代中期: "Middle Shang",
    商代晚期: "Late Shang",
    西周: "Western Zhou",
    西周早期: "Early Western Zhou",
    西周中期: "Middle Western Zhou",
    西周晚期: "Late Western Zhou",
    春秋: "Spring and Autumn",
    春秋早期: "Early Spring and Autumn",
    春秋中期: "Middle Spring and Autumn",
    春秋晚期: "Late Spring and Autumn",
    戰國: "Warring States",
    戰國早期: "Early Warring States",
    戰國中期: "Middle Warring States",
    戰國晚期: "Late Warring States",
    秦代: "Qin",
    漢代: "Han",
  },
  ja: {
    商代: "商代",
    商代早期: "商代前期",
    商代中期: "商代中期",
    商代晚期: "商代後期",
    西周: "西周",
    西周早期: "西周前期",
    西周中期: "西周中期",
    西周晚期: "西周後期",
    春秋: "春秋時代",
    春秋早期: "春秋前期",
    春秋中期: "春秋中期",
    春秋晚期: "春秋後期",
    戰國: "戦国時代",
    戰國早期: "戦国前期",
    戰國中期: "戦国中期",
    戰國晚期: "戦国後期",
    秦代: "秦代",
    漢代: "漢代",
  },
};

const BOOK_LABELS = {
  en: {
    正文: "Main text",
    合文: "Ligatures",
    單一族徽: "Single clan emblems",
    複合族徽: "Compound clan emblems",
  },
  ja: {
    正文: "本文",
    合文: "合文",
    單一族徽: "単一族徽",
    複合族徽: "複合族徽",
  },
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

async function loadOptionalJson(path) {
  try {
    return await loadJson(path);
  } catch {
    return {};
  }
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

function filledPuaMap(rows) {
  const output = {};
  for (const row of rows) {
    if (row.token && row.ids) {
      output[row.token] = `${row.token} ${row.ids}`;
    }
  }
  return output;
}

function localizedPeriod(value) {
  return PERIOD_LABELS[state.lang]?.[value] || value;
}

function localizedBook(value) {
  return BOOK_LABELS[state.lang]?.[value] || value;
}

function setOptions(select, values, allLabel, labeler = (value) => value) {
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = allLabel;
  select.append(all);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.append(option);
  }
}

function normalize(value) {
  return (value || "").trim().toLocaleLowerCase();
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

function stripCidPlaceholders(value) {
  return (value || "").replace(CID_RE, " ");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(state.lang === "zh-Hant" ? "zh-Hant" : state.lang);
}

function sortedPeriods(values) {
  return [...values].filter(Boolean).sort((a, b) => {
    const rankDelta = periodRank(a) - periodRank(b);
    return rankDelta || a.localeCompare(b, "zh-Hant");
  });
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

function headText(record) {
  if (state.headScope === "main") {
    return record.searchMain;
  }
  if (state.headScope === "sub") {
    return record.searchSub;
  }
  return record.searchHead;
}

function objectText(record) {
  return record.searchObject;
}

function componentTextForRecord(record) {
  return record.searchComponent;
}

function matchesHeadQuery(record, terms) {
  if (!terms.length) {
    return true;
  }
  if (state.mode === "component") {
    const componentText = componentTextForRecord(record);
    return terms.every((term) => componentText.includes(term));
  }
  const text = headText(record);
  return terms.every((term) => text.includes(term));
}

function matchesObjectQuery(record, terms) {
  if (!terms.length) {
    return true;
  }
  const text = objectText(record);
  return terms.every((term) => text.includes(term));
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
  return record.annotation?.headOverride?.main || record.main;
}

function displaySub(record) {
  return record.annotation?.headOverride?.sub || record.sub;
}

function phoneticText(annotation) {
  return (annotation?.phoneticInitials || [])
    .map((item) => [item.primary, ...(item.secondary || [])].filter(Boolean).join(" "))
    .join(" ");
}

function wordsText(annotation) {
  return (annotation?.words || []).map((item) => `${item.meaning || ""} ${item.example || ""}`).join(" ");
}

function annotationSearchText(record, key) {
  const annotation = record.annotation;
  if (!annotation) {
    return "";
  }
  if (key === "phonetic") {
    return normalize(phoneticText(annotation));
  }
  if (key === "semantic") {
    return normalize((annotation.semanticComponents || []).join(" "));
  }
  if (key === "word") {
    return normalize(wordsText(annotation));
  }
  return "";
}

function termsMatch(text, terms) {
  return !terms.length || terms.every((term) => text.includes(term));
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
  const rest = text.slice(offset);
  for (const char of Array.from(rest)) {
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

function setRichText(element, value, fallback) {
  element.replaceChildren();
  appendRichText(element, value || fallback);
}

function setTokenLabel(element, labelKey, value) {
  element.replaceChildren();
  element.append(document.createTextNode(`${t(labelKey)}${t("colon")}`));
  appendRichText(element, value || t("unmarked"));
  element.title = codepoints(value);
}

const glyphScaleCache = new Map();

function glyphScaleFor(span) {
  const style = getComputedStyle(span);
  const fontSize = parseFloat(style.fontSize) || 16;
  const font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const key = `${font}|${span.textContent}`;
  if (glyphScaleCache.has(key)) {
    return glyphScaleCache.get(key);
  }
  const canvas = glyphScaleFor.canvas || (glyphScaleFor.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font;
  const measured = context.measureText(span.textContent);
  const reference = context.measureText("漢");
  const glyphHeight = (measured.actualBoundingBoxAscent || 0) + (measured.actualBoundingBoxDescent || 0);
  const referenceHeight =
    (reference.actualBoundingBoxAscent || 0) + (reference.actualBoundingBoxDescent || 0) || fontSize * 0.9;
  const rawScale = glyphHeight > 0 ? referenceHeight / glyphHeight : 1;
  const scale = rawScale > 1.12 ? Math.min(3.35, Math.max(1.15, rawScale)) : 1;
  glyphScaleCache.set(key, scale);
  return scale;
}

function calibrateInlineGlyphs(root = els.results) {
  const run = () => {
    for (const span of root.querySelectorAll(".inline-glyph")) {
      const scale = glyphScaleFor(span);
      span.classList.toggle("scaled-inline-glyph", scale > 1);
      span.style.setProperty("--glyph-scale", scale.toFixed(2));
      span.style.marginInline = scale > 1 ? `${Math.min(0.34, (scale - 1) * 0.1).toFixed(2)}em` : "";
    }
  };
  if (document.fonts && document.fonts.status !== "loaded") {
    document.fonts.ready.then(run);
  } else {
    run();
  }
}

function applyFilters() {
  const headTerms = normalize(state.headQuery).split(/\s+/).filter(Boolean);
  const objectTerms = normalize(state.objectQuery).split(/\s+/).filter(Boolean);
  const phoneticTerms = normalize(state.phoneticQuery).split(/\s+/).filter(Boolean);
  const semanticTerms = normalize(state.semanticQuery).split(/\s+/).filter(Boolean);
  const wordTerms = normalize(state.wordQuery).split(/\s+/).filter(Boolean);
  const domainRegex = compileDomainRegex();
  state.filtered = state.records.filter((record) => {
    if (domainRegex === false) {
      return false;
    }
    if (state.book && record.book !== state.book) {
      return false;
    }
    if (state.period && record.period !== state.period) {
      return false;
    }
    if (!matchesHeadQuery(record, headTerms) || !matchesObjectQuery(record, objectTerms)) {
      return false;
    }
    if (domainRegex && !domainRegex.test(record.annotation?.xieshengDomain || "")) {
      return false;
    }
    return (
      termsMatch(annotationSearchText(record, "phonetic"), phoneticTerms) &&
      termsMatch(annotationSearchText(record, "semantic"), semanticTerms) &&
      termsMatch(annotationSearchText(record, "word"), wordTerms)
    );
  }).sort(compareRecords);
  state.visible = Math.min(state.visible, Math.max(80, state.visible));
  renderResults();
}

function renderAnnotationFilterStatus() {
  if (!els.annotationFilterStatus) {
    return;
  }
  if (state.domainRegexError) {
    els.annotationFilterStatus.hidden = false;
    els.annotationFilterStatus.textContent = t("domainRegexError", { message: state.domainRegexError });
    return;
  }
  els.annotationFilterStatus.hidden = true;
  els.annotationFilterStatus.textContent = "";
}

function tokenLabel(labelKey, value) {
  return `${t(labelKey)}${t("colon")}${value || t("unmarked")}`;
}

function codepoints(value) {
  if (/^\(cid:\d+\)$/i.test(value || "")) {
    return cidLabel(value);
  }
  return [...(value || "")]
    .map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
}

function prepareRecords(records) {
  return records.map((record) => {
    const annotation = state.annotations[record.id] || null;
    const main = annotation?.headOverride?.main || record.main;
    const sub = annotation?.headOverride?.sub || record.sub;
    const componentChars = [...new Set(stripCidPlaceholders(record.componentHead).split("").filter((char) => !/\s/.test(char)))];
    return {
      ...record,
      annotation,
      searchMain: normalize([stripCidPlaceholders(main), stripCidPlaceholders(record.main)].join(" ")),
      searchSub: normalize([stripCidPlaceholders(sub), stripCidPlaceholders(record.sub)].join(" ")),
      searchHead: normalize(
        [stripCidPlaceholders(main), stripCidPlaceholders(sub), stripCidPlaceholders(record.main), stripCidPlaceholders(record.sub)].join(
          " "
        )
      ),
      searchObject: normalize([stripCidPlaceholders(record.title), stripCidPlaceholders(record.source)].join(" ")),
      searchComponent: normalize(
        componentChars
          .map((char) => [char, state.chars[char] || "", state.puaIds[char] || ""].join(" "))
          .join(" ")
      ),
    };
  });
}

function compileDomainRegex() {
  state.domainRegexError = "";
  const query = state.domainQuery.trim();
  if (!query) {
    return null;
  }
  try {
    return new RegExp(query, "i");
  } catch (error) {
    state.domainRegexError = error.message;
    return false;
  }
}

function renderResults() {
  els.results.replaceChildren();
  els.results.classList.toggle("compact", state.view === "compact");
  const visibleRecords = state.filtered.slice(0, state.visible);
  els.resultCount.textContent = t("resultCount", { count: formatNumber(state.filtered.length) });

  if (!visibleRecords.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("noResults");
    els.results.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    for (const record of visibleRecords) {
      fragment.append(state.view === "compact" ? renderCompactRecord(record) : renderRecord(record));
    }
    els.results.append(fragment);
  }

  els.loadMoreButton.hidden = state.filtered.length <= state.visible;
  renderAnnotationFilterStatus();
  calibrateInlineGlyphs();
}

function nextBatchSize() {
  return state.view === "compact" ? 160 : 80;
}

function loadMoreResults() {
  if (state.visible >= state.filtered.length) {
    return false;
  }
  state.visible = Math.min(state.filtered.length, state.visible + nextBatchSize());
  renderResults();
  return true;
}

let autoLoadQueued = false;
let lastAutoLoadAt = 0;

function queueAutoLoadCheck() {
  if (autoLoadQueued) {
    return;
  }
  autoLoadQueued = true;
  requestAnimationFrame(() => {
    autoLoadQueued = false;
    maybeAutoLoadResults();
  });
}

function maybeAutoLoadResults() {
  if (state.visible >= state.filtered.length) {
    return;
  }
  const page = document.documentElement;
  const distanceToBottom = page.scrollHeight - window.scrollY - window.innerHeight;
  const threshold = Math.max(520, window.innerHeight * 0.75);
  if (distanceToBottom <= threshold) {
    const now = performance.now();
    if (now - lastAutoLoadAt < 250) {
      return;
    }
    lastAutoLoadAt = now;
    loadMoreResults();
  }
}

function renderRecord(record) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const image = node.querySelector(".glyph-image");
  image.src = record.image;
  image.alt = `${displayMain(record) || ""} ${displaySub(record) || ""} ${record.title || ""}`.trim();

  const main = node.querySelector(".main-token");
  setTokenLabel(main, "main", displayMain(record));

  const sub = node.querySelector(".sub-token");
  setTokenLabel(sub, "sub", displaySub(record));

  node.querySelector(".period-pill").textContent = record.period ? localizedPeriod(record.period) : t("periodMissing");
  setRichText(node.querySelector(".record-title"), record.title, t("objectMissing"));
  node.querySelector(".source-line").textContent = record.source || t("sourceMissing");

  const pageParts = [record.book ? localizedBook(record.book) : ""].filter(Boolean);
  if (record.group) {
    pageParts.push(t("pageGroup", { group: record.group }));
  }
  pageParts.push(t("pdfPage", { page: record.pdfPage }));
  if (record.printPage) {
    pageParts.push(t("printPage", { page: record.printPage }));
  }
  node.querySelector(".page-line").textContent = pageParts.join(" · ");
  appendAnnotationSummary(node.querySelector(".result-body"), record.annotation);
  return node;
}

function appendAnnotationSummary(parent, annotation) {
  if (!hasAnnotation(annotation)) {
    return;
  }
  const row = document.createElement("div");
  row.className = "annotation-summary";

  if (annotation.xieshengDomain) {
    row.append(annotationChip(t("xieshengDomain"), annotation.xieshengDomain));
  }
  if (annotation.phoneticInitials?.length) {
    row.append(annotationChip(t("phoneticInitial"), formatPhoneticInitials(annotation.phoneticInitials)));
  }
  if (annotation.semanticComponents?.length) {
    row.append(annotationChip(t("semanticComponent"), annotation.semanticComponents.join("、")));
  }
  if (annotation.words?.length) {
    const text = annotation.words
      .slice(0, 2)
      .map((item) => [item.meaning, item.example].filter(Boolean).join("："))
      .join("；");
    row.append(annotationChip(t("word"), text));
  }
  if (annotation.note) {
    row.append(annotationChip(t("note"), annotation.note));
  }
  parent.append(row);
}

function formatPhoneticInitials(items) {
  return items
    .map((item) => {
      const secondary = item.secondary?.length ? `(${item.secondary.join("、")})` : "";
      return `${item.primary || ""}${secondary}`;
    })
    .filter(Boolean)
    .join("、");
}

function annotationChip(label, value) {
  const chip = document.createElement("span");
  chip.className = "annotation-chip";
  chip.append(document.createTextNode(`${label}: `));
  appendRichText(chip, value);
  return chip;
}

function renderCompactRecord(record) {
  const node = document.createElement("article");
  node.className = "compact-card";
  node.title = [
    tokenLabel("main", displayMain(record)),
    tokenLabel("sub", displaySub(record)),
    record.title || t("objectMissing"),
    record.source || t("sourceMissing"),
  ].join(" · ");
  node.setAttribute("aria-label", node.title);

  const frame = document.createElement("div");
  frame.className = "compact-glyph-frame";
  const image = document.createElement("img");
  image.className = "compact-glyph-image";
  image.loading = "lazy";
  image.src = record.image;
  image.alt = `${displayMain(record) || ""} ${displaySub(record) || ""} ${record.title || ""}`.trim();
  frame.append(image);

  const period = document.createElement("div");
  period.className = "compact-period";
  period.textContent = record.period ? localizedPeriod(record.period) : t("periodMissing");

  node.append(frame, period);
  return node;
}

function setActiveButtons(buttons, activeValue, dataName) {
  for (const button of buttons) {
    const isActive = button.dataset[dataName] === activeValue;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function updateScopeAvailability() {
  const disabled = state.mode === "component";
  els.scopeStack.classList.toggle("scope-disabled", disabled);
  for (const button of els.scopeButtons) {
    button.disabled = disabled;
  }
}

function refreshOptions() {
  if (!state.meta) {
    return;
  }
  const currentBook = state.book;
  const currentPeriod = state.period;
  setOptions(els.bookFilter, state.meta.books || [], t("allBooks"), localizedBook);
  setOptions(els.periodFilter, sortedPeriods(state.meta.periods || []), t("allPeriods"), localizedPeriod);
  els.bookFilter.value = currentBook;
  els.periodFilter.value = currentPeriod;
}

function updatePuaStatus() {
  if (!state.meta) {
    els.puaStatus.textContent = t("puaStatus", { manual: "0", fonts: "0", inline: "0" });
    return;
  }
  els.puaStatus.textContent = t("puaStatus", {
    manual: formatNumber(state.meta.manualTokenCount),
    fonts: formatNumber(state.meta.fontCount || 0),
    inline: formatNumber(state.meta.inlineGlyphCount || Object.keys(state.inlineGlyphs).length),
  });
}

function applyLanguage({ rerender = true } = {}) {
  document.documentElement.lang = state.lang;
  document.title = t("appTitle");
  els.topHeading.textContent = t("appTitle");
  els.searchPanel.setAttribute("aria-label", t("searchPanelLabel"));
  els.puaLink.textContent = t("puaList");
  els.puaLink.setAttribute("aria-label", t("puaList"));
  els.annotateLink.textContent = t("annotateList");
  els.annotateLink.setAttribute("aria-label", t("annotateList"));
  document.querySelector(".lang-control").setAttribute("aria-label", t("langAria"));

  const labels = document.querySelectorAll(".search-box span");
  labels[0].textContent = t("headSearchLabel");
  labels[1].textContent = t("objectLabel");
  els.headInput.placeholder = t("headInputPlaceholder");
  els.objectInput.placeholder = t("objectPlaceholder");
  document.querySelector(".annotation-row").setAttribute("aria-label", t("annotationSearchLabel"));
  els.domainLabel.textContent = t("domainLabel");
  els.domainInput.placeholder = t("domainPlaceholder");
  els.phoneticLabel.textContent = t("phoneticLabel");
  els.phoneticInput.placeholder = t("phoneticPlaceholder");
  els.semanticLabel.textContent = t("semanticLabel");
  els.semanticInput.placeholder = t("semanticPlaceholder");
  els.wordLabel.textContent = t("wordLabel");
  els.wordInput.placeholder = t("wordPlaceholder");
  els.modeLabel.textContent = t("modeLabel");
  els.scopeLabel.textContent = t("scopeLabel");
  document.querySelector(".mode-control").setAttribute("aria-label", t("modeAria"));
  document.querySelector(".scope-control").setAttribute("aria-label", t("scopeAria"));

  const filterLabels = document.querySelectorAll(".filter-row span");
  filterLabels[0].textContent = t("bookLabel");
  filterLabels[1].textContent = t("periodLabel");
  els.clearButton.textContent = t("clear");
  els.loadMoreButton.textContent = t("loadMore");
  document.querySelector(".view-control").setAttribute("aria-label", t("viewAria"));

  for (const button of els.modeButtons) {
    button.textContent = button.dataset.mode === "head" ? t("headMode") : t("componentMode");
  }
  for (const button of els.scopeButtons) {
    const key = button.dataset.scope === "main" ? "scopeMain" : button.dataset.scope === "sub" ? "scopeSub" : "scopeAll";
    button.textContent = t(key);
  }
  for (const button of els.viewButtons) {
    button.textContent = button.dataset.view === "detail" ? t("detail") : t("compact");
  }

  refreshOptions();
  if (state.meta) {
    els.datasetMeta.textContent = t("datasetMeta", {
      records: formatNumber(state.meta.recordCount),
      books: formatNumber(state.meta.bookCount),
    });
  }
  updatePuaStatus();
  setActiveButtons(els.langButtons, state.lang, "lang");
  setActiveButtons(els.modeButtons, state.mode, "mode");
  setActiveButtons(els.scopeButtons, state.headScope, "scope");
  setActiveButtons(els.viewButtons, state.view, "view");
  updateScopeAvailability();
  if (rerender) {
    renderResults();
  }
}

function wireEvents() {
  els.headInput.addEventListener("input", () => {
    state.headQuery = els.headInput.value;
    state.visible = 80;
    scheduleApplyFilters();
  });

  els.objectInput.addEventListener("input", () => {
    state.objectQuery = els.objectInput.value;
    state.visible = 80;
    scheduleApplyFilters();
  });

  els.domainInput.addEventListener("input", () => {
    state.domainQuery = els.domainInput.value;
    state.visible = 80;
    scheduleApplyFilters();
  });

  els.phoneticInput.addEventListener("input", () => {
    state.phoneticQuery = els.phoneticInput.value;
    state.visible = 80;
    scheduleApplyFilters();
  });

  els.semanticInput.addEventListener("input", () => {
    state.semanticQuery = els.semanticInput.value;
    state.visible = 80;
    scheduleApplyFilters();
  });

  els.wordInput.addEventListener("input", () => {
    state.wordQuery = els.wordInput.value;
    state.visible = 80;
    scheduleApplyFilters();
  });

  els.bookFilter.addEventListener("change", () => {
    state.book = els.bookFilter.value;
    state.visible = 80;
    applyFilters();
  });

  els.periodFilter.addEventListener("change", () => {
    state.period = els.periodFilter.value;
    state.visible = 80;
    applyFilters();
  });

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      setActiveButtons(els.modeButtons, state.mode, "mode");
      updateScopeAvailability();
      state.visible = 80;
      applyFilters();
    });
  });

  els.scopeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.headScope = button.dataset.scope;
      setActiveButtons(els.scopeButtons, state.headScope, "scope");
      state.visible = 80;
      applyFilters();
    });
  });

  els.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      setActiveButtons(els.viewButtons, state.view, "view");
      state.visible = 80;
      renderResults();
    });
  });

  els.langButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      try {
        localStorage.setItem(LANG_STORAGE_KEY, state.lang);
      } catch {
        // Ignore storage failures; the UI can still switch for this session.
      }
      applyLanguage();
    });
  });

  els.clearButton.addEventListener("click", () => {
    state.headQuery = "";
    state.objectQuery = "";
    state.domainQuery = "";
    state.phoneticQuery = "";
    state.semanticQuery = "";
    state.wordQuery = "";
    state.domainRegexError = "";
    state.book = "";
    state.period = "";
    state.visible = 80;
    els.headInput.value = "";
    els.objectInput.value = "";
    els.domainInput.value = "";
    els.phoneticInput.value = "";
    els.semanticInput.value = "";
    els.wordInput.value = "";
    els.bookFilter.value = "";
    els.periodFilter.value = "";
    applyFilters();
  });

  els.loadMoreButton.addEventListener("click", loadMoreResults);
  window.addEventListener("scroll", queueAutoLoadCheck, { passive: true });
  window.addEventListener("resize", queueAutoLoadCheck);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          maybeAutoLoadResults();
        }
      },
      { rootMargin: "700px 0px" }
    );
    observer.observe(els.loadMoreButton);
  }
}

let filterTimer = 0;

function scheduleApplyFilters() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(applyFilters, 70);
}

async function boot() {
  try {
    const [records, chars, meta, inlineGlyphs, cidGlyphs, annotations, puaIdsText] = await Promise.all([
      loadJson("./data/records.json"),
      loadJson("./data/chars.json"),
      loadJson("./data/meta.json"),
      loadOptionalJson("./data/inline_glyphs.json"),
      loadOptionalJson("./data/cid_glyphs.json"),
      loadOptionalJson("./data/annotations.json"),
      loadText("./data/pua_ids.tsv"),
    ]);
    state.chars = chars;
    state.meta = meta;
    state.inlineGlyphs = inlineGlyphs;
    state.cidGlyphs = cidGlyphs;
    state.annotations = normalizeAnnotations(annotations);
    state.puaIds = filledPuaMap(parseTsv(puaIdsText));
    state.records = prepareRecords(records);

    wireEvents();
    applyLanguage({ rerender: false });
    applyFilters();
  } catch (error) {
    els.datasetMeta.textContent = t("loadFailed");
    els.results.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = error.message;
    els.results.append(empty);
  }
}

boot();
