import type { Role } from '../types/common.js';

export type EndpointToolGroup = 'root' | 'ci' | 'deploy' | 'file' | 'iter' | 'rbac';
export type ToolGroup = 'init' | 'scene' | EndpointToolGroup;

const ROLE_TOOL_GROUPS: Record<Role, ToolGroup[]> = {
  full: ['root', 'ci', 'deploy', 'file', 'iter', 'rbac', 'scene', 'init'],
  ci: ['ci', 'scene', 'init'],
  deploy: ['deploy', 'file', 'scene', 'init'],
  iter: ['iter', 'scene', 'init'],
  rbac: ['rbac', 'scene', 'init'],
  file: ['file', 'scene', 'init'],
};

export function hasToolGroup(role: Role, group: ToolGroup): boolean {
  return ROLE_TOOL_GROUPS[role].includes(group);
}

export function getToolGroups(role: Role): ToolGroup[] {
  return ROLE_TOOL_GROUPS[role];
}
