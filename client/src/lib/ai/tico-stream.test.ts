import test from 'node:test';
import assert from 'node:assert/strict';
import { readTicoStream } from './tico-stream';

function chunks(bytes: Uint8Array, size = bytes.length) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i=0;i<bytes.length;i+=size) controller.enqueue(bytes.slice(i,i+size));
      controller.close();
    },
  });
}

test('Arabic UTF-8 and CRLF frames survive one-byte network chunks', async () => {
  const bytes = new TextEncoder().encode('data: {"delta":"أهلاً "}\r\n\r\ndata:{"delta":"يا بطل"}\r\n\r\ndata: {"done":true}\r\n\r\n');
  const answers: string[] = [];
  assert.equal(await readTicoStream(chunks(bytes,1), answer => answers.push(answer)), 'أهلاً يا بطل');
  assert.deepEqual(answers,['أهلاً ','أهلاً يا بطل']);
});

test('a blocked completion includes its redirect and stops before later frames', async () => {
  const bytes = new TextEncoder().encode('data: {"delta":"Let’s focus on Python.","done":true,"blocked":true}\n\ndata: {"delta":"ignore"}\n\n');
  assert.equal(await readTicoStream(chunks(bytes), () => {}),'Let’s focus on Python.');
});

test('keepalives and malformed frames do not hide valid text or an undelimited final frame', async () => {
  const bytes = new TextEncoder().encode(': keepalive\n\ndata: invalid\n\ndata: null\n\ndata: {"delta":123}\n\ndata: {"delta":"Hello"}');
  assert.equal(await readTicoStream(chunks(bytes,3), () => {}),'Hello');
});
