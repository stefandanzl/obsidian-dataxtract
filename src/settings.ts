import { App, PluginSettingTab, Setting } from "obsidian";
import type DataXtractPlugin from "./main";

export interface MySettings {
	/** Whether to expose the `window.MarkdownTableParser` API. */
	enableApi: boolean;
}

export const DEFAULT_SETTINGS: MySettings = {
	enableApi: true,
};

export default class DataXtractPluginSettingTab extends PluginSettingTab {
	plugin: DataXtractPlugin;

	constructor(app: App, plugin: DataXtractPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Expose parser API")
			.setDesc(
				"Expose the table parser on `window.MarkdownTableParser` so other plugins and DataviewJS blocks can call `parseFile` / `parseFolder`.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableApi)
					.onChange(async (value) => {
						this.plugin.settings.enableApi = value;
						await this.plugin.saveData(this.plugin.settings);
						this.plugin.applyApiState();
					}),
			);
	}
}
