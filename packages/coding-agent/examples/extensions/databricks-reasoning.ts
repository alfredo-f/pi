import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const originalParse = JSON.parse;

JSON.parse = (text: string, reviver?: (this: any, key: string, value: any) => any) => {
	const result = originalParse(text, reviver);

	if (result && typeof result === "object" && Array.isArray(result.choices)) {
		for (let i = 0; i < result.choices.length; i++) {
			const choice = result.choices[i];

			if (choice?.delta?.content !== undefined && choice.delta.content !== null) {
				const content = choice.delta.content;

				if (typeof content === "object") {
					const blocks = Array.isArray(content) ? content : [content];

					let textStr = "";
					let thinkStr = "";

					for (const block of blocks) {
						if (typeof block === "string") {
							textStr += block;
						} else if (block.type === "thinking" || block.type === "thinking_delta") {
							// Standard Anthropic thinking
							thinkStr += block.thinking || "";
						} else if (block.type === "reasoning" && Array.isArray(block.summary)) {
							// Databricks specific reasoning wrapper
							for (const item of block.summary) {
								if (item.text) thinkStr += item.text;
							}
						} else if (block.type === "redacted_thinking") {
							thinkStr += block.data || "";
						} else if (block.type === "text" || block.type === "text_delta") {
							textStr += block.text || "";
						} else {
							// Ignore or stringify unknown blocks safely
							try {
								textStr += JSON.stringify(block);
							} catch {}
						}
					}

					// Remap to standard OpenAI format
					choice.delta.content = textStr.length > 0 ? textStr : null;

					if (thinkStr.length > 0) {
						// Append to reasoning_content for Pi's Thinking UI
						choice.delta.reasoning_content = (choice.delta.reasoning_content || "") + thinkStr;
					}
				}
			}
		}
	}
	return result;
};

export default function (pi: ExtensionAPI) {
	pi.on("before_provider_request", (event, _ctx) => {
		const payload = event.payload as Record<string, any>;

		if (payload.model && typeof payload.model === "string" && payload.model.includes("databricks-claude")) {
			payload.max_tokens = 64000;

			if (payload.model.includes("opus-4-7")) {
				// Not working
				// payload.thinking = { type: "adaptive" };
				console.info(JSON.stringify(payload.reasoning_effort));
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
				payload.thinking = { type: "disabled" };
			} else {
				if (!payload.reasoning_effort) {
					payload.thinking = { type: "disabled" };
				} else {
					const budgetMap = {
						minimal: 1024,
						low: 2048,
						medium: 4096,
						high: 8192,
					};
					payload.thinking = {
						type: "enabled",
						// Use the map, fallback to 1024 if the string doesn't match
						budget_tokens: budgetMap[payload.reasoning_effort as keyof typeof budgetMap] || 1024,
					};
				}
			}
			delete payload.reasoning_effort;
			return payload;
		}

		return undefined;
	});
}
