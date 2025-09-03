import { Project, SourceFile } from 'ts-morph';
import { program } from 'commander';
import chalk from 'chalk';
import { relative } from 'path';

/**
 * 重复检测器配置选项
 */
export interface DetectorOptions {
  /** TypeScript 配置文件路径 */
  tsConfigPath?: string;
  /** 是否包含内部（非导出）声明 */
  includeInternal?: boolean;
  /** 排除的文件模式（glob 格式） */
  excludePatterns?: string[];
  /** 包含的文件模式（glob 格式） */
  includePatterns?: string[];
  /** 忽略的声明类型 */
  ignoreTypes?: string[];
  /** 忽略的具体名称 */
  ignoreNames?: string[];
  /** 检测规则配置 */
  rules?: {
    /** 是否允许同文件内的函数重载 */
    allowSameFileOverloads?: boolean;
    /** 是否允许跨模块重复 */
    allowCrossModuleDuplicates?: boolean;
    /** 每个名称的最大重复数量 */
    maxDuplicatesPerName?: number;
  };
}

/**
 * 重复检测报告
 */
export interface DuplicateReport {
  /** 检测摘要信息 */
  summary: {
    /** 扫描的文件总数 */
    totalFiles: number;
    /** 声明总数 */
    totalDeclarations: number;
    /** 重复组数 */
    duplicateGroups: number;
    /** 重复声明数 */
    duplicateDeclarations: number;
  };
  /** 重复项详情列表 */
  duplicates: DuplicateGroup[];
}

/**
 * 重复声明组
 */
export interface DuplicateGroup {
  /** 声明名称 */
  name: string;
  /** 声明类型 */
  type: DeclarationType;
  /** 重复次数 */
  count: number;
  /** 所有重复位置 */
  locations: DeclarationLocation[];
}

/**
 * 声明位置信息
 */
export interface DeclarationLocation {
  /** 文件路径 */
  file: string;
  /** 行号 */
  line: number;
  /** 列号 */
  column: number;
  /** 上下文代码片段 */
  context?: string;
}

/**
 * 支持的声明类型
 */
type DeclarationType = 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'namespace';

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
  private project: Project;
  /** 检测器配置选项 */
  private options: Required<DetectorOptions>;
  /** 声明映射表：key为"名称:类型"，value为位置列表 */
  private declarations = new Map<string, DeclarationLocation[]>();

  /**
   * 构造函数 - 初始化重复检测器
   * @param options 检测器配置选项
   */
  constructor(options: DetectorOptions = {}) {
    // 合并默认配置和用户配置
    this.options = {
      tsConfigPath: './tsconfig.json',
      includeInternal: false,
      excludePatterns: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
      includePatterns: ['**/*.ts', '**/*.tsx'],
      ignoreTypes: [],
      ignoreNames: [],
      rules: {
        allowSameFileOverloads: true,
        allowCrossModuleDuplicates: false,
        maxDuplicatesPerName: 2,
        ...options.rules,
      },
      ...options,
    } as Required<DetectorOptions>;

    this.project = new Project({
      tsConfigFilePath: this.options.tsConfigPath,
      skipAddingFilesFromTsConfig: false,
    });
  }

  /**
   * 执行重复检测
   * @param silent 是否静默模式（不输出进度信息）
   * @returns 检测报告
   */
  async detect(silent: boolean = false): Promise<DuplicateReport> {
    const sourceFiles = this.getFilteredSourceFiles();

    if (!silent) {
      console.log(chalk.blue(`📁 扫描 ${sourceFiles.length} 个文件...`));
    }

    // 扫描所有文件，收集声明信息
    for (const sourceFile of sourceFiles) {
      await this.scanSourceFile(sourceFile);
    }

    // 生成并返回检测报告
    return this.generateReport();
  }

  /**
   * 获取过滤后的源文件列表
   * 根据包含和排除模式过滤文件
   */
  private getFilteredSourceFiles(): SourceFile[] {
    return this.project.getSourceFiles().filter(file => {
      const filePath = file.getFilePath();

      // 检查是否匹配包含模式
      const matchesInclude = this.options.includePatterns.some(pattern =>
        this.matchesGlob(filePath, pattern)
      );

      if (!matchesInclude) return false;

      // 检查是否匹配排除模式
      const matchesExclude = this.options.excludePatterns.some(pattern =>
        this.matchesGlob(filePath, pattern)
      );

      return !matchesExclude;
    });
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
      .replace(/\*\*/g, '.*')      // ** 匹配任意路径
      .replace(/\*/g, '[^/]*')     // * 匹配除路径分隔符外的任意字符
      .replace(/\?/g, '.');        // ? 匹配单个字符

    return new RegExp(regex).test(filePath);
  }

  /**
   * 扫描单个源文件，提取所有声明
   * @param sourceFile 要扫描的源文件
   */
  private async scanSourceFile(sourceFile: SourceFile): Promise<void> {
    const filePath = relative(process.cwd(), sourceFile.getFilePath());

    // 扫描各种声明类型
    this.scanDeclarations(sourceFile, 'function', sourceFile.getFunctions());
    this.scanDeclarations(sourceFile, 'class', sourceFile.getClasses());
    this.scanDeclarations(sourceFile, 'interface', sourceFile.getInterfaces());
    this.scanDeclarations(sourceFile, 'type', sourceFile.getTypeAliases());
    this.scanDeclarations(sourceFile, 'enum', sourceFile.getEnums());

    // 扫描命名空间（模块）
    try {
      const modules = (sourceFile as any).getModules?.() || [];
      this.scanDeclarations(sourceFile, 'namespace', modules);
    } catch {
      // 如果 getModules 方法不存在，跳过命名空间扫描
    }

    // 扫描变量声明（需要特殊处理）
    sourceFile.getVariableDeclarations().forEach(varDecl => {
      const name = varDecl.getName();
      if (name && (this.options.includeInternal || this.isExported(varDecl))) {
        this.addDeclaration(name, 'variable', filePath, varDecl);
      }
    });
  }

  /**
   * 扫描特定类型的声明列表
   * @param sourceFile 源文件
   * @param type 声明类型
   * @param declarations 声明节点列表
   */
  private scanDeclarations(sourceFile: SourceFile, type: DeclarationType, declarations: any[]): void {
    const filePath = relative(process.cwd(), sourceFile.getFilePath());

    declarations.forEach(decl => {
      const name = decl.getName?.();
      // 只处理有名称且符合导出条件的声明
      if (name && (this.options.includeInternal || this.isExported(decl))) {
        this.addDeclaration(name, type, filePath, decl);
      }
    });
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
    if (this.options.ignoreTypes.includes(type)) return;
    if (this.options.ignoreNames.includes(name)) return;

    // 生成唯一键：名称+类型
    const key = `${name}:${type}`;
    const pos = node.getStart();
    const sourceFile = node.getSourceFile();
    const lineAndColumn = sourceFile.getLineAndColumnAtPos(pos);

    // 获取声明的上下文代码片段
    const context = this.getDeclarationContext(node);

    const location: DeclarationLocation = {
      file: filePath,
      line: lineAndColumn.line,
      column: lineAndColumn.column,
      context,
    };

    // 添加到映射表
    if (!this.declarations.has(key)) {
      this.declarations.set(key, []);
    }

    this.declarations.get(key)!.push(location);
  }

  /**
   * 获取声明的上下文代码片段
   * @param node AST 节点
   * @returns 代码片段字符串
   */
  private getDeclarationContext(node: any): string {
    try {
      const text = node.getText();
      const lines = text.split('\n');
      const firstLine = lines[0].trim();
      // 限制长度，避免过长的代码片段
      return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
    } catch {
      return '';
    }
  }

  /**
   * 检查声明是否被导出
   * @param node AST 节点
   * @returns 是否导出
   */
  private isExported(node: any): boolean {
    try {
      return node.hasExportKeyword?.() ||           // 直接导出
        node.getParent()?.hasExportKeyword?.() ||   // 父节点导出
        node.isDefaultExport?.() ||                 // 默认导出
        false;
    } catch {
      return false;
    }
  }

  private generateReport(): DuplicateReport {
    const duplicateGroups: DuplicateGroup[] = [];
    let totalDeclarations = 0;

    for (const [key, locations] of this.declarations.entries()) {
      totalDeclarations += locations.length;

      if (locations.length > 1) {
        const [name, type] = key.split(':');

        // 应用规则过滤
        const filteredLocations = this.applyRules(locations, type as DeclarationType);

        if (filteredLocations.length > 1) {
          duplicateGroups.push({
            name,
            type: type as DeclarationType,
            count: filteredLocations.length,
            locations: filteredLocations,
          });
        }
      }
    }

    // 按重复次数排序
    duplicateGroups.sort((a, b) => b.count - a.count);

    return {
      summary: {
        totalFiles: this.project.getSourceFiles().length,
        totalDeclarations,
        duplicateGroups: duplicateGroups.length,
        duplicateDeclarations: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
      },
      duplicates: duplicateGroups,
    };
  }

  /**
   * 应用检测规则过滤重复位置
   * @param locations 原始位置列表
   * @param type 声明类型
   * @returns 过滤后的位置列表
   */
  private applyRules(locations: DeclarationLocation[], type: DeclarationType): DeclarationLocation[] {
    let filteredLocations = [...locations];

    // 规则1: 允许同文件函数重载
    if (this.options.rules.allowSameFileOverloads && type === 'function') {
      const fileGroups = new Map<string, DeclarationLocation[]>();

      // 按文件分组
      for (const location of filteredLocations) {
        if (!fileGroups.has(location.file)) {
          fileGroups.set(location.file, []);
        }
        fileGroups.get(location.file)!.push(location);
      }

      // 每个文件只保留一个声明（认为是重载）
      filteredLocations = Array.from(fileGroups.values()).map(group => group[0]);
    }

    // 规则2: 跨模块重复检查
    if (!this.options.rules.allowCrossModuleDuplicates) {
      const files = new Set(filteredLocations.map(loc => loc.file));
      // 如果只在一个文件内重复，且不允许跨模块重复，则忽略
      if (files.size <= 1) {
        return [];
      }
    }

    // 规则3: 最大重复数量限制
    const maxDuplicates = this.options.rules.maxDuplicatesPerName;
    if (maxDuplicates && maxDuplicates > 0) {
      if (filteredLocations.length > maxDuplicates) {
        // 只保留前N个位置
        filteredLocations = filteredLocations.slice(0, maxDuplicates);
      }
    }

    return filteredLocations;
  }
}

/**
 * 检测报告格式化器
 * 支持多种输出格式：控制台、JSON、Markdown
 */
export class ReportFormatter {
  static console(report: DuplicateReport): void {
    console.log(chalk.blue('📊 检测报告\n'));

    // 显示摘要
    console.log(chalk.cyan('摘要:'));
    console.log(`  文件总数: ${report.summary.totalFiles}`);
    console.log(`  声明总数: ${report.summary.totalDeclarations}`);
    console.log(`  重复组数: ${report.summary.duplicateGroups}`);
    console.log(`  重复声明数: ${report.summary.duplicateDeclarations}\n`);

    if (report.duplicates.length === 0) {
      console.log(chalk.green('✅ 未发现重复命名！'));
      return;
    }

    console.log(chalk.red(`❌ 发现 ${report.duplicates.length} 组重复命名:\n`));

    report.duplicates.forEach((group, index) => {
      const typeColor = this.getTypeColor(group.type);
      console.log(chalk.yellow(`${index + 1}. ${typeColor(group.type)} "${group.name}" (${group.count} 次重复)`));

      group.locations.forEach((location, locIndex) => {
        const prefix = locIndex === group.locations.length - 1 ? '└─' : '├─';
        console.log(chalk.gray(`   ${prefix} ${location.file}:${location.line}:${location.column}`));

        if (location.context) {
          console.log(chalk.dim(`      ${location.context}`));
        }
      });
      console.log();
    });
  }

  static json(report: DuplicateReport): void {
    console.log(JSON.stringify(report, null, 2));
  }

  static markdown(report: DuplicateReport): void {
    console.log('# TypeScript 重复命名检测报告\n');

    console.log('## 摘要\n');
    console.log(`- 文件总数: ${report.summary.totalFiles}`);
    console.log(`- 声明总数: ${report.summary.totalDeclarations}`);
    console.log(`- 重复组数: ${report.summary.duplicateGroups}`);
    console.log(`- 重复声明数: ${report.summary.duplicateDeclarations}\n`);

    if (report.duplicates.length === 0) {
      console.log('✅ **未发现重复命名！**\n');
      return;
    }

    console.log('## 重复命名详情\n');

    report.duplicates.forEach((group, index) => {
      console.log(`### ${index + 1}. \`${group.type}\` "${group.name}" (${group.count} 次重复)\n`);

      group.locations.forEach(location => {
        console.log(`- \`${location.file}:${location.line}:${location.column}\``);
        if (location.context) {
          console.log(`  \`\`\`typescript\n  ${location.context}\n  \`\`\``);
        }
      });
      console.log();
    });
  }

  private static getTypeColor(type: string): (text: string) => string {
    const colors: Record<string, (text: string) => string> = {
      function: chalk.blue,
      class: chalk.green,
      interface: chalk.magenta,
      type: chalk.cyan,
      enum: chalk.yellow,
      variable: chalk.red,
      namespace: chalk.gray,
    };
    return colors[type] || chalk.white;
  }
}

/**
 * 配置文件加载器
 * 支持 JSON 和 JS 格式的配置文件
 */
export class ConfigLoader {
  static async load(configPath?: string): Promise<DetectorOptions> {
    const defaultConfig: DetectorOptions = {
      tsConfigPath: './tsconfig.json',
      includeInternal: false,
      excludePatterns: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
      ],
      includePatterns: ['**/*.ts', '**/*.tsx'],
      ignoreTypes: [],
    };

    if (!configPath) {
      // 尝试查找默认配置文件
      const possiblePaths = [
        '.ts-duplicate-detector.json',
        '.ts-duplicate-detector.js',
        'ts-duplicate-detector.config.json',
        'ts-duplicate-detector.config.js',
      ];

      for (const path of possiblePaths) {
        try {
          const fs = await import('fs/promises');
          await fs.access(path);
          configPath = path;
          break;
        } catch {
          // 文件不存在，继续尝试下一个
        }
      }
    }

    if (!configPath) {
      return defaultConfig;
    }

    try {
      const config = await this.loadConfigFile(configPath);
      return this.mergeConfig(defaultConfig, config);
    } catch (error) {
      console.warn(`警告: 无法加载配置文件 ${configPath}, 使用默认配置`);
      return defaultConfig;
    }
  }

  private static async loadConfigFile(configPath: string): Promise<any> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const ext = path.extname(configPath);

    if (ext === '.json') {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } else if (ext === '.js') {
      const module = await import(configPath);
      return module.default || module;
    } else {
      throw new Error(`不支持的配置文件格式: ${ext}`);
    }
  }

  private static mergeConfig(defaultConfig: DetectorOptions, userConfig: any): DetectorOptions {
    return {
      tsConfigPath: userConfig.tsConfigPath || defaultConfig.tsConfigPath,
      includeInternal: userConfig.includeInternal ?? defaultConfig.includeInternal,
      excludePatterns: userConfig.excludePatterns || defaultConfig.excludePatterns,
      includePatterns: userConfig.includePatterns || defaultConfig.includePatterns,
      ignoreTypes: userConfig.ignoreTypes || defaultConfig.ignoreTypes,
      ignoreNames: userConfig.ignoreNames || defaultConfig.ignoreNames,
      rules: {
        ...defaultConfig.rules,
        ...userConfig.rules,
      },
    };
  }
}

/**
 * CLI 主函数
 * 处理命令行参数，执行检测，输出结果
 */
async function main() {
  program
    .name('ts-duplicate-detector')
    .description('TypeScript 跨文件重复命名检测工具')
    .version('1.0.0')
    .option('-c, --config <path>', 'TypeScript 配置文件路径', './tsconfig.json')
    .option('-f, --format <format>', '输出格式 (console|json|markdown)', 'console')
    .option('--include-internal', '包含内部（非导出）声明', false)
    .option('--exclude <patterns...>', '排除文件模式', ['**/*.test.ts', '**/*.spec.ts'])
    .option('--include <patterns...>', '包含文件模式', ['**/*.ts', '**/*.tsx'])
    .option('--ignore-types <types...>', '忽略的声明类型', [])
    .option('--output <file>', '输出到文件')
    .option('--load-config <path>', '加载配置文件')
    .action(async (options) => {
      try {
        // 只在非 JSON 格式时显示启动信息
        if (options.format !== 'json') {
          console.log(chalk.blue('🔍 启动 TypeScript 重复命名检测...\n'));
        }

        // 加载配置
        let config = await ConfigLoader.load(options.loadConfig);

        // 命令行选项覆盖配置文件
        const detectorOptions: DetectorOptions = {
          tsConfigPath: options.config || config.tsConfigPath,
          includeInternal: options.includeInternal || config.includeInternal,
          excludePatterns: options.exclude.length > 0 ? options.exclude : config.excludePatterns,
          includePatterns: options.include.length > 0 ? options.include : config.includePatterns,
          ignoreTypes: options.ignoreTypes.length > 0 ? options.ignoreTypes : config.ignoreTypes,
        };

        const detector = new DuplicateDetector(detectorOptions);
        const report = await detector.detect(options.format === 'json');

        // 格式化输出
        const originalLog = console.log;
        let logs: string[] = [];

        if (options.output) {
          console.log = (...args) => logs.push(args.join(' '));
        }

        switch (options.format) {
          case 'json':
            ReportFormatter.json(report);
            break;
          case 'markdown':
            ReportFormatter.markdown(report);
            break;
          default:
            ReportFormatter.console(report);
        }

        if (options.output) {
          console.log = originalLog;
          const fs = await import('fs/promises');
          await fs.writeFile(options.output, logs.join('\n'));
          console.log(chalk.green(`✅ 报告已保存到: ${options.output}`));
        }

        // 如果发现重复，退出码为 1
        if (report.duplicates.length > 0) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('❌ 检测过程中发生错误:'));
        console.error(error);
        process.exit(1);
      }
    });

  await program.parseAsync();
}

// 运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}