import { Notice } from "obsidian";
import type DataXtractPlugin from "./main";

/**
 * Registers editor commands. These are mostly dev/diagnostic helpers — the
 * primary interface is the `window.MarkdownTableParser` API.
 */
export function registerCommands(plugin: DataXtractPlugin): void {
	plugin.addCommand({
		id: "parse-current-note",
		name: "Parse tables in current note (log to console)",
		editorCallback: async (_editor, ctx) => {
			const file = ctx.file;
			if (!file) {
				new Notice("No active file.");
				return;
			}
			const note = await plugin.parseFile(file.path);
			const count = note?.tables.length ?? 0;
			console.log("[DataXtract] Parsed note:", note);
			new Notice(`DataXtract: parsed ${count} table(s) — see console.`);
		},
	});
}
