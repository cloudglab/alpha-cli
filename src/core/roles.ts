import type { Role } from '../types/common.js';

const ROLE_GROUPS: Record<Role, string[]> = {
  full: ['root', 'ci', 'deploy', 'file', 'iter', 'rbac', 'init'],
  ci: ['ci', 'init'],
  deploy: ['deploy', 'file', 'init'],
  iter: ['iter', 'init'],
  rbac: ['rbac', 'init'],
  file: ['file', 'init'],
};

export function hasToolGroup(role: Role, group: string): boolean {
  return ROLE_GROUPS[role]?.includes(group) ?? false;
}
