export interface LoadWithFallbackResult<T> {
  value: T;
  error: boolean;
}

/**
 * Tenta carregar um valor sem deixar a interface presa caso a chamada falhe ou demore demais.
 * Em qualquer falha conserva o último valor válido fornecido como fallback.
 */
export async function loadWithFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
  timeoutMs = 10_000,
): Promise<LoadWithFallbackResult<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const value = await Promise.race([
      Promise.resolve().then(loader),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("A solicitação excedeu o tempo limite.")),
          timeoutMs,
        );
      }),
    ]);
    return { value, error: false };
  } catch {
    return { value: fallback, error: true };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
