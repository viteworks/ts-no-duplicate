import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { execSync } from 'child_process'

describe('CLI Integration Tests', () => {
  const testFixturesPath = resolve(__dirname, 'fixtures')

  describe('CLI Wiring', () => {
    it('应该能够通过CLI执行检测并返回JSON格式结果', async () => {
      try {
        execSync(
          `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/duplicate-functions*.ts"`,
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
    })

    it('应该能够处理无重复的情况', async () => {
      const result = execSync(
        `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/no-duplicates.ts"`,
        { encoding: 'utf-8', cwd: process.cwd() },
      )

      const report = JSON.parse(result)
      expect(report.duplicates).toHaveLength(0)
      expect(report.summary.duplicateGroups).toBe(0)
    })

    it('应该支持不同的输出格式', async () => {
      const result = execSync(
        `pnpm exec tsx src/index.ts --format console --include "${testFixturesPath}/no-duplicates.ts"`,
        { encoding: 'utf-8', cwd: process.cwd() },
      )

      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('应该在发现重复时返回非零退出码', async () => {
      let exitCode = 0
      try {
        execSync(
          `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/duplicate-functions*.ts"`,
          { encoding: 'utf-8', cwd: process.cwd() },
        )
      }
      catch (error: any) {
        exitCode = error.status
      }

      expect(exitCode).toBe(1)
    })

    it('应该在没有重复时返回零退出码', async () => {
      let exitCode = 0
      try {
        execSync(
          `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/no-duplicates.ts"`,
          { encoding: 'utf-8', cwd: process.cwd() },
        )
      }
      catch (error: any) {
        exitCode = error.status
      }

      expect(exitCode).toBe(0)
    })
  })

  describe('CLI Options', () => {
    it('应该支持--ignore-types选项', async () => {
      const result = execSync(
        `pnpm exec tsx src/index.ts --format json --ignore-types function --include "${testFixturesPath}/duplicate-functions*.ts"`,
        { encoding: 'utf-8', cwd: process.cwd() },
      )

      const report = JSON.parse(result)
      const functionDuplicates = report.duplicates.filter(
        (dup: any) => dup.type === 'function',
      )

      expect(functionDuplicates).toHaveLength(0)
    })

    it('应该支持--include-internal选项', async () => {
      // 这个测试需要有内部声明的测试文件
      let result: string
      try {
        result = execSync(
          `pnpm exec tsx src/index.ts --format json --include-internal --include "${testFixturesPath}/*.ts"`,
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
    })
  })
})
