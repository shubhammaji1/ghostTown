import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realpath, mkdir } from 'node:fs/promises';

export function localURL(input: string, base?: string): URL {
  const url = new URL(input, base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('Only explicitly selected loopback HTTP(S) applications are supported');
  return url;
}
export function allowedURL(input: string, origins: Set<string>): boolean {
  try {
    return origins.has(localURL(input).origin);
  } catch {
    return false;
  }
}
export function safePath(root: string, child: string): string {
  const path = resolve(root, child),
    rel = relative(resolve(root), path);
  if (isAbsolute(child) || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error('Artifact path escapes storage root');
  return path;
}
export async function existingArtifact(root: string, child: string): Promise<string> {
  const base = await realpath(root),
    file = await realpath(safePath(base, child));
  safePath(base, relative(base, file));
  return file;
}
export async function privateDirectory(path: string): Promise<string> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  return realpath(path);
}
export function redact(input: string): string {
  return input
    .replace(/(bearer\s+)[\w.+\-/=]+/gi, '$1[redacted]')
    .replace(/([?&](?:token|key|password|secret|authorization)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/((?:password|api[_-]?key|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
    .slice(0, 2000);
}
