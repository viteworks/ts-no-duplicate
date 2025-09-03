import { merge } from 'lodash-es'
import { relative } from 'path'
import { Project, SourceFile } from 'ts-morph'
import { DEFAULT_DETECTOR_OPTIONS } from '@/const'
import { Logger } from './logger'
import type { DeclarationLocation, DeclarationType, DetectorOptions, DuplicateGroup, DuplicateReport } from '@/types'

/**
 * TypeScript 重复命名检测器
 *
 * 核心功能：
 * - 扫描 TypeScript 项目中的所有声明
 * - 检测跨文件的重复命名
 * - 支持多种声明类型（函数、类、接口等）
 * - 提供灵活的过滤和规则配置
 */
export class DuplicateDetector {
  /** ts-morph 项目实例 */
  private project: Project
  /** 检测器配置选项 */
  private options: Required<DetectorOptions>
  /** 声明映射表：key为"名称:类型"，value为位置列表 */
  private declarations = new Map<string, DeclarationLocation[]>()

  /**
   * 构造函数 - 初始化重复检测器
   * @param options 检测器配置选项
   */
  constructor(options: DetectorOptions = {}) {
    // 使用 lodash merge 进行深度合并配置
    this.options = merge({}, DEFAULT_DETECTOR_OPTIONS, options) as Required<DetectorOptions>

    this.project = new Project({
      tsConfigFilePath: this.options.tsConfigPath,
      skipAddingFilesFromTsConfig: false,
    })
  }

  /**
   * 执行重复检测
   * @param silent 是否静默模式（不输出进度信息）
   * @returns 检测报告
   */
  async detect(silent: boolean = false): Promise<DuplicateReport> {
    const sourceFiles = this.getFilteredSourceFiles()

    if (!silent) {
      Logger.info(`扫描 ${sourceFiles.length} 个文件...`)
    }

    // 扫描所有文件，收集声明信息
    for (const sourceFile of sourceFiles) {
      await this.scanSourceFile(sourceFile)
    }

    // 生成并返回检测报告
    return this.generateReport()
  }

  /**
   * 获取过滤后的源文件列表
   * 根据包含和排除模式过滤文件
   */
  private getFilteredSourceFiles(): SourceFile[] {
    return this.project.getSourceFiles().filter((file) => {
      const filePath = file.getFilePath()
      // 检查是否匹配包含模式
      const matchesInclude = this.options.includePatterns.some(pattern =>
        this.matchesGlob(filePath, pattern),
      )

      if (!matchesInclude) return false

      // 检查是否匹配排除模式
      const matchesExclude = this.options.excludePatterns.some(pattern =>
        this.matchesGlob(filePath, pattern),
      )

      return !matchesExclude
    })
  }

  /**
   * 简单的 glob 模式匹配
   * @param filePath 文件路径
   * @param pattern glob 模式
   * @returns 是否匹配
   */
  private matchesGlob(filePath: string, pattern: string): boolean {
    // 将 glob 模式转换为正则表达式
    const regex = pattern
      .replace(/\*\*/g, '.*') // ** 匹配任意路径
      .replace(/\*/g, '[^/]*') // * 匹配除路径分隔符外的任意字符
      .replace(/\?/g, '.') // ? 匹配单个字符

    return new RegExp(regex).test(filePath)
  }

  /**
   * 扫描单个源文件，提取所有声明
   * @param sourceFile 要扫描的源文件
   */
  private async scanSourceFile(sourceFile: SourceFile): Promise<void> {
    const filePath = relative(process.cwd(), sourceFile.getFilePath())

    // 扫描各种声明类型
    this.scanDeclarations(sourceFile, 'function', sourceFile.getFunctions())
    this.scanDeclarations(sourceFile, 'class', sourceFile.getClasses())
    this.scanDeclarations(sourceFile, 'interface', sourceFile.getInterfaces())
    this.scanDeclarations(sourceFile, 'type', sourceFile.getTypeAliases())
    this.scanDeclarations(sourceFile, 'enum', sourceFile.getEnums())

    // 扫描命名空间（模块）
    try {
      const modules = (sourceFile as any).getModules?.() || []
      this.scanDeclarations(sourceFile, 'namespace', modules)
    }
    catch {
      // 如果 getModules 方法不存在，跳过命名空间扫描
    }

    // 扫描变量声明（需要特殊处理）
    sourceFile.getVariableDeclarations().forEach((varDecl) => {
      const name = varDecl.getName()
      if (name && (this.options.includeInternal || this.isExported(varDecl))) {
        this.addDeclaration(name, 'variable', filePath, varDecl)
      }
    })
  }

  /**
   * 扫描特定类型的声明列表
   * @param sourceFile 源文件
   * @param type 声明类型
   * @param declarations 声明节点列表
   */
  private scanDeclarations(sourceFile: SourceFile, type: DeclarationType, declarations: any[]): void {
    const filePath = relative(process.cwd(), sourceFile.getFilePath())

    declarations.forEach((decl) => {
      const name = decl.getName?.()
      // 只处理有名称且符合导出条件的声明
      if (name && (this.options.includeInternal || this.isExported(decl))) {
        this.addDeclaration(name, type, filePath, decl)
      }
    })
  }

  /**
   * 添加声明到检测映射表
   * @param name 声明名称
   * @param type 声明类型
   * @param filePath 文件路径
   * @param node AST 节点
   */
  private addDeclaration(name: string, type: DeclarationType, filePath: string, node: any): void {
    // 应用过滤规则
    if (this.options.ignoreTypes.includes(type)) return
    if (this.options.ignoreNames.includes(name)) return

    // 生成唯一键：名称+类型
    const key = `${name}:${type}`
    const pos = node.getStart()
    const sourceFile = node.getSourceFile()
    const lineAndColumn = sourceFile.getLineAndColumnAtPos(pos)

    // 获取声明的上下文代码片段
    const context = this.getDeclarationContext(node)

    const location: DeclarationLocation = {
      file: filePath,
      line: lineAndColumn.line,
      column: lineAndColumn.column,
      context,
    }

    // 添加到映射表
    if (!this.declarations.has(key)) {
      this.declarations.set(key, [])
    }

    this.declarations.get(key)!.push(location)
  }

  /**
   * 获取声明的上下文代码片段
   * @param node AST 节点
   * @returns 代码片段字符串
   */
  private getDeclarationContext(node: any): string {
    try {
      const text = node.getText()
      const lines = text.split('\n')
      const firstLine = lines[0].trim()
      // 限制长度，避免过长的代码片段
      return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine
    }
    catch {
      return ''
    }
  }

  /**
   * 检查声明是否被导出
   * @param node AST 节点
   * @returns 是否导出
   */
  private isExported(node: any): boolean {
    try {
      return node.hasExportKeyword?.() // 直接导出
        || node.getParent()?.hasExportKeyword?.() // 父节点导出
        || node.isDefaultExport?.() // 默认导出
        || false
    }
    catch {
      return false
    }
  }

  private generateReport(): DuplicateReport {
    const duplicateGroups: DuplicateGroup[] = []
    let totalDeclarations = 0

    for (const [key, locations] of this.declarations.entries()) {
      totalDeclarations += locations.length

      if (locations.length > 1) {
        const [name, type] = key.split(':')

        // 应用规则过滤
        const filteredLocations = this.applyRules(locations, type as DeclarationType)

        if (filteredLocations.length > 1) {
          duplicateGroups.push({
            name,
            type: type as DeclarationType,
            count: filteredLocations.length,
            locations: filteredLocations,
          })
        }
      }
    }

    // 按重复次数排序
    duplicateGroups.sort((a, b) => b.count - a.count)

    return {
      summary: {
        totalFiles: this.project.getSourceFiles().length,
        totalDeclarations,
        duplicateGroups: duplicateGroups.length,
        duplicateDeclarations: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
      },
      duplicates: duplicateGroups,
    }
  }

  /**
   * 应用检测规则过滤重复位置
   * @param locations 原始位置列表
   * @param type 声明类型
   * @returns 过滤后的位置列表
   */
  private applyRules(locations: DeclarationLocation[], type: DeclarationType): DeclarationLocation[] {
    let filteredLocations = [...locations]

    // 规则1: 允许同文件函数重载
    if (this.options.rules.allowSameFileOverloads && type === 'function') {
      const fileGroups = new Map<string, DeclarationLocation[]>()

      // 按文件分组
      for (const location of filteredLocations) {
        if (!fileGroups.has(location.file)) {
          fileGroups.set(location.file, [])
        }
        fileGroups.get(location.file)!.push(location)
      }

      // 每个文件只保留一个声明（认为是重载）
      filteredLocations = Array.from(fileGroups.values()).map(group => group[0])
    }

    // 规则2: 跨模块重复检查
    if (!this.options.rules.allowCrossModuleDuplicates) {
      const files = new Set(filteredLocations.map(loc => loc.file))
      // 如果只在一个文件内重复，且不允许跨模块重复，则忽略
      if (files.size <= 1) {
        return []
      }
    }

    // 规则3: 最大重复数量限制
    const maxDuplicates = this.options.rules.maxDuplicatesPerName
    if (maxDuplicates && maxDuplicates > 0) {
      if (filteredLocations.length > maxDuplicates) {
        // 只保留前N个位置
        filteredLocations = filteredLocations.slice(0, maxDuplicates)
      }
    }

    return filteredLocations
  }
}
