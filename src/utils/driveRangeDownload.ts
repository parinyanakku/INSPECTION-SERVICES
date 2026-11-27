// Drive revisions are immutable. Request one range at a time so a transient
// server error can be retried by the Drive client at the current offset.
const rangeBytes = 4 * 1024 * 1024;

export async function downloadDriveRevision(
  size: number,
  request: (range?: string) => Promise<Response>,
  signal: AbortSignal,
): Promise<Response> {
  if (!Number.isSafeInteger(size) || size <= rangeBytes) return request();

  const fetchRange = (start: number) => {
    signal.throwIfAborted();
    const end = Math.min(start + rangeBytes, size) - 1;
    return request(`bytes=${start}-${end}`);
  };
  const first = await fetchRange(0);
  // Some servers ignore Range and return the complete file.
  if (first.status === 200) return first;

  let offset = 0;
  let pending: Response | undefined = first;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const response = pending ?? await fetchRange(offset);
      pending = undefined;
      const end = Math.min(offset + rangeBytes, size);
      const contentRange = response.headers.get('Content-Range');
      if (response.status !== 206 || (contentRange && contentRange !== `bytes ${offset}-${end - 1}/${size}`)) {
        await response.body?.cancel();
        throw Error('Invalid Drive download range');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      signal.throwIfAborted();
      if (bytes.length !== end - offset) throw Error('Incomplete Drive download range');
      controller.enqueue(bytes);
      offset = end;
      if (offset === size) controller.close();
    },
  }, { highWaterMark: 0 });
  return new Response(body, { headers: { 'Content-Length': String(size) } });
}
