/** Read TICO's SSE frames, including split UTF-8 characters and CRLF boundaries. */
export async function readTicoStream(
  stream: ReadableStream<Uint8Array>,
  onAnswer: (answer: string) => void,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  function frame(text: string): boolean {
    const data = text.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return false;
    let payload: { delta?: unknown; done?: unknown };
    try { payload = JSON.parse(data); } catch { return false; }
    if (!payload || typeof payload !== "object") return false;
    if (typeof payload.delta === "string" && payload.delta) {
      answer += payload.delta;
      onAnswer(answer);
    }
    return payload.done === true;
  }

  try {
    for (;;) {
      const {done, value} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream:true});
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const text = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (frame(text)) {
          await reader.cancel();
          return answer;
        }
      }
      if (done) {
        if (buffer.trim()) frame(buffer);
        return answer;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
