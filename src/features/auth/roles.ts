export type WorkspaceRole = 'owner' | 'staff' | 'sme' | 'rider';
export function workspacePath(memberships: ReadonlyArray<{ role: string }>): string | null {
  if (memberships.some(m => m.role === 'owner' || m.role === 'staff')) return '/warehouse';
  if (memberships.some(m => m.role === 'sme')) return '/sme';
  if (memberships.some(m => m.role === 'rider')) return '/courier';
  return null;
}
