import type { CliRegistry } from './cli-registry.js';
import type { Role } from '../types/common.js';
import { hasToolGroup, type ToolGroup } from './roles.js';

export interface RegisterToolsOptions {
  commandName?: string;
  onGroupRegister?: (group: ToolGroup, commands: string[]) => void;
}

type GroupLoader = () => Promise<(server: CliRegistry) => void>;

export const groupLoaders: Record<ToolGroup, GroupLoader> = {
  init: async () => (await import('../tools/init.js')).registerInitTools,
  scene: async () => (await import('../tools/scene.js')).registerSceneTools,
  root: async () => {
    const { registerEndpointTools } = await import('../tools/endpoints.js');
    return (server) => registerEndpointTools(server, 'root');
  },
  ci: async () => {
    const { registerEndpointTools } = await import('../tools/endpoints.js');
    const { registerCiOrchestratedTools } = await import('../tools/ci-orchestrated.js');
    return (server) => {
      registerEndpointTools(server, 'ci');
      registerCiOrchestratedTools(server);
    };
  },
  deploy: async () => {
    const { registerEndpointTools } = await import('../tools/endpoints.js');
    return (server) => registerEndpointTools(server, 'deploy');
  },
  file: async () => {
    const { registerEndpointTools } = await import('../tools/endpoints.js');
    return (server) => registerEndpointTools(server, 'file');
  },
  iter: async () => {
    const { registerEndpointTools } = await import('../tools/endpoints.js');
    return (server) => registerEndpointTools(server, 'iter');
  },
  rbac: async () => {
    const { registerEndpointTools } = await import('../tools/endpoints.js');
    return (server) => registerEndpointTools(server, 'rbac');
  },
  ops: async () => (await import('../tools/ops.js')).registerOpsTools,
  push: async () => (await import('../tools/push.js')).registerPushTools,
};

export async function registerTools(
  server: CliRegistry,
  role: Role,
  options: RegisterToolsOptions = {},
): Promise<void> {
  const { commandName, onGroupRegister } = options;

  if (commandName) {
    const group = await resolveCommandGroup(commandName);
    if (group && hasToolGroup(role, group)) {
      await registerGroup(server, group, onGroupRegister);
      return;
    }
  }

  for (const group of Object.keys(groupLoaders) as ToolGroup[]) {
    if (!hasToolGroup(role, group)) continue;
    await registerGroup(server, group, onGroupRegister);
  }
}

async function registerGroup(
  server: CliRegistry,
  group: ToolGroup,
  onGroupRegister?: (group: ToolGroup, commands: string[]) => void,
): Promise<void> {
  const before = new Set(server.listCommands().map((command) => command.name));
  const register = await groupLoaders[group]();
  register(server);
  const added = server.listCommands().map((command) => command.name).filter((name) => !before.has(name));
  onGroupRegister?.(group, added);
}

async function resolveCommandGroup(commandName: string): Promise<ToolGroup | undefined> {
  if (commandName === 'initAlpha' || commandName === 'getAlphaConfig') {
    return 'init';
  }

  if (commandName === 'devopsScene') {
    return 'scene';
  }

  // 运维编排命令：opsPush / pushPkg 等自定义命令，不参与 endpoint 清单查询
  const { OPS_COMMAND_NAMES, isOpsCommand } = await import('../tools/ops.js');
  if (OPS_COMMAND_NAMES.includes(commandName) || isOpsCommand(commandName)) return 'ops';

  const { PUSH_COMMAND_NAMES } = await import('../tools/push.js');
  if (PUSH_COMMAND_NAMES.includes(commandName)) return 'push';

  const { findEndpointGroup } = await import('../tools/endpoints.js');
  return findEndpointGroup(commandName);
}
