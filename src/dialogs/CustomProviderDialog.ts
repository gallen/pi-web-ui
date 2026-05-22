import type { Model } from "@earendil-works/pi-ai";
import { i18n } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { DialogBase } from "@mariozechner/mini-lit/dist/DialogBase.js";
import { Input } from "@mariozechner/mini-lit/dist/Input.js";
import { Label } from "@mariozechner/mini-lit/dist/Label.js";
import { Select } from "@mariozechner/mini-lit/dist/Select.js";
import { html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { getAppStorage } from "../storage/app-storage.ts";
import type { CustomProvider, CustomProviderType } from "../storage/stores/custom-providers-store.ts";
import { discoverModels } from "../utils/model-discovery.ts";

export class CustomProviderDialog extends DialogBase {
	private provider?: CustomProvider;
	private initialType?: CustomProviderType;
	private onSaveCallback?: () => void;

	@state() private name = "";
	@state() private type: CustomProviderType = "openai-completions";
	@state() private baseUrl = "";
	@state() private apiKey = "";
	@state() private testing = false;
	@state() private testError = "";
	@state() private discoveredModels: Model<any>[] = [];
	@state() private manualModels: Model<any>[] = [];

	protected modalWidth = "min(800px, 90vw)";
	protected modalHeight = "min(700px, 90vh)";

	static async open(
		provider: CustomProvider | undefined,
		initialType: CustomProviderType | undefined,
		onSave?: () => void,
	) {
		const dialog = new CustomProviderDialog();
		dialog.provider = provider;
		dialog.initialType = initialType;
		dialog.onSaveCallback = onSave;
		document.body.appendChild(dialog);
		dialog.initializeFromProvider();
		dialog.open();
		dialog.requestUpdate();
	}

	private initializeFromProvider() {
		if (this.provider) {
			this.name = this.provider.name;
			this.type = this.provider.type;
			this.baseUrl = this.provider.baseUrl;
			this.apiKey = this.provider.apiKey || "";
			this.discoveredModels = this.provider.models || [];
			this.manualModels = this.provider.models || [];
		} else {
			this.name = "";
			this.type = this.initialType || "openai-completions";
			this.baseUrl = "";
			this.updateDefaultBaseUrl();
			this.apiKey = "";
			this.discoveredModels = [];
			this.manualModels = [];
		}
		this.testError = "";
		this.testing = false;
	}

	private updateDefaultBaseUrl() {
		if (this.baseUrl) return;

		const defaults: Record<string, string> = {
			ollama: "http://localhost:11434",
			"llama.cpp": "http://localhost:8080",
			vllm: "http://localhost:8000",
			lmstudio: "http://localhost:1234",
			"openai-completions": "",
			"openai-responses": "",
			"anthropic-messages": "",
		};

		this.baseUrl = defaults[this.type] || "";
	}

	private isAutoDiscoveryType(): boolean {
		return this.type === "ollama" || this.type === "llama.cpp" || this.type === "vllm" || this.type === "lmstudio";
	}

	private async testConnection() {
		if (!this.isAutoDiscoveryType()) return;

		this.testing = true;
		this.testError = "";
		this.discoveredModels = [];

		try {
			const models = await discoverModels(
				this.type as "ollama" | "llama.cpp" | "vllm" | "lmstudio",
				this.baseUrl,
				this.apiKey || undefined,
			);

			this.discoveredModels = models.map((model) => ({
				...model,
				provider: this.name || this.type,
			}));

			this.testError = "";
		} catch (error) {
			this.testError = error instanceof Error ? error.message : String(error);
			this.discoveredModels = [];
		} finally {
			this.testing = false;
			this.requestUpdate();
		}
	}

	private createManualModel(): Model<any> {
		const id = "";
		return {
			id,
			name: id,
			api: this.type as Model<any>["api"],
			provider: this.name as Model<any>["provider"],
			baseUrl: this.baseUrl,
			reasoning: false,
			input: ["text"],
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
			},
			contextWindow: 128000,
			maxTokens: 4096,
		};
	}

	private addManualModel() {
		this.manualModels = [...this.manualModels, this.createManualModel()];
	}

	private updateManualModel(index: number, patch: Partial<Model<any>>) {
		this.manualModels = this.manualModels.map((model, modelIndex) =>
			modelIndex === index ? { ...model, ...patch } : model,
		);
	}

	private updateManualModelCost(index: number, patch: Partial<Model<any>["cost"]>) {
		this.manualModels = this.manualModels.map((model, modelIndex) =>
			modelIndex === index ? { ...model, cost: { ...model.cost, ...patch } } : model,
		);
	}

	private removeManualModel(index: number) {
		this.manualModels = this.manualModels.filter((_, modelIndex) => modelIndex !== index);
	}

	private syncManualModel(model: Model<any>): Model<any> {
		return {
			...model,
			name: model.name || model.id,
			api: this.type as Model<any>["api"],
			provider: this.name as Model<any>["provider"],
			baseUrl: this.baseUrl,
		};
	}

	private async save() {
		if (!this.name || !this.baseUrl) {
			alert(i18n("Please fill in all required fields"));
			return;
		}

		const manualModels = this.manualModels
			.map((model) => this.syncManualModel(model))
			.filter((model) => model.id.trim().length > 0);

		if (!this.isAutoDiscoveryType() && manualModels.length === 0) {
			alert("Please add at least one model");
			return;
		}

		try {
			const storage = getAppStorage();

			const provider: CustomProvider = {
				id: this.provider?.id || crypto.randomUUID(),
				name: this.name,
				type: this.type,
				baseUrl: this.baseUrl,
				apiKey: this.apiKey || undefined,
				models: this.isAutoDiscoveryType() ? undefined : manualModels,
			};

			await storage.customProviders.set(provider);

			if (this.onSaveCallback) {
				this.onSaveCallback();
			}
			this.close();
		} catch (error) {
			console.error("Failed to save provider:", error);
			alert(i18n("Failed to save provider"));
		}
	}

	private renderManualModels(): TemplateResult {
		return html`
			<div class="flex flex-col gap-3 border border-border rounded-md p-4">
				<div class="flex items-center justify-between gap-2">
					<div>
						<div class="text-sm font-medium text-foreground">${i18n("Models")}</div>
						<div class="text-xs text-muted-foreground">Add the model IDs exposed by this provider.</div>
					</div>
					${Button({
						onClick: () => this.addManualModel(),
						variant: "outline",
						size: "sm",
						children: "Add Model",
					})}
				</div>

				${
					this.manualModels.length === 0
						? html`<div class="text-sm text-muted-foreground">No models added yet.</div>`
						: html`
							${this.manualModels.map(
								(model, index) => html`
									<div class="flex flex-col gap-3 border border-border rounded-md p-3">
										<div class="flex items-center justify-between gap-2">
											<div class="text-sm font-medium">${model.id || "New Model"}</div>
											${Button({
												onClick: () => this.removeManualModel(index),
												variant: "ghost",
												size: "sm",
												children: i18n("Remove"),
											})}
										</div>

										<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
											<div class="flex flex-col gap-2">
												${Label({ children: "Model ID" })}
												${Input({
													value: model.id,
													placeholder: "gpt-4o-mini",
													onInput: (e: Event) => {
														const id = (e.target as HTMLInputElement).value;
														this.updateManualModel(index, { id, name: model.name || id });
													},
												})}
											</div>
											<div class="flex flex-col gap-2">
												${Label({ children: "Display Name" })}
												${Input({
													value: model.name,
													placeholder: model.id || "GPT-4o Mini",
													onInput: (e: Event) =>
														this.updateManualModel(index, { name: (e.target as HTMLInputElement).value }),
												})}
											</div>
											<div class="flex flex-col gap-2">
												${Label({ children: "Context Window" })}
												${Input({
													type: "number",
													value: String(model.contextWindow),
													onInput: (e: Event) =>
														this.updateManualModel(index, {
															contextWindow: Number((e.target as HTMLInputElement).value) || 0,
														}),
												})}
											</div>
											<div class="flex flex-col gap-2">
												${Label({ children: "Max Output Tokens" })}
												${Input({
													type: "number",
													value: String(model.maxTokens),
													onInput: (e: Event) =>
														this.updateManualModel(index, {
															maxTokens: Number((e.target as HTMLInputElement).value) || 0,
														}),
												})}
											</div>
										</div>

										<div class="flex flex-wrap gap-4 text-sm">
											<label class="flex items-center gap-2">
												<input
													type="checkbox"
													.checked=${model.reasoning}
													@change=${(e: Event) =>
														this.updateManualModel(index, {
															reasoning: (e.target as HTMLInputElement).checked,
														})}
												/>
												Reasoning
											</label>
											<label class="flex items-center gap-2">
												<input
													type="checkbox"
													.checked=${model.input.includes("image")}
													@change=${(e: Event) =>
														this.updateManualModel(index, {
															input: (e.target as HTMLInputElement).checked
																? ["text", "image"]
																: ["text"],
														})}
												/>
												${i18n("Vision")}
											</label>
										</div>

										<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
											<div class="flex flex-col gap-2">
												${Label({ children: "Input Cost ($/M tokens)" })}
												${Input({
													type: "number",
													value: String(model.cost.input),
													onInput: (e: Event) =>
														this.updateManualModelCost(index, {
															input: Number((e.target as HTMLInputElement).value) || 0,
														}),
												})}
											</div>
											<div class="flex flex-col gap-2">
												${Label({ children: "Output Cost ($/M tokens)" })}
												${Input({
													type: "number",
													value: String(model.cost.output),
													onInput: (e: Event) =>
														this.updateManualModelCost(index, {
															output: Number((e.target as HTMLInputElement).value) || 0,
														}),
												})}
											</div>
										</div>
									</div>
								`,
							)}
						`
				}
			</div>
		`;
	}

	protected override renderContent(): TemplateResult {
		const providerTypes = [
			{ value: "ollama", label: "Ollama (auto-discovery)" },
			{ value: "llama.cpp", label: "llama.cpp (auto-discovery)" },
			{ value: "vllm", label: "vLLM (auto-discovery)" },
			{ value: "lmstudio", label: "LM Studio (auto-discovery)" },
			{ value: "openai-completions", label: "OpenAI Completions Compatible" },
			{ value: "openai-responses", label: "OpenAI Responses Compatible" },
			{ value: "anthropic-messages", label: "Anthropic Messages Compatible" },
		];

		return html`
			<div class="flex flex-col h-full overflow-hidden">
				<div class="p-6 flex-shrink-0 border-b border-border">
					<h2 class="text-lg font-semibold text-foreground">
						${this.provider ? i18n("Edit Provider") : i18n("Add Provider")}
					</h2>
				</div>

				<div class="flex-1 overflow-y-auto p-6">
					<div class="flex flex-col gap-4">
						<div class="flex flex-col gap-2">
							${Label({ htmlFor: "provider-name", children: i18n("Provider Name") })}
							${Input({
								value: this.name,
								placeholder: i18n("e.g., My Ollama Server"),
								onInput: (e: Event) => {
									this.name = (e.target as HTMLInputElement).value;
									this.requestUpdate();
								},
							})}
						</div>

						<div class="flex flex-col gap-2">
							${Label({ htmlFor: "provider-type", children: i18n("Provider Type") })}
							${Select({
								value: this.type,
								options: providerTypes.map((pt) => ({
									value: pt.value,
									label: pt.label,
								})),
								onChange: (value: string) => {
									this.type = value as CustomProviderType;
									this.baseUrl = "";
									this.updateDefaultBaseUrl();
									this.requestUpdate();
								},
								width: "100%",
							})}
						</div>

						<div class="flex flex-col gap-2">
							${Label({ htmlFor: "base-url", children: i18n("Base URL") })}
							${Input({
								value: this.baseUrl,
								placeholder: i18n("e.g., http://localhost:11434"),
								onInput: (e: Event) => {
									this.baseUrl = (e.target as HTMLInputElement).value;
									this.requestUpdate();
								},
							})}
						</div>

						<div class="flex flex-col gap-2">
							${Label({ htmlFor: "api-key", children: i18n("API Key (Optional)") })}
							${Input({
								type: "password",
								value: this.apiKey,
								placeholder: i18n("Leave empty if not required"),
								onInput: (e: Event) => {
									this.apiKey = (e.target as HTMLInputElement).value;
									this.requestUpdate();
								},
							})}
						</div>

						${
							this.isAutoDiscoveryType()
								? html`
									<div class="flex flex-col gap-2">
										${Button({
											onClick: () => this.testConnection(),
											variant: "outline",
											disabled: this.testing || !this.baseUrl,
											children: this.testing ? i18n("Testing...") : i18n("Test Connection"),
										})}
										${this.testError ? html` <div class="text-sm text-destructive">${this.testError}</div> ` : ""}
										${
											this.discoveredModels.length > 0
												? html`
													<div class="text-sm text-muted-foreground">
														${i18n("Discovered")} ${this.discoveredModels.length} ${i18n("models")}:
														<ul class="list-disc list-inside mt-2">
															${this.discoveredModels.slice(0, 5).map((model) => html`<li>${model.name}</li>`)}
															${
																this.discoveredModels.length > 5
																	? html`<li>...${i18n("and")} ${this.discoveredModels.length - 5} ${i18n("more")}</li>`
																	: ""
															}
														</ul>
													</div>
												`
												: ""
										}
									</div>
								`
								: this.renderManualModels()
						}
					</div>
				</div>

				<div class="p-6 flex-shrink-0 border-t border-border flex justify-end gap-2">
					${Button({
						onClick: () => this.close(),
						variant: "ghost",
						children: i18n("Cancel"),
					})}
					${Button({
						onClick: () => this.save(),
						variant: "default",
						disabled: !this.name || !this.baseUrl,
						children: i18n("Save"),
					})}
				</div>
			</div>
		`;
	}
}

customElements.define("custom-provider-dialog", CustomProviderDialog);
