import { describe, it, expect, afterEach } from 'vitest';
import { ConfigLoader } from '../src/index.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

describe('ConfigLoader', () => {
  const testConfigPath = '.test-config.json';
  const testJsConfigPath = '.test-config.js';

  afterEach(() => {
    // 清理测试文件
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
    if (existsSync(testJsConfigPath)) {
      unlinkSync(testJsConfigPath);
    }
  });

  it('应该加载默认配置当没有配置文件时', async () => {
    const config = await ConfigLoader.load();
    
    expect(config).toBeDefined();
    expect(config.tsConfigPath).toBe('./tsconfig.json');
    expect(config.includeInternal).toBe(false);
    expect(config.excludePatterns).toContain('**/*.test.ts');
    expect(config.includePatterns).toContain('**/*.ts');
  });

  it('应该加载 JSON 配置文件', async () => {
    const testConfig = {
      tsConfigPath: './custom-tsconfig.json',
      includeInternal: true,
      excludePatterns: ['**/*.custom.ts'],
      includePatterns: ['**/*.tsx'],
      ignoreTypes: ['function'],
      ignoreNames: ['test'],
      rules: {
        allowSameFileOverloads: false,
        allowCrossModuleDuplicates: true,
        maxDuplicatesPerName: 5
      }
    };

    writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
    
    const config = await ConfigLoader.load(testConfigPath);
    
    expect(config.tsConfigPath).toBe('./custom-tsconfig.json');
    expect(config.includeInternal).toBe(true);
    expect(config.excludePatterns).toEqual(['**/*.custom.ts']);
    expect(config.includePatterns).toEqual(['**/*.tsx']);
    expect(config.ignoreTypes).toEqual(['function']);
    expect(config.ignoreNames).toEqual(['test']);
    expect(config.rules?.allowSameFileOverloads).toBe(false);
    expect(config.rules?.allowCrossModuleDuplicates).toBe(true);
    expect(config.rules?.maxDuplicatesPerName).toBe(5);
  });

  it('应该自动查找默认配置文件', async () => {
    const testConfig = {
      includeInternal: true
    };

    writeFileSync('.ts-no-duplicate.json', JSON.stringify(testConfig));
    
    const config = await ConfigLoader.load();
    
    expect(config.includeInternal).toBe(true);
    
    // 清理
    unlinkSync('.ts-no-duplicate.json');
  });

  it('应该合并用户配置和默认配置', async () => {
    const testConfig = {
      includeInternal: true,
      excludePatterns: ['**/*.custom.ts']
    };

    writeFileSync(testConfigPath, JSON.stringify(testConfig));
    
    const config = await ConfigLoader.load(testConfigPath);
    
    // 用户配置应该覆盖默认值
    expect(config.includeInternal).toBe(true);
    expect(config.excludePatterns).toEqual(['**/*.custom.ts']);
    
    // 默认值应该保留
    expect(config.tsConfigPath).toBe('./tsconfig.json');
    expect(config.includePatterns).toContain('**/*.ts');
  });

  it('应该处理无效的配置文件', async () => {
    writeFileSync(testConfigPath, 'invalid json');
    
    const config = await ConfigLoader.load(testConfigPath);
    
    // 应该返回默认配置
    expect(config.tsConfigPath).toBe('./tsconfig.json');
    expect(config.includeInternal).toBe(false);
  });
});