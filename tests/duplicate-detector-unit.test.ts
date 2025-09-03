import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { DuplicateDetector } from '../src/index.js';

describe('TypeScript Duplicate Detector Unit Tests', () => {
  const testFixturesPath = resolve(__dirname, 'fixtures');

  it('应该检测到重复的函数名', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/duplicate-functions*.ts`],
      excludePatterns: [],
    });

    const report = await detector.detect();

    expect(report.duplicates).toBeDefined();
    expect(report.duplicates.length).toBeGreaterThan(0);

    const calculateTotalDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'calculateTotal' && dup.type === 'function'
    );

    expect(calculateTotalDuplicate).toBeDefined();
    expect(calculateTotalDuplicate?.count).toBe(2);
    expect(calculateTotalDuplicate?.locations).toHaveLength(2);
  });

  it('应该检测到重复的类名', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/duplicate-classes*.ts`],
      excludePatterns: [],
    });

    const report = await detector.detect();

    const userServiceDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'UserService' && dup.type === 'class'
    );

    expect(userServiceDuplicate).toBeDefined();
    expect(userServiceDuplicate?.count).toBe(2);
  });

  it('应该检测到重复的接口名', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/duplicate-classes*.ts`],
      excludePatterns: [],
    });

    const report = await detector.detect();

    const userInterfaceDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'User' && dup.type === 'interface'
    );

    expect(userInterfaceDuplicate).toBeDefined();
    expect(userInterfaceDuplicate?.count).toBe(2);
  });

  it('应该检测到重复的类型别名', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/duplicate-types*.ts`],
      excludePatterns: [],
    });

    const report = await detector.detect();

    const apiResponseDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'ApiResponse' && dup.type === 'type'
    );

    expect(apiResponseDuplicate).toBeDefined();
    expect(apiResponseDuplicate?.count).toBe(2);
  });

  it('应该检测到重复的枚举', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/duplicate-types*.ts`],
      excludePatterns: [],
    });

    const report = await detector.detect();

    const priorityEnumDuplicate = report.duplicates.find(
      (dup: any) => dup.name === 'Priority' && dup.type === 'enum'
    );

    expect(priorityEnumDuplicate).toBeDefined();
    expect(priorityEnumDuplicate?.count).toBe(2);
  });

  it('对于没有重复的文件应该返回空结果', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/no-duplicates.ts`],
      excludePatterns: [],
    });

    const report = await detector.detect();

    expect(report.duplicates).toHaveLength(0);
    expect(report.summary.duplicateGroups).toBe(0);
  });

  it('应该支持忽略特定类型', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/duplicate-functions*.ts`],
      excludePatterns: [],
      ignoreTypes: ['function'],
    });

    const report = await detector.detect();

    const functionDuplicates = report.duplicates.filter(
      (dup: any) => dup.type === 'function'
    );

    expect(functionDuplicates).toHaveLength(0);
  });

  it('应该包含正确的统计信息', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/*.ts`],
      excludePatterns: [],
    });

    const report = await detector.detect();

    expect(report.summary).toBeDefined();
    expect(report.summary.totalFiles).toBeGreaterThan(0);
    expect(report.summary.totalDeclarations).toBeGreaterThan(0);
    expect(report.summary.duplicateGroups).toBeGreaterThanOrEqual(0);
    expect(report.summary.duplicateDeclarations).toBeGreaterThanOrEqual(0);
  });

  it('应该包含上下文信息', async () => {
    const detector = new DuplicateDetector({
      includePatterns: [`${testFixturesPath}/duplicate-functions*.ts`],
      excludePatterns: [],
    });

    const report = await detector.detect();

    if (report.duplicates.length > 0) {
      const firstDuplicate = report.duplicates[0];
      expect(firstDuplicate.locations[0].context).toBeDefined();
      expect(firstDuplicate.locations[0].context).toBeTruthy();
    }
  });
});