import { env } from '../config/env';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Streams a chat completion from the Anthropic Messages API and forwards
 * each text delta to `onToken`. Used by chat.controller to pipe tokens to
 * the client over Server-Sent Events as they arrive.
 */
export async function streamChatCompletion(params: {
  system?: string;
  messages: ChatMessage[];
  onToken: (token: string) => void;
}): Promise<{ inputTokens: number; outputTokens: number }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: params.system,
      messages: params.messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API error (${res.status}): ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const event = JSON.parse(payload);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          params.onToken(event.delta.text as string);
        }
        if (event.type === 'message_start') {
          inputTokens = event.message?.usage?.input_tokens ?? 0;
        }
        if (event.type === 'message_delta') {
          outputTokens = event.usage?.output_tokens ?? outputTokens;
        }
      } catch {
        // ignore malformed keep-alive lines
      }
    }
  }

  return { inputTokens, outputTokens };
}
