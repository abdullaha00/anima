import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const requestTimes: number[] = [];

export function authorizeStage2Request(request: Request): NextResponse | undefined {
  const expected = process.env.CAIRN_TRIGGER_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "Pipeline API authentication is not configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return undefined;
}

export function enforceStage2RateLimit(): NextResponse | undefined {
  const now = Date.now();
  const windowStart = now - 60_000;
  while (requestTimes.length > 0 && requestTimes[0] < windowStart) {
    requestTimes.shift();
  }
  const configuredLimit = Number(process.env.CAIRN_TRIGGER_RATE_LIMIT ?? 30);
  const limit =
    Number.isSafeInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : 30;
  if (requestTimes.length >= limit) {
    return NextResponse.json(
      { error: "Pipeline trigger rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  requestTimes.push(now);
  return undefined;
}
