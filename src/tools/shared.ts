import type { JsonContentResult } from '../types/common.js';

export function jsonResult(value: unknown): JsonContentResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
