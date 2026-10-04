/** A structured completion: the answer conforms to `schema`, and arrives parsed. */
export interface LlmRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
}

/** A hosted model. The classifier calls it; adapters pick the provider. */
export interface Llm {
  completeJson(request: LlmRequest, signal?: AbortSignal): Promise<unknown>;
}
