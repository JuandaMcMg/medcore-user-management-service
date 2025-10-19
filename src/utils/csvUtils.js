const { parse } = require("csv-parse/sync");

// Limpia BOM, comillas envolventes, etc.
function cleanToken(t) {
  if (t === null || t === undefined) return t;
  return String(t)
    .replace(/\uFEFF/g, "") // BOM
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "");
}

function normalizeRowKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = cleanToken(k).toLowerCase().replace(/\s+/g, "_");
    out[key] = typeof v === "string" ? cleanToken(v) : v;
  }
  return out;
}

function stripEnclosingQuotesPerLine(text) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        const inner = trimmed.slice(1, -1);
        return inner.replace(/""/g, '"');
      }
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        const inner = trimmed.slice(1, -1);
        return inner.replace(/''/g, "'");
      }
      return line;
    })
    .join("\n");
}

function labelDelim(d) {
  if (d === "\t") return "\\t";
  if (d === ",") return ",";
  if (d === ";") return ";";
  if (d === "|") return "|";
  return d;
}

function tryParse(input, { delimiter, quote }) {
  const buf = typeof input === "string" ? input : input;
  const opts = {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter,
  };
  if (quote !== undefined) opts.quote = quote;
  return parse(buf, opts);
}

// Parser robusto (idéntico en comportamiento al que ya usas)
function parseCsvRobustVerbose(buffer) {
  const delims = [",", ";", "\t", "|"];

  try {
    const head = buffer.slice(0, 120).toString("utf8");
    console.log(`[CSV] Head bytes: ${JSON.stringify(head)}`);
  } catch (e) {
    console.log("[CSV] No se pudo imprimir head bytes:", e.message);
  }

  for (const d of delims) {
    try {
      const tmp = tryParse(buffer, { delimiter: d });
      const keys = Object.keys(tmp[0] || {});
      console.log(`[CSV] Probe delim "${labelDelim(d)}" -> rows=${tmp.length}, keys=${keys.length} :: ${keys.join("|")}`);
      if (tmp.length > 0 && keys.length >= 2) {
        console.log(`[CSV] ✅ Elegido delimitador: "${labelDelim(d)}" con ${keys.length} columnas`);
        return tmp.map(normalizeRowKeys);
      }
    } catch (e) {
      console.log(`[CSV] ❌ Falló delim "${labelDelim(d)}": ${e.message}`);
    }
  }

  console.log("[CSV] Reintento con quote:false (tratar comillas como texto)...");
  for (const d of delims) {
    try {
      const tmp = tryParse(buffer, { delimiter: d, quote: false });
      const keys = Object.keys(tmp[0] || {});
      console.log(`[CSV][q=false] Probe delim "${labelDelim(d)}" -> rows=${tmp.length}, keys=${keys.length} :: ${keys.join("|")}`);
      if (tmp.length > 0 && keys.length >= 2) {
        console.log(`[CSV][q=false] ✅ Elegido delimitador: "${labelDelim(d)}" con ${keys.length} columnas`);
        return tmp.map(normalizeRowKeys);
      }
    } catch (e) {
      console.log(`[CSV][q=false] ❌ Falló delim "${labelDelim(d)}": ${e.message}`);
    }
  }

  console.log("[CSV] Fallback: quitando comillas envolventes por línea y reintentando parseo...");
  const cleaned = stripEnclosingQuotesPerLine(buffer.toString("utf8"));

  for (const d of delims) {
    try {
      const tmp = tryParse(cleaned, { delimiter: d });
      const keys = Object.keys(tmp[0] || {});
      console.log(`[CSV][CLEAN] Probe delim "${labelDelim(d)}" -> rows=${tmp.length}, keys=${keys.length} :: ${keys.join("|")}`);
      if (tmp.length > 0 && keys.length >= 2) {
        console.log(`[CSV][CLEAN] ✅ Elegido delimitador: "${labelDelim(d)}" con ${keys.length} columnas`);
        return tmp.map(normalizeRowKeys);
      }
    } catch (e) {
      console.log(`[CSV][CLEAN] ❌ Falló delim "${labelDelim(d)}": ${e.message}`);
    }
  }

  console.log("[CSV] Ningún intento produjo >=2 columnas. CSV mal formado o con formato no estándar.");
  return [];
}

module.exports = {
  cleanToken,
  normalizeRowKeys,
  stripEnclosingQuotesPerLine,
  labelDelim,
  parseCsvRobustVerbose,
};