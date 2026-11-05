// Reads the junk-item tables out of a wiki snapshot (SPEC 5.3). Returns raw text per row; turning
// text into numbers and canonical names is normalize.ts's job. Works on both Nukapedia and the
// Independent Fallout Wiki, which share the table layout.

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

export interface RawComponent {
  name: string;
  quantity: number;
}

export interface RawRow {
  /** Heading the table sits under, e.g. "Base game", "Far Harbor". */
  section: string;
  /** Position in page order across all item tables, from 0. */
  order: number;
  name: string;
  valueText: string;
  weightText: string;
  components: RawComponent[];
  formIds: string[];
  /** Titles of the wiki's marker icons anywhere in the row, e.g. "Cut content". */
  markers: string[];
  /** Anything in the row the parser could not read. Non-empty means the row needs a decision. */
  problems: string[];
}

type Token = { kind: "break" } | { kind: "link"; text: string } | { kind: "text"; text: string };

const BLOCK_TAGS = new Set(["li", "p", "div", "ul", "ol"]);
const QUANTITY = /^[x×]\s*(\d+)\s*/i;
const BARE_NAME = /^([A-Za-z][A-Za-z '-]*?)\s*(?:[x×]\s*(\d+))?\s*$/i;
const FORM_ID = /^[0-9A-FX]{8}$/i;

function tokenize($: cheerio.CheerioAPI, nodes: AnyNode[], out: Token[] = []): Token[] {
  for (const node of nodes) {
    if (node.type === "text") {
      out.push({ kind: "text", text: $(node).text() });
    } else if (node.type === "tag") {
      if (node.name === "br") {
        out.push({ kind: "break" });
      } else if (node.name === "a") {
        out.push({ kind: "link", text: $(node).text() });
      } else if (BLOCK_TAGS.has(node.name)) {
        out.push({ kind: "break" });
        tokenize($, node.children, out);
        out.push({ kind: "break" });
      } else {
        tokenize($, node.children, out);
      }
    }
  }
  return out;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * One component per link, or per bare name between breaks; an "x N" after it is its quantity.
 * Built from the cell's structure, so `<a>Screw</a> x2 <a>Spring</a> x3` with no break between
 * them still yields two components.
 */
export function parseComponents(tokens: Token[]): {
  components: RawComponent[];
  problems: string[];
} {
  const components: RawComponent[] = [];
  const problems: string[] = [];
  let current: { name: string; quantity: number | null } | null = null;
  const flush = () => {
    if (current) components.push({ name: current.name, quantity: current.quantity ?? 1 });
    current = null;
  };

  for (const token of tokens) {
    if (token.kind === "break") {
      flush();
    } else if (token.kind === "link") {
      flush();
      current = { name: squash(token.text), quantity: null };
    } else {
      let text = squash(token.text);
      while (text) {
        const q = QUANTITY.exec(text);
        if (q && current && current.quantity === null) {
          current.quantity = Number(q[1]);
          text = text.slice(q[0].length);
          continue;
        }
        const bare = BARE_NAME.exec(text);
        if (bare?.[1]) {
          flush();
          current = { name: bare[1], quantity: bare[2] ? Number(bare[2]) : null };
          text = "";
          continue;
        }
        problems.push(`unreadable component text "${text}"`);
        text = "";
      }
    }
  }
  flush();
  return { components, problems };
}

function cellLines(tokens: Token[]): string[] {
  const lines: string[] = [];
  let line = "";
  for (const t of tokens) {
    if (t.kind === "break") {
      lines.push(line);
      line = "";
    } else {
      line += t.text;
    }
  }
  lines.push(line);
  return lines.map(squash).filter(Boolean);
}

function headingText($: cheerio.CheerioAPI, el: AnyNode): string {
  const h = $(el).clone();
  h.find(".mw-editsection").remove();
  return squash(h.text())
    .replace(/\[(edit)?\]$/i, "")
    .trim();
}

/** Every character a real item name uses. Anything else is reported, never slugged blindly. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 '’.,&#()!/:+-]*$/;

/**
 * Text a reader never sees on the page, or that is not part of the value: hidden sort keys,
 * footnote markers. Removed before any cell is read.
 */
const NOISE = [
  '[style*="display:none"]',
  '[style*="display: none"]',
  ".sortkey",
  "sup.reference",
  ".reference",
].join(", ");

export interface ParsedPage {
  rows: RawRow[];
  /** Item tables read, by section, with their row counts (a table can have none). */
  tablesRead: Array<{ section: string; rows: number }>;
  /** Data tables (sortable or va-table) whose headers did not match an item table. */
  unreadTables: Array<{ section: string; headers: string[] }>;
}

export function parseJunkTables(html: string): RawRow[] {
  return parseJunkPage(html).rows;
}

export function parseJunkPage(html: string): ParsedPage {
  const $ = cheerio.load(html);
  $(NOISE).remove();
  const rows: RawRow[] = [];
  const tablesRead: ParsedPage["tablesRead"] = [];
  const unreadTables: ParsedPage["unreadTables"] = [];
  let section = "";

  $("h2, h3, h4, table").each((_, el) => {
    if (el.type !== "tag") return;
    if (el.name !== "table") {
      section = headingText($, el);
      return;
    }
    const headerCells = $(el).find("tr").first().children("th, td");
    const headers = headerCells.toArray().map((c) => squash($(c).text()));
    const col = (h: string) => headers.indexOf(h);
    if (headers[0] !== "Name" || col("Components") < 0 || col("Value") < 0 || col("Weight") < 0) {
      if ($(el).is(".sortable, .va-table")) unreadTables.push({ section, headers });
      return;
    }
    const before = rows.length;

    $(el)
      .find("tr")
      .slice(1)
      .each((_, tr) => {
        const cells = $(tr).children("th, td").toArray();
        const problems: string[] = [];
        if (cells.length !== headers.length) {
          problems.push(`row has ${cells.length} cells, header has ${headers.length}`);
        }
        const cellTokens = (h: string) => {
          const cell = cells[col(h)];
          return cell && cell.type === "tag" ? tokenize($, cell.children) : [];
        };
        const text = (h: string) => cellLines(cellTokens(h)).join(" ");

        const parsed = parseComponents(cellTokens("Components"));
        problems.push(...parsed.problems);

        const formIdLines = col("Form ID") >= 0 ? cellLines(cellTokens("Form ID")) : [];
        const formIds: string[] = [];
        for (const line of formIdLines) {
          for (const piece of line.split(/[\s,]+/).filter(Boolean)) {
            if (FORM_ID.test(piece)) formIds.push(piece);
            else problems.push(`unreadable form ID "${piece}"`);
          }
        }

        // Marker icons can sit in any cell (one cut-content icon is in a Form ID cell).
        const markers = $(tr)
          .find(".va-icon[title]")
          .toArray()
          .map((icon) => $(icon).attr("title") ?? "");

        const name = text("Name");
        if (!NAME_PATTERN.test(name)) {
          problems.push(`name "${name}" has characters item names never use`);
        }

        rows.push({
          section,
          order: rows.length,
          name,
          valueText: text("Value"),
          weightText: text("Weight"),
          components: parsed.components,
          formIds,
          markers,
          problems,
        });
      });
    tablesRead.push({ section, rows: rows.length - before });
  });
  return { rows, tablesRead, unreadTables };
}
