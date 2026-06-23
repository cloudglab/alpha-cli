import { z } from 'zod';
import type { CliRegistry } from '../core/cli-registry.js';
import { DEVOPS_SCENE_COMMAND, DEVOPS_SCENE_GROUP, parseDevopsScene } from '../core/devops-scene.js';
import { jsonResult, withToolMeta } from './shared.js';

const sceneSchema = {
  input: z.string().trim().min(1).describe('devops 浏览器 URL、路由路径或上下文文本'),
};

export function registerSceneTools(server: CliRegistry): void {
  server.tool(
    DEVOPS_SCENE_COMMAND,
    sceneSchema,
    async ({ input }) => {
      const result = parseDevopsScene(input);
      return jsonResult(
        withToolMeta(result, {
          source: 'devops-scene',
          command: DEVOPS_SCENE_COMMAND,
          method: 'parse',
          path: input,
          mode: 'scene',
          group: DEVOPS_SCENE_GROUP,
        }),
      );
    },
    {
      group: DEVOPS_SCENE_GROUP,
      description: '识别 devops 浏览器 URL、路由或上下文文本，并输出可执行命令建议',
      examples: [
        `alpha ${DEVOPS_SCENE_COMMAND} --input https://host/main/devops/iteration/test/123/create`,
        'alpha https://host/main/devops/integration/build/list/42',
      ],
      costHint: 'low',
      nextBestTools: ['help', 'list'],
    },
  );
}
