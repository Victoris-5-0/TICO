/**
 * Pyodide, and nothing else, runs here.
 *
 * ## Why this is a static file and not a bundled module
 *
 * Pyodide refuses to start in a classic worker. It checks by *calling*
 * `importScripts("data:text/javascript,")` — that succeeds in a classic worker and
 * throws in a module one — and aborts with "Classic web workers are not supported".
 *
 * Turbopack's bundled-worker helper produces a classic worker even when
 * `new Worker(url, { type: "module" })` asks for a module, so the bundled version of
 * this file failed at boot every time. Served as a plain file from `public/` and
 * constructed with `{ type: "module" }`, it is unambiguously a module worker. Verified
 * in Chrome 146 with Pyodide's own test: bundled → classic, static → module.
 *
 * The cost is that this file cannot import `src/lib/runner/protocol.ts`, so the few
 * constants it needs are repeated below. `protocol.test.ts` reads this file and asserts
 * they still match, which is what keeps the duplication honest.
 *
 * `docs/07-browser-python-runner.md` is the specification for everything else here.
 * Neither Pyodide nor learner code ever touches the main thread, and a run that overruns
 * destroys this worker rather than trying to interrupt it — synchronous Python cannot be
 * safely interrupted from outside.
 *
 * The worker carries nothing worth stealing: no credentials, no session token, no
 * database handle. That, plus browser isolation, is the real boundary. Pyodide is not.
 */

// --- must match src/lib/runner/protocol.ts (asserted by protocol.test.ts) -----------
const PROTOCOL_VERSION = 1;
const PYODIDE_VERSION = "314.0.6";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const LIMITS = { outputBytes: 65536, maxCases: 30 };
const ALLOWED_IMPORTS = ["math", "random", "statistics", "string", "decimal", "fractions"];
// ------------------------------------------------------------------------------------

let pyodide = null;
let booting = null;
let captured = "";

/**
 * The harness, as Python source.
 *
 * Two rules from docs/07 are load-bearing:
 *
 * - **Learner text is never interpolated into Python source.** Their code and the
 *   expressions arrive as JSON through `json.loads`, so a stray quote or triple-quote in
 *   what they typed cannot break out into the harness.
 * - **Fresh globals every run.** A dict built per run, seeded only with a guarded
 *   `__import__`, so nothing survives from a previous attempt to make a broken program
 *   look like it works.
 *
 * The comparison value is `repr()`, matching `ai-backend/app/ai/sandbox.py` — which is
 * what produced every `expected` in the mission.
 */
const HARNESS = `
import builtins, json

_ALLOWED = set(json.loads(_TICO_ALLOWED))
_payload = json.loads(_TICO_PAYLOAD)
_source = _payload["source"]
_calls = _payload["calls"]

_real_import = builtins.__import__

def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = name.split(".")[0]
    if root not in _ALLOWED:
        raise ImportError("import of '%s' is not available here" % root)
    return _real_import(name, globals, locals, fromlist, level)

# Fresh namespace per run. Nothing carries over from a previous attempt.
_env = {"__builtins__": dict(vars(builtins)), "__name__": "__main__"}
_env["__builtins__"]["__import__"] = _guarded_import

_out = {"outcome": "OK", "error": None, "cases": []}

try:
    _compiled = compile(_source, "mission.py", "exec")
except SyntaxError as _exc:
    _out["outcome"] = "SYNTAX_ERROR"
    _out["error"] = "%s (line %s)" % (_exc.msg, _exc.lineno)
except Exception as _exc:
    _out["outcome"] = "SYNTAX_ERROR"
    _out["error"] = "%s: %s" % (type(_exc).__name__, _exc)
else:
    try:
        exec(_compiled, _env)
    except Exception as _exc:
        _out["outcome"] = "RUNTIME_ERROR"
        _out["error"] = "%s: %s" % (type(_exc).__name__, _exc)
    else:
        for _call in _calls:
            try:
                _value = eval(_call, _env)
                _out["cases"].append({"call": _call, "ok": True, "value": repr(_value)})
            except Exception as _exc:
                _out["cases"].append({
                    "call": _call,
                    "ok": False,
                    "error": "%s: %s" % (type(_exc).__name__, _exc),
                })

_TICO_OUT = json.dumps(_out, ensure_ascii=False)
`;

async function boot() {
  if (pyodide) return pyodide;
  if (booting) return booting;

  booting = (async () => {
    // A module worker has no working `importScripts`, so the ESM build is the path.
    // Pinned in protocol.ts; never float this to `latest`.
    const { loadPyodide } = await import(`${PYODIDE_INDEX_URL}pyodide.mjs`);
    const instance = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

    instance.setStdout({ batched: (text) => { captured += text + "\n"; } });
    instance.setStderr({ batched: (text) => { captured += text + "\n"; } });

    pyodide = instance;
    return instance;
  })();

  return booting;
}

/**
 * Only a plain call on a plain name is allowed through.
 *
 * These expressions come from a mission the Python validator already accepted, so this
 * should never fire. It is here because docs/07 asks for it by name — "Private attribute
 * access and dynamic function names are rejected" — and because the cost of being wrong
 * about where input came from is paid here rather than noticed later.
 */
const CALL_SHAPE = /^[A-Za-z_][A-Za-z0-9_]*\s*\([\s\S]*\)$/;

function rejectable(call) {
  if (!CALL_SHAPE.test(String(call).trim())) return "not a plain function call";
  if (String(call).includes("__")) return "dunder access is not allowed";
  if (/\bimport\b|\bexec\b|\beval\b|\bopen\b|\bcompile\b/.test(call)) return "not allowed in a test call";
  return null;
}

function truncate(text) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= LIMITS.outputBytes) return text;
  return new TextDecoder().decode(bytes.slice(0, LIMITS.outputBytes)) + "\n… output truncated";
}

/** Keep harness frames and absolute paths out of what a child reads. */
function sanitise(message) {
  return String(message)
    .replace(/File "[^"]*"/g, "")
    .replace(/_TICO_[A-Z_]+/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .slice(0, 300);
}

async function run(request) {
  const started = Date.now();
  const api = await boot();
  captured = "";

  const rejected = [];
  const runnable = [];
  for (const testCase of request.cases.slice(0, LIMITS.maxCases)) {
    const reason = rejectable(testCase.call);
    if (reason) {
      rejected.push({ call: testCase.call, status: "REJECTED", expected: testCase.expected, error: reason, hidden: testCase.hidden });
    } else {
      runnable.push(testCase);
    }
  }

  // The payload crosses into Python as JSON, never as interpolated source.
  self._TICO_PAYLOAD = JSON.stringify({ source: request.source, calls: runnable.map((c) => c.call) });
  self._TICO_ALLOWED = JSON.stringify(ALLOWED_IMPORTS);

  api.runPython("import js\n_TICO_PAYLOAD = js._TICO_PAYLOAD\n_TICO_ALLOWED = js._TICO_ALLOWED\n" + HARNESS);

  const parsed = JSON.parse(String(api.globals.get("_TICO_OUT") ?? ""));
  const byCall = new Map(parsed.cases.map((row) => [row.call, row]));

  const cases = runnable.map((testCase) => {
    const row = byCall.get(testCase.call);
    if (!row) return { call: testCase.call, status: "RAISED", expected: testCase.expected, error: "no result", hidden: testCase.hidden };
    if (!row.ok) return { call: testCase.call, status: "RAISED", expected: testCase.expected, error: sanitise(row.error ?? ""), hidden: testCase.hidden };
    // Value comparison happens on the client, so both sides use one implementation.
    return { call: testCase.call, status: "PASSED", actual: row.value, expected: testCase.expected, hidden: testCase.hidden };
  });

  return {
    version: PROTOCOL_VERSION,
    kind: "result",
    requestId: request.requestId,
    outcome: parsed.outcome,
    error: parsed.error ? sanitise(parsed.error) : undefined,
    cases: cases.concat(rejected),
    stdout: truncate(captured),
    durationMs: Date.now() - started,
  };
}

self.onmessage = async (event) => {
  const request = event.data;

  // Every payload is parsed, never trusted — docs/07 "Harness safeguards".
  if (!request || request.version !== PROTOCOL_VERSION || request.kind !== "run" || typeof request.requestId !== "string") {
    self.postMessage({ version: PROTOCOL_VERSION, kind: "failed", error: "unrecognised request" });
    return;
  }

  if (typeof request.source !== "string" || !Array.isArray(request.cases)) {
    self.postMessage({
      version: PROTOCOL_VERSION, kind: "result", requestId: request.requestId,
      outcome: "RUNNER_ERROR", cases: [], stdout: "", error: "malformed request", durationMs: 0,
    });
    return;
  }

  try {
    self.postMessage(await run(request));
  } catch (error) {
    self.postMessage({
      version: PROTOCOL_VERSION, kind: "result", requestId: request.requestId,
      outcome: "RUNNER_ERROR", cases: [], stdout: "",
      error: sanitise(error && error.message ? error.message : String(error)),
      durationMs: 0,
    });
  }
};

// Boot eagerly so the first Run is not also the first download. A failure is reported
// rather than thrown, so the client can offer a retry instead of hanging.
boot().then(
  () => self.postMessage({ version: PROTOCOL_VERSION, kind: "ready" }),
  (error) => self.postMessage({
    version: PROTOCOL_VERSION,
    kind: "failed",
    error: error && error.message ? error.message : String(error),
  }),
);
