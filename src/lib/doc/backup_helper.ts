import type { BakProject } from './v0';
import { bakProjectSchema } from './v0';

export async function serializeBak(bak: BakProject): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(JSON.stringify(bak));
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(encoded);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function deserializeBak(
  data: Uint8Array | Blob,
): Promise<BakProject> {
  const blob =
    data instanceof Blob ? data : new Blob([data.buffer as ArrayBuffer]);
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return bakProjectSchema.parse(JSON.parse(text));
}

export function bakToBlob(data: Uint8Array): Blob {
  return new Blob([data.buffer as ArrayBuffer], { type: 'application/gzip' });
}
