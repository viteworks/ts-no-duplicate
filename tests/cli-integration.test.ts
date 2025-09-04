import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { execSync } from 'child_process'
import fs from 'fs'

describe('CLI Integration Tests', () => {
  const testFixturesPath = resolve(__dirname, 'fixtures')

  describe('CLI Wiring', () => {
    it('应该能够通过CLI执行检测并返回JSON格式结果', async () => {
      // 创建临时配置文件
      const tempConfigPath = 'temp-test-config.ts'

      try {
        // 写入临时配置文件
        fs.writeFileSync(tempConfigPath, `
export default {
  includePatterns: ["${testFixturesPath}/duplicate-functions*.ts"],
  excludePatterns: []
}
`)

        // 使用配置文件执行命令
        execSync(
          `pnpm exec tsx src/index.ts --format json --config ${tempConfigPath}`,
          { encoding: 'utf-8', cwd: process.cwd() },
        )
      }
      catch (error: any) {
        // 命令因为发现重复而失败，但输出仍然有效
        const result = error.stdout

        // 验证输出是有效的JSON
        expect(() => JSON.parse(result)).not.toThrow()

        const report = JSON.parse(result)
        expect(report.duplicates).toBeDefined()
        expect(report.summary).toBeDefined()
      }
      finally {
        // 清理临时配置文件
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath)
        }
      }
    })

    it('应该能够处理无重复的情况', async () => {
      // 创建临时配置文件
      const tempConfigPath = 'temp-test-config-no-dups.ts'

      try {
        // 写入临时配置文件
        fs.writeFileSync(tempConfigPath, `
export default {
  includePatterns: ["${testFixturesPath}/no-duplicates.ts"],
  excludePatterns: []
}
`)

        const result = execSync(
          `pnpm exec tsx src/index.ts --format json --config ${tempConfigPath}`,
          { encoding: 'utf-8', cwd: process.cwd() },
        )

        const report = JSON.parse(result)
        expect(report.duplicates).toHaveLength(0)
        expect(report.summary.duplicateGroups).toBe(0)
      }
      finally {
        // 清理临时配置文件
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath)
        }
      }
    })

    it('应该支持不同的输出格式', async () => {
      // 创建临时配置文件
      const tempConfigPath = 'temp-test-config-format.ts'

      try {
        // 写入临时配置文件
        fs.writeFileSync(tempConfigPath, `
export default {
  includePatterns: ["${testFixturesPath}/no-duplicates.ts"],
  excludePatterns: []
}
`)

        const result = execSync(
          `pnpm exec tsx src/index.ts --format console --config ${tempConfigPath}`,
          { encoding: 'utf-8', cwd: process.cwd() },
        )

        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)
      }
      finally {
        // 清理临时配置文件
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath)
        }
      }
    })

    it('应该在发现重复时返回非零退出码', async () => {
      // 创建临时配置文件
      const tempConfigPath = 'temp-test-config-exit-code.ts'
      let exitCode = 0

      try {
        // 写入临时配置文件
        fs.writeFileSync(tempConfigPath, `
export default {
  includePatterns: ["${testFixturesPath}/duplicate-functions*.ts"],
  excludePatterns: []
}
`)

        execSync(
          `pnpm exec tsx src/index.ts --format json --config ${tempConfigPath}`,
          { encoding: 'utf-8', cwd: process.cwd() },
        )
      }
      catch (error: any) {
        exitCode = error.status
      }
      finally {
        // 清理临时配置文件
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath)
        }
      }

      expect(exitCode).toBe(1)
    })

    it('应该在没有重复时返回零退出码', async () => {
      // 创建临时配置文件
      const tempConfigPath = 'temp-test-config-zero-exit.ts'
      let exitCode = 0

      try {
        // 写入临时配置文件
        fs.writeFileSync(tempConfigPath, `
export default {
  includePatterns: ["${testFixturesPath}/no-duplicates.ts"],
  excludePatterns: []
}
`)

        execSync(
          `pnpm exec tsx src/index.ts --format json --config ${tempConfigPath}`,
          { encoding: 'utf-8', cwd: process.cwd() },
        )
      }
      catch (error: any) {
        exitCode = error.status
      }
      finally {
        // 清理临时配置文件
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath)
        }
      }

      expect(exitCode).toBe(0)
    })
  })

  describe('配置文件选项', () => {
    it('应该支持ignoreTypes配置选项', async () => {
      // 创建临时配置文件
      const tempConfigPath = 'temp-test-config-ignore-types.ts'

      try {
        // 写入临时配置文件，包含ignoreTypes选项
        fs.writeFileSync(tempConfigPath, `
export default {
  includePatterns: ["${testFixturesPath}/duplicate-functions*.ts"],
  excludePatterns: [],
  ignoreTypes: ['function']
}
`)

        const result = execSync(
          `pnpm exec tsx src/index.ts --format json --config ${tempConfigPath}`,
          { encoding: 'utf-8', cwd: process.cwd() },
        )

        const report = JSON.parse(result)
        const functionDuplicates = report.duplicates.filter(
          (dup: any) => dup.type === 'function',
        )

        expect(functionDuplicates).toHaveLength(0)
      }
      finally {
        // 清理临时配置文件
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath)
        }
      }
    })

    it('应该支持includeInternal配置选项', async () => {
      // 创建临时配置文件
      const tempConfigPath = 'temp-test-config-internal.ts'
      let result: string

      try {
        // 写入临时配置文件，包含includeInternal选项
        fs.writeFileSync(tempConfigPath, `
export default {
  includePatterns: ["${testFixturesPath}/*.ts"],
  excludePatterns: [],
  includeInternal: true
}
`)

        try {
          result = execSync(
            `pnpm exec tsx src/index.ts --format json --config ${tempConfigPath}`,
            { encoding: 'utf-8', cwd: process.cwd() },
          )
        }
        catch (error: any) {
          // 命令可能因为发现重复而失败，但输出仍然有效
          result = error.stdout
        }

        const report = JSON.parse(result)
        expect(report.summary).toBeDefined()
        // 内部声明应该被包含在检测结果中
        expect(report.summary.totalDeclarations).toBeGreaterThan(0)
      }
      finally {
        // 清理临时配置文件
        if (fs.existsSync(tempConfigPath)) {
          fs.unlinkSync(tempConfigPath)
        }
      }
    })
  })
})
