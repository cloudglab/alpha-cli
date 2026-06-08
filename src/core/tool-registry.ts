import type { CliRegistry } from './cli-registry.js';
import { hasToolGroup } from './roles.js';
import type { Role } from '../types/common.js';
import { registerEndpointTools } from '../tools/endpoints.js';
import { registerInitTools } from '../tools/init.js';

export function registerTools(server: CliRegistry, role: Role): void {
  if (hasToolGroup(role, 'init')) registerInitTools(server);
  registerEndpointTools(server, (group) => hasToolGroup(role, group));
}
