/**
 * Core data model for the table extractor.
 *
 * A note is parsed into one {@link ParsedNote} containing zero or more
 * {@link ParsedTable}s. Every table exposes both a table-level accessor
 * ({@link ParsedTable.getValue}) and a per-row accessor ({@link SmartRow.get}),
 * so the same data can be consumed the way that best fits the caller.
 */

import type { Pos } from "obsidian";

/** A single raw cell is just a string. */
export type TableCell = string;

/** A raw table row is an array of cells. */
export type TableRow = TableCell[];

/**
 * A heading associated with a table — the nearest preceding heading in the
 * document, plus its level (1–6) and position (0-based, metadata-cache style).
 */
export interface AssociatedHeader {
	title: string;
	level: number;
	position: Pos;
}

/**
 * A custom transform function registered for a specific column.
 *
 * Receives the raw cell value, every cell in the same row (so values can be
 * derived from sibling columns), and the resolved column name. The return
 * value replaces the raw value whenever the column is read through `getValue`
 * or `SmartRow.get`. Returning non-string values (numbers, objects, …) is
 * explicitly supported.
 */
export type FieldTransformer = (
	rawValue: string,
	cells: TableCell[],
	columnName: string,
) => unknown;

/** Maps column header titles (case-insensitive) to transform functions. */
export type TransformerRegistry = Record<string, FieldTransformer>;

/**
 * A table row that is simultaneously a plain `string[]` (so `row[0]` and
 * destructuring work) and carries a convenience {@link SmartRow.get} method
 * that resolves columns by name or index and applies any registered transform.
 */
export interface SmartRow extends TableRow {
	/**
	 * Returns the (optionally transformed) cell value for a column.
	 * @param column header title (matched case-insensitively) or 0-based index.
	 */
	get(column: string | number): any;
}

/** A fully parsed markdown table ready for consumption. */
export interface ParsedTable {
	headers: string[];
	/** Smart rows — plain arrays, each also exposing a `.get(column)` helper. */
	rows: SmartRow[];
	/** Number of columns (header cells) and rows (body rows). */
	count: { columns: number; rows: number };
	/**
	 * Position of the table, metadata-cache style (all 0-based): from the
	 * first `|` of the header row to the last `|` of the table (inclusive).
	 */
	position: Pos;
	/** Nearest preceding heading, or `null` if there is none. */
	associatedHeader: AssociatedHeader | null;
	/**
	 * Full heading hierarchy at the table's position, from outermost (e.g. h1)
	 * down to the associated heading. Empty when there is no preceding heading.
	 */
	headingPath: AssociatedHeader[];

	/**
	 * Fixed signature: column first (header title or index), then the row index.
	 */
	getValue: (column: string | number, rowIndex: number) => any;
}

/** A parsed note with its frontmatter and all tables found in its body. */
export interface ParsedNote {
	/** Obsidian link text usable in markdown / dataview (e.g. `[[Note]]`). */
	fileLink: any;
	filePath: string;
	frontmatter: Record<string, any>;
	tables: ParsedTable[];
}

/** The public API exposed on `window.MarkdownTableParser`. */
export interface MarkdownTableParser {
	parseFolder: (
		folderPath: string,
		transformers?: TransformerRegistry,
	) => Promise<ParsedNote[]>;
	parseFile: (
		filePath: string,
		transformers?: TransformerRegistry,
	) => Promise<ParsedNote | null>;
}

declare global {
	interface Window {
		MarkdownTableParser?: MarkdownTableParser;
	}
}
