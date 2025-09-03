import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigLoader } from '../src/lib/config-loader'
import { DEFAULT_DETECTOR_OPTIONS } from '../src/const'

describe('ConfigLoader', () => {
  afterEach(() => {
    // 清理所有可能的测试文件
    const testFiles = [
      'ts-no-duplicate.ts',
      'test-config-1.ts',
      'test-config-2.ts',
      'test-config-3.ts',
      'test-config-4.ts',
      'test-config-5.ts',
    ]

    testFiles.forEach((file) => {
      if (existsSync(file)) {
        unlinkSync(file)
      }
    })
  })

  it('应该加载默认配置当没有配置文件时', async () => {
    const config = await ConfigLoader.load()

    expect(config).toBeDefined()
    expect(config.tsConfigPath).toBe(DEFAULT_DETECTOR_OPTIONS.tsConfigPath)
    expect(config.includeInternal).toBe(DEFAULT_DETECTOR_OPTIONS.includeInternal)
    expect(config.excludePatterns).toEqual(expect.arrayContaining(DEFAULT_DETECTOR_OPTIONS.excludePatterns || []))
    expect(config.includePatterns).toEqual(expect.arrayContaining(DEFAULT_DETECTOR_OPTIONS.includePatterns || []))
  })

  it('应该加载 ts-no-duplicate.ts 配置文件', async () => {
    const testConfigPath = 'test-config-1.ts'
    const testConfigContent = `
import type { DetectorOptions } from '../src/index'

const config: DetectorOptions = {
  tsConfigPath: './custom-tsconfig.json',
  includeInternal: true,
  excludePatterns: ['**/*.custom.ts'],
  includePatterns: ['**/*.tsx'],
  ignoreTypes: ['function'],
  ignoreNames: ['test'],
  rules: {
    allowSameFileOverloads: false,
    allowCrossModuleDuplicates: true,
    maxDuplicatesPerName: 5,
  },
}

export default config
`

    writeFileSync(testConfigPath, testConfigContent)

    const config = await ConfigLoader.load(testConfigPath)

    expect(config.tsConfigPath).toBe('./custom-tsconfig.json')
    expect(config.includeInternal).toBe(true)
    expect(config.excludePatterns).toContain('**/*.custom.ts')
    expect(config.includePatterns).toContain('**/*.tsx')
    expect(config.ignoreTypes).toEqual(['function'])
    expect(config.ignoreNames).toEqual(['test'])
    expect(config.rules?.allowSameFileOverloads).toBe(false)
    expect(config.rules?.allowCrossModuleDuplicates).toBe(true)
    expect(config.rules?.maxDuplicatesPerName).toBe(5)
  })

  it('应该自动查找默认配置文件', async () => {
    const testConfigPath = 'ts-no-duplicate.ts'
    const testConfigContent = `
export default {
  includeInternal: true,
}
`

    writeFileSync(testConfigPath, testConfigContent)

    const config = await ConfigLoader.load()

    expect(config.includeInternal).toBe(true)
  })

  it('应该合并用户配置和默认配置', async () => {
    const testConfigPath = 'test-config-3.ts'
    const testConfigContent = `
export default {
  includeInternal: true,
  excludePatterns: ['**/*.custom.ts'],
}
`

    writeFileSync(testConfigPath, testConfigContent)

    const config = await ConfigLoader.load(testConfigPath)

    // 用户配置应该覆盖默认值
    expect(config.includeInternal).toBe(true)
    expect(config.excludePatterns).toContain('**/*.custom.ts')

    // 默认值应该保留
    expect(config.tsConfigPath).toBe('./tsconfig.json')
    expect(config.includePatterns).toContain('**/*.ts')
  })

  it('应该处理无效的配置文件', async () => {
    const testConfigPath = 'test-config-4.ts'
    writeFileSync(testConfigPath, 'invalid typescript syntax !!!')

    const config = await ConfigLoader.load(testConfigPath)

    // 应该返回默认配置
    expect(config.tsConfigPath).toBe('./tsconfig.json')
    expect(config.includeInternal).toBe(false)
  })
})
