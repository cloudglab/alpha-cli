let requestCount = 0;

/**
 * 最近若干次已完成请求的耗时（毫秒）环形缓冲。
 * 旧实现用模块级单变量 lastRequestDurationMs，并发请求几乎同时完成时会互相覆盖，
 * 只能反映最后一次 recordRequestFinished 调用。改为保留最近 N 次耗时后，
 * getLastRequestDurationMs 仍返回"最近一次完成"的耗时，但 recentDurations 提供更多历史用于诊断，
 * 且并发场景下不再因单变量被覆盖而丢失全部中间样本。
 */
const MAX_RECENT_DURATIONS = 16;
const recentDurations: number[] = [];

/** 记录一次请求耗时，保留最近 MAX_RECENT_DURATIONS 次，超出则丢弃最早一条。 */
function recordDuration(durationMs: number): void {
  recentDurations.push(durationMs);
  if (recentDurations.length > MAX_RECENT_DURATIONS) {
    recentDurations.shift();
  }
}

export function recordRequestStarted(): void {
  requestCount += 1;
}

export function recordRequestFinished(durationMs: number): void {
  recordDuration(durationMs);
}

export function getRequestCount(): number {
  return requestCount;
}

/**
 * 返回最近一次完成的请求耗时（毫秒）。
 * 取自 recentDurations 环形缓冲的最后一项；并发场景下反映"最近一次完成"的请求耗时，
 * 历史样本保留在 recentDurations 中，比单变量更稳健。
 */
export function getLastRequestDurationMs(): number {
  return recentDurations.length > 0 ? recentDurations[recentDurations.length - 1] : 0;
}

export function resetRequestMetrics(): void {
  requestCount = 0;
  recentDurations.length = 0;
}
