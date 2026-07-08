export type LlmConnectorMode = "fallback" | "server_route";
export type LlmProvider = "deepseek" | "kimi" | "minimax" | "glm" | "custom";

export const providerModelPresets: Record<LlmProvider, string[]> = {
  deepseek: ["deepseek-v4-pro"],
  kimi: ["kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6", "kimi-k2.5"],
  minimax: [
    "MiniMax-M3",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.1",
    "MiniMax-M2.1-highspeed",
    "MiniMax-M2",
  ],
  glm: [
    "glm-5.2",
    "glm-5.1",
    "glm-5-turbo",
    "glm-5",
    "glm-4.7",
    "glm-4.7-flash",
    "glm-4.6",
    "glm-4.5-air",
  ],
  custom: ["custom-header-agent-model", "openai-compatible-model"],
};

export const providerApiKeyEnv: Record<LlmProvider, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  kimi: "MOONSHOT_API_KEY",
  minimax: "MINIMAX_API_KEY",
  glm: "GLM_API_KEY",
  custom: "CUSTOM_LLM_API_KEY",
};

export const modelApiKeyEnv: Record<string, string> = {
  "deepseek-v4-pro": "DEEPSEEK_API_KEY",
};

export function resolveApiKeyEnv(provider: LlmProvider, model: string) {
  return modelApiKeyEnv[model] ?? providerApiKeyEnv[provider];
}

export type LlmConnectorConfig = {
  mode: LlmConnectorMode;
  endpoint: string;
  provider: LlmProvider;
  model: string;
  apiKeyEnv: string;
  providerEndpoint: string;
};

export type HeaderAgentRequest = {
  task: string;
  runtimePolicy: "low_cost" | "balanced" | "deep_research";
  userCapabilityBoundary: string;
  expectedSchema: "HeaderAgentDecision";
};

export const defaultLlmConnectorConfig: LlmConnectorConfig = {
  mode: "fallback",
  endpoint: "/api/header-agent/decision",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  providerEndpoint: "",
};

export function buildHeaderAgentRequest(
  task: string,
  runtimePolicy: HeaderAgentRequest["runtimePolicy"],
): HeaderAgentRequest {
  return {
    task,
    runtimePolicy,
    userCapabilityBoundary:
      "用户擅长 AI coding、快速原型和产品判断；希望委托跨产品研究、批判、协作协议设计和评估指标。",
    expectedSchema: "HeaderAgentDecision",
  };
}

export async function requestHeaderAgentDecision(
  config: LlmConnectorConfig,
  request: HeaderAgentRequest,
) {
  if (config.mode === "fallback") {
    return {
      source: "fallback",
      request,
      message: "Using local fixture decision. Switch to Server env to call a real model.",
    };
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...request,
      mode: config.mode,
      provider: config.provider,
      model: config.model,
      apiKeyEnv: config.apiKeyEnv,
      providerEndpoint: config.providerEndpoint,
    }),
  });

  if (!response.ok) {
    let message = `Header Agent API failed: ${response.status}`;
    try {
      const errorBody = await response.json();
      message = errorBody.message ?? errorBody.error ?? message;
    } catch {
      // Keep the status-only message when the route does not return JSON.
    }
    throw new Error(message);
  }

  return response.json();
}
