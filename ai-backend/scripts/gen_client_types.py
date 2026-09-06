"""Generate `client/src/lib/ai/types.ts` from the live OpenAPI schema.

    python scripts/gen_client_types.py            # write the file
    python scripts/gen_client_types.py --check    # fail if it is stale (for CI)

**Why this script exists.** `client/src/lib/ai/types.ts` used to be hand-written. It
drifted from the Pydantic DTOs, nothing failed, and the mismatch only surfaced when a
real request 422'd on five fields at once. Types that are generated cannot drift: the
service that owns the contract emits them.

The emitted types describe the **`data` half** of the envelope, because that is what the
client's `fetchAi<T>` unwraps to and hands back. The envelope itself is declared once, by
hand, at the top of the output.

Deliberately no npm dependency. `openapi-typescript` would do this too, but it would put
the contract's toolchain on the other side of the boundary from the contract itself, and
the client would need an install step before it could regenerate.
"""

from __future__ import annotations

import argparse
import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://t:t@localhost:5432/t")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("JWT_SECRET", "")
os.environ.setdefault("GOOGLE_API_KEY", "")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[2] / "client" / "src" / "lib" / "ai" / "types.ts"

HEADER = """/**
 * AI backend contract types.
 *
 * ============================================================================
 *  GENERATED FILE - DO NOT EDIT BY HAND
 *
 *  Regenerate:  cd ai-backend && python scripts/gen_client_types.py
 *  Source:      the FastAPI service's /openapi.json
 * ============================================================================
 *
 * These describe the `data` half of the response envelope, which is what
 * `aiClient.fetchAi<T>` returns after unwrapping. Field names are camelCase on
 * the wire; the Python source is snake_case and the boundary is declared in
 * `ai-backend/app/schemas/common.py`.
 *
 * Editing this file by hand is what caused the contract drift in the first
 * place. Change the Pydantic schema instead, then rerun the generator.
 */

/** Every successful /v1 response. See docs/06-data-model-and-contracts.md. */
export interface Envelope<T> {
  data: T;
  meta: {
    request_id: string;
    stub: boolean;
    cached: boolean;
  };
}

/** Every 4xx/5xx response. `request_id` and `retryable` are snake_case per docs/06. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    request_id: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
}
"""

#: FastAPI's own validation-error models; the client never constructs these.
SKIP = {"HTTPValidationError", "ValidationError"}


def ts_type(schema: dict, schemas: dict) -> str:
    """Map one JSON-Schema node to a TypeScript type."""
    if "$ref" in schema:
        return schema["$ref"].rsplit("/", 1)[-1]

    # Pydantic renders `X | None` as anyOf[X, null].
    for key in ("anyOf", "oneOf"):
        if key in schema:
            parts = [s for s in schema[key] if s.get("type") != "null"]
            nullable = len(parts) != len(schema[key])
            inner = " | ".join(dict.fromkeys(ts_type(p, schemas) for p in parts)) or "unknown"
            return f"{inner} | null" if nullable else inner

    if "const" in schema:
        return repr(schema["const"]).replace("'", '"')

    if enum := schema.get("enum"):
        return " | ".join(f'"{v}"' if isinstance(v, str) else str(v) for v in enum)

    t = schema.get("type")
    if t == "array":
        return f"Array<{ts_type(schema.get('items', {}), schemas)}>"
    if t == "object" or t is None:
        extra = schema.get("additionalProperties")
        if isinstance(extra, dict):
            return f"Record<string, {ts_type(extra, schemas)}>"
        return "Record<string, unknown>"
    return {
        "string": "string",
        "integer": "number",
        "number": "number",
        "boolean": "boolean",
        "null": "null",
    }.get(t, "unknown")


def emit(name: str, schema: dict, schemas: dict) -> str:
    """Render one component schema as an interface or a string-union alias."""
    doc = schema.get("description", "").strip()

    if "enum" in schema and "properties" not in schema:
        block = f"/** {doc} */\n" if doc else ""
        values = " | ".join(
            f'"{v}"' if isinstance(v, str) else str(v) for v in schema["enum"]
        )
        return f"{block}export type {name} = {values};\n"

    lines = []
    if doc:
        lines.append("/**")
        lines += [f" * {ln}".rstrip() for ln in doc.splitlines()]
        lines.append(" */")
    lines.append(f"export interface {name} {{")

    required = set(schema.get("required", []))
    for prop, sub in schema.get("properties", {}).items():
        pdoc = sub.get("description", "").strip()
        if pdoc:
            one_line = " ".join(pdoc.split())
            lines.append(f"  /** {one_line} */")
        optional = "" if prop in required else "?"
        lines.append(f"  {prop}{optional}: {ts_type(sub, schemas)};")
    lines.append("}")
    return "\n".join(lines) + "\n"


def render() -> str:
    schemas = app.openapi()["components"]["schemas"]
    blocks = [
        emit(name, schemas[name], schemas)
        for name in sorted(schemas)
        if name not in SKIP
    ]
    return HEADER + "\n" + "\n".join(blocks)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="exit 1 if the file is stale")
    args = ap.parse_args()

    new = render()
    current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""

    if args.check:
        if new != current:
            print(f"STALE: {OUT} does not match the OpenAPI schema.", file=sys.stderr)
            print("Run: python scripts/gen_client_types.py", file=sys.stderr)
            return 1
        print(f"up to date: {OUT.name}")
        return 0

    OUT.write_text(new, encoding="utf-8")
    n = sum(1 for line in new.splitlines() if line.startswith(("export interface", "export type")))
    print(f"wrote {OUT} ({n} types)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
