import { Plugin, TFile } from "obsidian";
import { API_GLOBAL_NAME } from "./const";
import { DEFAULT_SETTINGS, MySettings } from "./settings";
import MyPluginSettingTab from "./settings";
import { registerCommands } from "./setup";
import type { MarkdownTableParser, ParsedNote, ParsedTable, TransformerRegistry } from "./types";
import { buildParsedTable, extractTables } from "./utils";

export default class DataXtractPlugin extends Plugin {
	declare settings: MySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

		this.addSettingTab(new MyPluginSettingTab(this.app, this));
		registerCommands(this);
		this.applyApiState();
	}

	onunload() {
		if (window[API_GLOBAL_NAME]) {
			delete window[API_GLOBAL_NAME];
		}
	}

	/** Exposes or removes the public API depending on the settings toggle. */
	applyApiState() {
		if (this.settings.enableApi) {
			const api: MarkdownTableParser = {
				parseFolder: (folderPath, transformers) =>
					this.parseFolder(folderPath, transformers),
				parseFile: (filePath, transformers) => this.parseFile(filePath, transformers),
			};
			window[API_GLOBAL_NAME] = api;
		} else if (window[API_GLOBAL_NAME]) {
			delete window[API_GLOBAL_NAME];
		}
	}

	/**
	 * Parses every markdown table in a single note.
	 * @param filePath vault-relative path (e.g. `Folder/Note.md`).
	 * @returns the parsed note, or `null` if the file does not exist / isn't markdown.
	 */
	async parseFile(
		filePath: string,
		transformers?: TransformerRegistry,
	): Promise<ParsedNote | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile) || file.extension !== "md") return null;

		const content = await this.app.vault.read(file);
		const tables: ParsedTable[] = extractTables(content).map((raw) =>
			buildParsedTable(raw, transformers),
		);

		const cache = this.app.metadataCache.getFileCache(file);
		return {
			fileLink: this.app.metadataCache.fileToLinktext(file, ""),
			filePath: file.path,
			frontmatter: (cache?.frontmatter ?? {}) as Record<string, any>,
			tables,
		};
	}

	/**
	 * Parses every markdown table in every note under a folder (recursively).
	 * Pass `""` or `"/"` to parse the entire vault.
	 * @param folderPath vault-relative folder path (trailing slash optional).
	 */
	async parseFolder(
		folderPath: string,
		transformers?: TransformerRegistry,
	): Promise<ParsedNote[]> {
		const normalized = folderPath.replace(/\/+$/, "");
		const wholeVault = normalized === "" || normalized === "/";

		const notes: ParsedNote[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!wholeVault && !file.path.startsWith(normalized + "/")) continue;
			const note = await this.parseFile(file.path, transformers);
			if (note) notes.push(note);
		}
		return notes;
	}
}
