import {
	ESCAPED_PIPE_PLACEHOLDER,
	FENCE_REGEX,
	HEADING_REGEX,
	SEPARATOR_CELL_REGEX,
} from "./const";
import type {
	AssociatedHeader,
	FieldTransformer,
	ParsedTable,
	TableCell,
	TransformerRegistry,
} from "./types";

/** Intermediate table shape produced by the line scanner. */
export interface RawTable {
	headers: string[];
	rows: string[][];
	/** 1-based line number of the header row. */
	lineStart: number;
	/** 1-based line number of the last table line. */
	lineEnd: number;
	associatedHeader: AssociatedHeader | null;
	headingPath: AssociatedHeader[];
}

/**
 * Splits a single markdown table line into trimmed cell values.
 *
 * Handles optional leading/trailing pipes and protects escaped pipes (`\|`) so
 * they are not treated as column separators.
 */
export function splitTableRow(line: string): string[] {
	let l = line.trim();
	if (l.startsWith("|")) l = l.slice(1);
	if (l.endsWith("|") && !l.endsWith("\\|")) l = l.slice(0, -1);

	l = l.replace(/\\\|/g, ESCAPED_PIPE_PLACEHOLDER);
	return l
		.split("|")
		.map((c) => c.replace(new RegExp(ESCAPED_PIPE_PLACEHOLDER, "g"), "|").trim());
}

/**
 * Returns `true` when the line is a valid GFM table separator row
 * (e.g. `| --- | :--: | --: |`).
 */
export function isSeparatorRow(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed.includes("-") || !trimmed.includes("|")) return false;
	const cells = splitTableRow(trimmed);
	if (cells.length === 0) return false;
	return cells.every((c) => SEPARATOR_CELL_REGEX.test(c));
}

/** Parses a heading line into an {@link AssociatedHeader}, or `null`. */
export function parseHeading(line: string, lineNumber: number): AssociatedHeader | null {
	const match = HEADING_REGEX.exec(line);
	if (!match) return null;
	return { title: match[2].trim(), level: match[1].length, lineNumber };
}

/**
 * Walks the document line by line, tracking the active heading hierarchy and
 * code-fence state, and returns every GFM table found.
 *
 * A table is recognised as a header line immediately followed by a separator
 * line, plus any subsequent row lines. Content inside fenced code blocks is
 * ignored, so tables inside ```` ``` ```` blocks are not extracted.
 */
export function extractTables(content: string): RawTable[] {
	const lines = content.split(/\r?\n/);
	const tables: RawTable[] = [];
	const headingStack: AssociatedHeader[] = [];
	let inFence = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNumber = i + 1;

		// Toggle / skip fenced code blocks.
		if (FENCE_REGEX.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		// Track heading hierarchy: pop same-or-deeper levels, then push.
		if (/^#{1,6}\s/.test(line)) {
			const heading = parseHeading(line, lineNumber);
			if (heading) {
				while (
					headingStack.length > 0 &&
					headingStack[headingStack.length - 1].level >= heading.level
				) {
					headingStack.pop();
				}
				headingStack.push(heading);
			}
			continue;
		}

		// Potential table: header line + separator on the next line.
		if (line.includes("|") && isSeparatorRow(lines[i + 1] ?? "")) {
			const headers = splitTableRow(line);
			let j = i + 2; // first line after the separator
			const rows: string[][] = [];
			while (
				j < lines.length &&
				lines[j].trim() !== "" &&
				lines[j].includes("|") &&
				!isSeparatorRow(lines[j]) &&
				!FENCE_REGEX.test(lines[j]) &&
				!/^#{1,6}\s/.test(lines[j])
			) {
				rows.push(splitTableRow(lines[j]));
				j++;
			}

			tables.push({
				headers,
				rows,
				lineStart: lineNumber,
				lineEnd: j,
				associatedHeader:
					headingStack.length > 0
						? headingStack[headingStack.length - 1]
						: null,
				headingPath: [...headingStack],
			});
			i = j - 1; // resume scanning after the table
		}
	}

	return tables;
}

/**
 * Builds the public {@link ParsedTable} from a {@link RawTable}, wiring up the
 * table-level `getValue` accessor and per-row `.get` helpers and applying any
 * registered column {@link TransformerRegistry}.
 *
 * Column lookups by name are case-insensitive; an unknown column or out-of-range
 * index resolves to an empty string.
 */
export function buildParsedTable(
	raw: RawTable,
	transformers?: TransformerRegistry,
): ParsedTable {
	const { headers, rows: rawRows } = raw;

	const headerMap = new Map<string, number>();
	headers.forEach((h, index) => headerMap.set(h.trim().toLowerCase(), index));

	const normalizedTransformers = new Map<string, FieldTransformer>();
	if (transformers) {
		for (const [key, fn] of Object.entries(transformers)) {
			normalizedTransformers.set(key.trim().toLowerCase(), fn);
		}
	}

	const access = (cells: TableCell[], column: string | number): any => {
		let colIndex: number | undefined;
		let colName = "";

		if (typeof column === "string") {
			colName = column.trim();
			colIndex = headerMap.get(colName.toLowerCase());
		} else {
			colIndex = column;
			colName = headers[colIndex] ?? "";
		}

		if (colIndex === undefined || colIndex < 0) return "";

		const rawValue = cells[colIndex] ?? "";
		const transformer = normalizedTransformers.get(colName.toLowerCase());
		return transformer ? transformer(rawValue, cells, colName) : rawValue;
	};

	const smartRows = rawRows.map((cells) => {
		const row = [...cells] as ParsedTable["rows"][number];
		row.get = (column: string | number) => access(cells, column);
		return row;
	});

	return {
		headers,
		rows: smartRows,
		columnCount: headers.length,
		rowCount: smartRows.length,
		lineStart: raw.lineStart,
		lineEnd: raw.lineEnd,
		associatedHeader: raw.associatedHeader,
		headingPath: raw.headingPath,
		getValue: (column, rowIndex) => {
			const cells = rawRows[rowIndex];
			if (!cells) return "";
			return access(cells, column);
		},
	};
}
