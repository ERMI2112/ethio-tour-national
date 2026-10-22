export function getWorkspaceUrl(): string {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_WORKSPACE_URL) {
    return process.env.NEXT_PUBLIC_WORKSPACE_URL;
  }
  return process.env.NEXT_PUBLIC_WORKSPACE_URL || `http://localhost:3001`;
}
