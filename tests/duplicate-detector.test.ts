import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'path';
import { execSync } from 'child_process';

describe('TypeScript Duplicate Detector', () => {
  const testFixturesPath = resolve(__dirname, 'fixtures');
  
  beforeEach(() => {
    // 确保测试环境干净
  });

  it('应该检测到重复的函数名', async () => {
    try {
      execSync(
        `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/duplicate-functions*.ts"`,
        { encoding: 'utf-8', cwd: process.cwd() }
      );
    } catch (error: any) {
      // 命令因为发现重复而失败，但输出仍然有效
      const result = error.stdout;
      const report = JSON.parse(result);
      
      expect(report.duplicates).toBeDefined();
      expect(report.duplicates.length).toBeGreaterThan(0);
      
      // 检查是否找到了 calculateTotal 函数的重复
      const calculateTotalDuplicate = report.duplicates.find(
        (dup: any) => dup.name === 'calculateTotal' && dup.type === 'function'
      );
      
      expect(calculateTotalDuplicate).toBeDefined();
      expect(calculateTotalDuplicate.count).toBe(2);
      expect(calculateTotalDuplicate.locations).toHaveLength(2);
    }
  });

  it('应该检测到重复的类名', async () => {
    const result = execSync(
      `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/duplicate-classes*.ts"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const report = JSON.parse(result);
    
    // 检查是否找到了 UserService 类的重复
    const userServiceDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'UserService' && dup.type === 'class'
    );
    
    expect(userServiceDuplicate).toBeDefined();
    expect(userServiceDuplicate.count).toBe(2);
  });

  it('应该检测到重复的接口名', async () => {
    const result = execSync(
      `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/duplicate-classes*.ts"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const report = JSON.parse(result);
    
    // 检查是否找到了 User 接口的重复
    const userInterfaceDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'User' && dup.type === 'interface'
    );
    
    expect(userInterfaceDuplicate).toBeDefined();
    expect(userInterfaceDuplicate.count).toBe(2);
  });

  it('应该检测到重复的类型别名', async () => {
    const result = execSync(
      `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/duplicate-types*.ts"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const report = JSON.parse(result);
    
    // 检查是否找到了 ApiResponse 类型的重复
    const apiResponseDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'ApiResponse' && dup.type === 'type'
    );
    
    expect(apiResponseDuplicate).toBeDefined();
    expect(apiResponseDuplicate.count).toBe(2);
  });

  it('应该检测到重复的枚举', async () => {
    const result = execSync(
      `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/duplicate-types*.ts"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const report = JSON.parse(result);
    
    // 检查是否找到了 Priority 枚举的重复
    const priorityEnumDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'Priority' && dup.type === 'enum'
    );
    
    expect(priorityEnumDuplicate).toBeDefined();
    expect(priorityEnumDuplicate.count).toBe(2);
  });

  it('对于没有重复的文件应该返回空结果', async () => {
    const result = execSync(
      `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/no-duplicates.ts"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const report = JSON.parse(result);
    
    expect(report.duplicates).toHaveLength(0);
    expect(report.summary.duplicateGroups).toBe(0);
  });

  it('应该支持忽略特定类型', async () => {
    const result = execSync(
      `pnpm exec tsx src/index.ts --format json --ignore-types function --include "${testFixturesPath}/duplicate-functions*.ts"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const report = JSON.parse(result);
    
    // 应该没有函数类型的重复
    const functionDuplicates = report.duplicates.filter(
      (dup: any) => dup.type === 'function'
    );
    
    expect(functionDuplicates).toHaveLength(0);
  });

  it('应该包含正确的统计信息', async () => {
    const result = execSync(
      `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/*.ts"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const report = JSON.parse(result);
    
    expect(report.summary).toBeDefined();
    expect(report.summary.totalFiles).toBeGreaterThan(0);
    expect(report.summary.totalDeclarations).toBeGreaterThan(0);
    expect(report.summary.duplicateGroups).toBeGreaterThanOrEqual(0);
    expect(report.summary.duplicateDeclarations).toBeGreaterThanOrEqual(0);
  });

  it('应该包含上下文信息', async () => {
    const result = execSync(
      `pnpm exec tsx src/index.ts --format json --include "${testFixturesPath}/duplicate-functions*.ts"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const report = JSON.parse(result);
    
    if (report.duplicates.length > 0) {
      const firstDuplicate = report.duplicates[0];
      expect(firstDuplicate.locations[0].context).toBeDefined();
      expect(firstDuplicate.locations[0].context).toBeTruthy();
    }
  });
});