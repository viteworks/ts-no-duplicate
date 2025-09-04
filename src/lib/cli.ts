import { program } from 'commander'
import { promises as fs, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { duplicateDetectorApi } from './api'
import { Logger } from './logger'
import chalk from 'chalk'

// 获取 package.json 版本号
function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const packageJsonPath = join(__dirname, '../../package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    return packageJson.version
  }
  catch {
    return '1.0.0' // fallback version
  }
}

/**
 * CLI 接口选项
 */
export interface CliOptions {
  config?: string
  format: 'console' | 'json' | 'markdown'
  output?: string
}

/**
 * 解析命令行参数
 * @returns 解析后的选项
 */
export function parseCliArgs(): CliOptions {
  program
    .name('ts-no-duplicate')
    .description('TypeScript 跨文件重复命名检测工具')
    .version(getVersion())
    .option('-c, --config <path>', '加载配置文件路径')
    .option('-f, --format <format>', '输出格式 (console|json|markdown)', 'console')
    .option('--output <file>', '输出到文件')

  program.parse()

  const options = program.opts()
  return {
    config: options.config,
    format: options.format || 'console',
    output: options.output,
  }
}

/**
 * 执行CLI命令
 * @param options CLI选项
 */
export async function executeCliCommand(options: CliOptions): Promise<void> {
  try {
    // 只在非 JSON 格式时显示启动信息
    if (options.format !== 'json') {
      Logger.info('启动 TypeScript 重复命名检测...\n')
    }

    // 在JSON模式下，临时禁用所有日志输出
    const isJsonMode = options.format === 'json'
    let originalConsoleLog = console.log
    let originalConsoleError = console.error

    if (isJsonMode) {
      originalConsoleLog = console.log
      originalConsoleError = console.error
      console.log = () => { } // 禁用console.log
      console.error = () => { } // 禁用console.error
    }

    try {
      // 执行检测
      const report = await duplicateDetectorApi.detectWithConfig(options.config)

      // 恢复console输出
      if (isJsonMode) {
        console.log = originalConsoleLog
        console.error = originalConsoleError
      }

      // 格式化输出
      const formattedOutput = duplicateDetectorApi.formatReport(report, options.format)

      if (options.output) {
        await fs.writeFile(options.output, formattedOutput)
        if (!isJsonMode) {
          Logger.success(`报告已保存到: ${options.output}`)
        }
      }
      else {
        console.log(formattedOutput)
      }

      // 如果发现重复，退出码为 1
      if (report.duplicates.length > 0) {
        process.exit(1)
      }
    }
    finally {
      // 确保恢复console输出
      if (isJsonMode && originalConsoleLog && originalConsoleError) {
        console.log = originalConsoleLog
        console.error = originalConsoleError
      }
    }
  }
  catch (error) {
    Logger.error('检测过程中发生错误:')
    console.error(error)
    process.exit(1)
  }
}

/**
 * CLI 主函数 - 只做参数解析和调用
 */
export async function runCli(): Promise<void> {
  const options = parseCliArgs()
  await executeCliCommand(options)
}

// 处理未捕获的异常
process.on(
  'uncaughtException',
  (error) => {
    console.error(
      chalk.red('未捕获的异常:'),
      error.message,
    )
    process.exit(1)
  },
)

process.on(
  'unhandledRejection',
  (reason) => {
    console.error(
      chalk.red('未处理的Promise拒绝:'),
      reason,
    )
    process.exit(1)
  },
)
