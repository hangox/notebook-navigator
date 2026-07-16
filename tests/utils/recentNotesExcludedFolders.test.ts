/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// 「最近内容独立排除文件夹」功能的单元测试。
// 覆盖并集逻辑、Recent 与导航面板 matcher 的行为差异、去重、嵌套子目录边界、
// 旧 data.json 迁移默认值，以及设置界面文本往返稳定性。
import { describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { createFileHiddenMatcher } from '../../src/utils/exclusionUtils';
import { createVaultProfile, ensureVaultProfiles } from '../../src/utils/vaultProfiles';
import { formatCommaSeparatedList, parseCommaSeparatedList } from '../../src/utils/commaSeparatedListUtils';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { createTestTFile } from './createTestTFile';

// 与 useNavigationPaneSourceState.ts 里构造 recentNotesHiddenFolders 的表达式保持一致
function recentNotesHiddenFolders(hiddenFolders: string[], recentNotesExcludedFolders: string[]): string[] {
    return Array.from(new Set([...hiddenFolders, ...recentNotesExcludedFolders]));
}

// isFolderInExcludedFolder 依赖 file.parent 的 { path, name, parent } 链，
// 这里按路径构造一条父文件夹链挂到 TFile 上
interface FolderLike {
    path: string;
    name: string;
    parent: FolderLike | null;
}

function buildParentChain(filePath: string): FolderLike | null {
    const segments = filePath.split('/');
    segments.pop(); // 去掉文件名，只留文件夹层级
    if (segments.length === 0) {
        return null;
    }
    let parent: FolderLike | null = null;
    let accumulated = '';
    for (const segment of segments) {
        accumulated = accumulated ? `${accumulated}/${segment}` : segment;
        parent = { path: accumulated, name: segment, parent };
    }
    return parent;
}

function createFileAt(path: string): TFile {
    const file = createTestTFile(path);
    (file as unknown as { parent: FolderLike | null }).parent = buildParentChain(path);
    return file;
}

// 构造隔离掉 drawing/tag/frontmatter 逻辑、只测文件夹排除的 matcher
function createFolderMatcher(hiddenFolders: string[]): (file: TFile) => boolean {
    const app = new App();
    return createFileHiddenMatcher(
        {
            hiddenFileProperties: [],
            hiddenFolders,
            hiddenFileNames: [],
            hiddenFileTags: [],
            hideDrawingPreviewImages: false
        },
        app,
        false
    );
}

function cloneDefaultSettings(): NotebookNavigatorSettings {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as NotebookNavigatorSettings;
}

describe('recentNotesHiddenFolders 并集逻辑', () => {
    it('用例1 - 空数组回归：并集等于原 hiddenFolders，Recent 与导航判定一致', () => {
        const hiddenFolders = ['media'];
        const recentNotesExcludedFolders: string[] = [];
        const union = recentNotesHiddenFolders(hiddenFolders, recentNotesExcludedFolders);
        expect(union).toEqual(['media']);

        const recentMatcher = createFolderMatcher(union);
        const navMatcher = createFolderMatcher(hiddenFolders);

        const mediaFile = createFileAt('media/a.md');
        const wikiFile = createFileAt('wiki/b.md');

        // media 两侧都隐藏
        expect(recentMatcher(mediaFile)).toBe(true);
        expect(navMatcher(mediaFile)).toBe(true);
        // wiki 两侧都可见
        expect(recentMatcher(wikiFile)).toBe(false);
        expect(navMatcher(wikiFile)).toBe(false);
    });

    it('用例2 - 独立排除（核心）：wiki 只从 Recent 消失，导航面板仍可见', () => {
        const hiddenFolders = ['media'];
        const recentNotesExcludedFolders = ['wiki'];
        const union = recentNotesHiddenFolders(hiddenFolders, recentNotesExcludedFolders);
        expect(union).toEqual(['media', 'wiki']);

        const recentMatcher = createFolderMatcher(union);
        const navMatcher = createFolderMatcher(hiddenFolders);

        const mediaFile = createFileAt('media/a.md');
        const wikiFile = createFileAt('wiki/b.md');

        // Recent：media 与 wiki 都隐藏
        expect(recentMatcher(mediaFile)).toBe(true);
        expect(recentMatcher(wikiFile)).toBe(true);

        // 导航：media 隐藏，但 wiki 仍可见（可展开访问）
        expect(navMatcher(mediaFile)).toBe(true);
        expect(navMatcher(wikiFile)).toBe(false);
    });

    it('用例3 - 交集去重：hiddenFolders 与 recent 重复时并集去重且不抛错', () => {
        const union = recentNotesHiddenFolders(['wiki'], ['wiki']);
        expect(union).toEqual(['wiki']);
        expect(union).toHaveLength(1);

        const recentMatcher = createFolderMatcher(union);
        expect(recentMatcher(createFileAt('wiki/x.md'))).toBe(true);
    });

    it('用例4 - 嵌套子目录与前缀相似边界', () => {
        const recentMatcher = createFolderMatcher(recentNotesHiddenFolders([], ['wiki']));

        // 深层子目录应被排除
        expect(recentMatcher(createFileAt('wiki/sub/deep/note.md'))).toBe(true);
        // 前缀相似但并非 wiki 子目录，不应误伤
        expect(recentMatcher(createFileAt('wikix/note.md'))).toBe(false);
    });
});

describe('recentNotesExcludedFolders 默认值与迁移', () => {
    it('用例5 - 旧 data.json 缺字段：ensureVaultProfiles 归一化为 []，不清空 hiddenFolders', () => {
        const settings = cloneDefaultSettings();
        const [baseProfile] = settings.vaultProfiles;
        // 模拟旧数据：完全没有 recentNotesExcludedFolders 字段
        const legacyProfile: Record<string, unknown> = { ...baseProfile, hiddenFolders: ['media'] };
        delete legacyProfile.recentNotesExcludedFolders;
        settings.vaultProfiles = [legacyProfile as unknown as (typeof settings.vaultProfiles)[number]];
        settings.vaultProfile = baseProfile.id;

        ensureVaultProfiles(settings);

        const profile = settings.vaultProfiles[0];
        expect(profile.recentNotesExcludedFolders).toEqual([]);
        expect(profile.hiddenFolders).toEqual(['media']);
    });

    it('用例5b - createVaultProfile 未传该字段时默认 []', () => {
        const profile = createVaultProfile('x', { hiddenFolders: ['media'] });
        expect(profile.recentNotesExcludedFolders).toEqual([]);
        expect(profile.hiddenFolders).toEqual(['media']);
    });
});

describe('设置界面文本往返（parse/format + Set 去重）', () => {
    it('用例6 - 解析去重与格式化往返稳定', () => {
        // 模拟 DisplayFiltersTab 保存逻辑：parse 后 Set 去重
        const saved = Array.from(new Set(parseCommaSeparatedList('wiki, media, wiki')));
        expect(saved).toEqual(['wiki', 'media']);

        // 读回展示
        const displayed = formatCommaSeparatedList(saved);
        expect(displayed).toBe('wiki, media');

        // 再次往返保持稳定
        const roundTrip = Array.from(new Set(parseCommaSeparatedList(displayed)));
        expect(roundTrip).toEqual(saved);
    });
});
