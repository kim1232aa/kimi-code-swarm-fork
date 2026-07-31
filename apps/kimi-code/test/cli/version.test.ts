import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createKimiCodeUserAgent,
  getHostPackageJsonPath,
  getHostPackageRoot,
  getVersion,
  installSwarmRuntimeMetadata,
  KIMI_CODE_CAPABILITIES,
  KIMI_CODE_SWARM_VERSION,
} from '#/cli/version';

describe('cli version helpers', () => {
  it('resolves the host package manifest near apps/kimi-code and reads its version', () => {
    const pkgPath = getHostPackageJsonPath();
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

    expect(pkgPath.endsWith(join('apps', 'kimi-code', 'package.json'))).toBe(true);
    expect(getHostPackageRoot()).toBe(dirname(pkgPath));
    expect(getVersion()).toBe(pkg.version);
  });

  it('builds the product user-agent for ad-hoc fetches', () => {
    expect(createKimiCodeUserAgent('1.2.3')).toBe('kimi-code-cli/1.2.3');
  });

  it('publishes idempotent swarm capability and version metadata', () => {
    const env: Record<string, string | undefined> = {
      [KIMI_CODE_CAPABILITIES]: ' existing-capability,agent-swarm-item-models-v1 ',
    };

    installSwarmRuntimeMetadata('0.31.0+swarm.1', env);
    installSwarmRuntimeMetadata('0.31.0+swarm.1', env);

    expect(env[KIMI_CODE_CAPABILITIES]).toBe(
      'existing-capability,agent-swarm-item-models-v1',
    );
    expect(env[KIMI_CODE_SWARM_VERSION]).toBe('0.31.0+swarm.1');
  });
});
