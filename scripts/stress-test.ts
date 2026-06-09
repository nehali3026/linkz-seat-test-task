/**
 * Load / stress test script with negative-case coverage.
 *
 * Prerequisites:
 *   1. App running: npm run dev  (or npm run start)
 *   2. Fresh seats recommended: npm run db:reset
 *
 * Usage:
 *   npm run test:stress
 *   npm run test:stress -- --concurrency 20
 *   BASE_URL=http://localhost:3001 npm run test:stress
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const CONCURRENCY = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 10);

const USERS = {
  alice: { email: "alice@example.com", password: "password123" },
  bob: { email: "bob@example.com", password: "password123" },
} as const;

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
};

class CookieJar {
  private cookies = new Map<string, string>();

  store(response: Response) {
    const raw = response.headers.getSetCookie?.() ?? [];

    for (const entry of raw) {
      const [pair] = entry.split(";");
      const [name, ...rest] = pair.split("=");
      if (name && rest.length > 0) {
        this.cookies.set(name.trim(), rest.join("=").trim());
      }
    }
  }

  header(): string | undefined {
    if (this.cookies.size === 0) {
      return undefined;
    }

    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function login(
  email: string,
  password: string,
): Promise<{ jar: CookieJar; ok: boolean }> {
  const jar = new CookieJar();

  const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`);
  jar.store(csrfResponse);

  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const loginResponse = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(jar.header() ? { Cookie: jar.header()! } : {}),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: BASE_URL,
      json: "true",
    }),
    redirect: "manual",
  });

  jar.store(loginResponse);

  if (loginResponse.status !== 200 && loginResponse.status !== 302) {
    return { jar, ok: false };
  }

  const payload = (await loginResponse.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;

  const hasSession = jar.header()?.includes("authjs.session-token");
  const hasAuthError =
    !!payload?.error ||
    payload?.url?.includes("error=") === true ||
    payload?.url?.includes("CredentialsSignin") === true;

  const ok = !!hasSession && !hasAuthError;
  return { jar, ok };
}

async function loginOrThrow(email: string, password: string): Promise<CookieJar> {
  const { jar, ok } = await login(email, password);

  if (!ok) {
    throw new Error(`Login failed for ${email}`);
  }

  return jar;
}

async function authedFetch(
  jar: CookieJar,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(jar.header() ? { Cookie: jar.header()! } : {}),
    },
  });
}

async function runTest(
  name: string,
  fn: () => Promise<void>,
): Promise<TestResult> {
  const start = performance.now();

  try {
    await fn();
    return {
      name,
      passed: true,
      detail: "OK",
      durationMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      name,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function getAvailableSeatId(): Promise<number> {
  const response = await fetch(`${BASE_URL}/api/seats`);
  const data = (await response.json()) as {
    seats: Array<{ id: number; status: string }>;
  };

  const seat = data.seats.find((item) => item.status === "AVAILABLE");
  if (seat) {
    return seat.id;
  }

  throw new Error(
    "No AVAILABLE seat found. Reset local data with: npm run db:reset",
  );
}

async function negativeUnauthenticatedHold() {
  const response = await fetch(`${BASE_URL}/api/reservations/hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatId: 1 }),
  });

  assert(response.status === 401, `Expected 401, got ${response.status}`);
}

async function negativeInvalidLogin() {
  const { ok } = await login("not-a-user@example.com", "wrong-password");
  assert(!ok, "Expected invalid credentials to be rejected");
}

async function negativeInvalidSeatId(jar: CookieJar) {
  const response = await authedFetch(jar, "/api/reservations/hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatId: 9999 }),
  });

  assert(
    response.status === 409 || response.status === 400,
    `Expected 400/409, got ${response.status}`,
  );
}

async function negativeMalformedBody(jar: CookieJar) {
  const response = await authedFetch(jar, "/api/reservations/hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatId: "not-a-number" }),
  });

  assert(response.status === 400, `Expected 400, got ${response.status}`);
}

async function negativeConcurrentSeatRace() {
  const seatId = await getAvailableSeatId();
  const [aliceJar, bobJar] = await Promise.all([
    loginOrThrow(USERS.alice.email, USERS.alice.password),
    loginOrThrow(USERS.bob.email, USERS.bob.password),
  ]);

  const attempts = await Promise.all([
    authedFetch(aliceJar, "/api/reservations/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatId }),
    }),
    authedFetch(bobJar, "/api/reservations/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatId }),
    }),
  ]);

  const statuses = attempts.map((response) => response.status);
  const successCount = statuses.filter((status) => status === 200).length;
  const conflictCount = statuses.filter((status) => status === 409).length;

  assert(
    successCount === 1 && conflictCount === 1,
    `Expected 1 success + 1 conflict, got statuses: ${statuses.join(", ")}`,
  );
}

async function negativeDeclinedPayment() {
  const seatId = await getAvailableSeatId();
  const jar = await loginOrThrow(USERS.alice.email, USERS.alice.password);

  const holdResponse = await authedFetch(jar, "/api/reservations/hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatId }),
  });

  assert(holdResponse.status === 200, `Hold failed: ${holdResponse.status}`);
  const holdData = (await holdResponse.json()) as { hold: { id: string } };

  const paymentInit = await authedFetch(jar, "/api/payments/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      holdId: holdData.hold.id,
      idempotencyKey: crypto.randomUUID(),
    }),
  });

  assert(paymentInit.status === 200, `Payment init failed: ${paymentInit.status}`);
  const paymentData = (await paymentInit.json()) as { payment: { id: string } };

  const payResponse = await authedFetch(jar, "/api/payments/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentId: paymentData.payment.id,
      cardNumber: "4000000000000002",
    }),
  });

  assert(payResponse.status === 402, `Expected 402 declined, got ${payResponse.status}`);

  const seatsResponse = await fetch(`${BASE_URL}/api/seats`);
  const seatsData = (await seatsResponse.json()) as {
    seats: Array<{ id: number; status: string }>;
  };
  const seat = seatsData.seats.find((item) => item.id === seatId);

  assert(
    seat?.status === "AVAILABLE",
    `Seat should be AVAILABLE after declined payment, got ${seat?.status}`,
  );
}

async function negativeCrossUserPayment() {
  const seatId = await getAvailableSeatId();
  const [aliceJar, bobJar] = await Promise.all([
    loginOrThrow(USERS.alice.email, USERS.alice.password),
    loginOrThrow(USERS.bob.email, USERS.bob.password),
  ]);

  const holdResponse = await authedFetch(aliceJar, "/api/reservations/hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatId }),
  });

  assert(holdResponse.status === 200, `Alice hold failed: ${holdResponse.status}`);
  const holdData = (await holdResponse.json()) as { hold: { id: string } };

  const bobInit = await authedFetch(bobJar, "/api/payments/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      holdId: holdData.hold.id,
      idempotencyKey: crypto.randomUUID(),
    }),
  });

  assert(
    bobInit.status === 400 || bobInit.status === 403,
    `Expected 400/403 for cross-user payment, got ${bobInit.status}`,
  );
}

async function loadSeatsEndpoint(): Promise<string> {
  const started = performance.now();
  const requests = Array.from({ length: CONCURRENCY }, () =>
    fetch(`${BASE_URL}/api/seats`),
  );

  const responses = await Promise.all(requests);
  const elapsed = performance.now() - started;

  const allOk = responses.every((response) => response.status === 200);
  assert(allOk, "Not all /api/seats requests returned 200");

  const rps = Math.round((CONCURRENCY / elapsed) * 1000);
  return `${CONCURRENCY} requests in ${Math.round(elapsed)}ms (~${rps} req/s)`;
}

async function runLoadTest(): Promise<TestResult> {
  const start = performance.now();

  try {
    const detail = await loadSeatsEndpoint();
    return {
      name: `Load: ${CONCURRENCY}x GET /api/seats`,
      passed: true,
      detail,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      name: `Load: ${CONCURRENCY}x GET /api/seats`,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

async function main() {
  console.log(`\nStress / negative tests → ${BASE_URL}`);
  console.log(`Concurrency for load test: ${CONCURRENCY}`);
  console.log("Tip: run `npm run db:reset` first for a clean seat state.\n");

  const health = await fetch(`${BASE_URL}/api/seats`);
  if (!health.ok) {
    console.error(`Server not reachable at ${BASE_URL}. Start with: npm run dev`);
    process.exit(1);
  }

  let aliceJar: CookieJar | undefined;

  try {
    aliceJar = await loginOrThrow(USERS.alice.email, USERS.alice.password);
  } catch (error) {
    console.error("Could not log in as demo user. Did you run npm run setup?");
    console.error(error);
    process.exit(1);
  }

  const tests: Array<() => Promise<TestResult>> = [
    () => runTest("401 without session (hold)", negativeUnauthenticatedHold),
    () => runTest("Invalid credentials rejected", negativeInvalidLogin),
    () => runTest("400 malformed hold body", () => negativeMalformedBody(aliceJar!)),
    () => runTest("409/400 invalid seat id", () => negativeInvalidSeatId(aliceJar!)),
    () => runTest("402 declined card releases seat", negativeDeclinedPayment),
    () => runTest("403/400 cross-user payment blocked", negativeCrossUserPayment),
    () => runTest("Race: only one hold wins", negativeConcurrentSeatRace),
    runLoadTest,
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    const result = await test();
    results.push(result);
    const icon = result.passed ? "PASS" : "FAIL";
    console.log(`[${icon}] ${result.name} (${result.durationMs}ms)`);
    console.log(`       ${result.detail}\n`);
  }

  const failed = results.filter((result) => !result.passed).length;

  console.log(`Summary: ${results.length - failed}/${results.length} passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
