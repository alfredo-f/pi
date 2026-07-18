import { describe, expect, it } from "vitest";
import { convertMessages } from "../src/api/openai-completions.ts";
import type { AssistantMessage, Context, Model, OpenAICompletionsCompat, Usage } from "../src/types.ts";

const emptyUsage: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function buildCompat(overrides: Partial<OpenAICompletionsCompat> = {}) {
	return {
		supportsStore: false,
		supportsDeveloperRole: false,
		supportsReasoningEffort: true,
		supportsUsageInStreaming: true,
		maxTokensField: "max_tokens",
		requiresToolResultName: false,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: false,
		requiresReasoningContentOnAssistantMessages: false,
		dropReasoningOnReplay: false,
		thinkingFormat: "openai",
		openRouterRouting: {},
		vercelGatewayRouting: {},
		chatTemplateKwargs: {},
		zaiToolStream: false,
		supportsStrictMode: true,
		cacheControlFormat: undefined,
		sendSessionAffinityHeaders: false,
		sessionAffinityFormat: "openai",
		supportsLongCacheRetention: true,
		...overrides,
	} satisfies Omit<Required<OpenAICompletionsCompat>, "cacheControlFormat" | "deferredToolsMode"> & {
		cacheControlFormat?: OpenAICompletionsCompat["cacheControlFormat"];
		deferredToolsMode?: OpenAICompletionsCompat["deferredToolsMode"];
	};
}

function buildModel(): Model<"openai-completions"> {
	return {
		id: "databricks-claude-sonnet-4-6",
		name: "Databricks Claude",
		api: "openai-completions",
		provider: "databricks",
		baseUrl: "https://example.azuredatabricks.net/serving-endpoints",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 16384,
	};
}

function buildContext(content: AssistantMessage["content"]): Context {
	const assistant: AssistantMessage = {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: "databricks",
		model: "databricks-claude-sonnet-4-6",
		usage: emptyUsage,
		stopReason: "stop",
		timestamp: 2,
	};
	return {
		messages: [
			{ role: "user", content: "hello", timestamp: 1 },
			assistant,
			{ role: "user", content: "continue", timestamp: 3 },
		],
	};
}

describe("openai-completions dropReasoningOnReplay", () => {
	it("omits reasoning_content from replayed assistant messages when enabled", () => {
		const messages = convertMessages(
			buildModel(),
			buildContext([
				{ type: "thinking", thinking: "internal reasoning", thinkingSignature: "reasoning_content" },
				{ type: "text", text: "visible answer" },
			]),
			buildCompat({ dropReasoningOnReplay: true }),
		);

		const assistant = messages[1] as unknown as Record<string, unknown>;
		expect(assistant.role).toBe("assistant");
		expect(assistant.reasoning_content).toBeUndefined();
		expect(assistant.content).toBe("visible answer");
	});

	it("still echoes reasoning_content when the flag is off (default)", () => {
		const messages = convertMessages(
			buildModel(),
			buildContext([
				{ type: "thinking", thinking: "internal reasoning", thinkingSignature: "reasoning_content" },
				{ type: "text", text: "visible answer" },
			]),
			buildCompat({ dropReasoningOnReplay: false }),
		);

		const assistant = messages[1] as unknown as Record<string, unknown>;
		expect(assistant.reasoning_content).toBe("internal reasoning");
		expect(assistant.content).toBe("visible answer");
	});

	it("does not inject empty reasoning_content even when requiresReasoningContentOnAssistantMessages is set", () => {
		const messages = convertMessages(
			buildModel(),
			buildContext([{ type: "text", text: "visible answer" }]),
			buildCompat({ dropReasoningOnReplay: true, requiresReasoningContentOnAssistantMessages: true }),
		);

		const assistant = messages[1] as unknown as Record<string, unknown>;
		expect(assistant.reasoning_content).toBeUndefined();
	});
});
