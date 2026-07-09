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

import { describe, expect, it } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { selectionReducer } from '../../src/context/selection/state';
import type { SelectionState } from '../../src/context/selection/types';

function createFolder(path: string): TFolder {
    const folder = new TFolder();
    folder.path = path;
    folder.name = path === '/' ? '/' : (path.split('/').pop() ?? path);
    folder.parent = null;
    folder.children = [];
    return folder;
}

function createFile(path: string, parent: TFolder): TFile {
    const file = new TFile();
    const fileName = path.split('/').pop() ?? path;
    const extensionIndex = fileName.lastIndexOf('.');
    file.path = path;
    file.name = fileName;
    file.basename = extensionIndex === -1 ? fileName : fileName.slice(0, extensionIndex);
    file.extension = extensionIndex === -1 ? '' : fileName.slice(extensionIndex + 1);
    file.parent = parent;
    file.stat = { ctime: 0, mtime: 0, size: 0 };
    return file;
}

function createSelectionState(rootFolder: TFolder, listScrollToTopSignal = 0): SelectionState {
    return {
        selectionType: 'folder',
        selectedFolder: rootFolder,
        selectedTag: null,
        selectedProperty: null,
        selectedFiles: new Set<string>(),
        anchorIndex: null,
        lastMovementDirection: null,
        isRevealOperation: false,
        isFolderChangeWithAutoSelect: false,
        isKeyboardNavigation: false,
        isFolderNavigation: false,
        selectedFile: null,
        revealSource: null,
        navigationHistory: [
            {
                type: 'folder',
                value: rootFolder.path
            }
        ],
        navigationHistoryIndex: 0,
        listScrollToTopSignal
    };
}

describe('selectionReducer list scroll-to-top signal', () => {
    it('increments the scroll-to-top signal monotonically on each REQUEST_LIST_SCROLL_TOP', () => {
        const root = createFolder('/');
        const initialState = createSelectionState(root);

        expect(initialState.listScrollToTopSignal).toBe(0);

        const firstBump = selectionReducer(initialState, { type: 'REQUEST_LIST_SCROLL_TOP' });
        expect(firstBump.listScrollToTopSignal).toBe(1);

        const secondBump = selectionReducer(firstBump, { type: 'REQUEST_LIST_SCROLL_TOP' });
        expect(secondBump.listScrollToTopSignal).toBe(2);
    });

    it('preserves an existing scroll-to-top signal across unrelated navigation actions', () => {
        const root = createFolder('/');
        const alpha = createFolder('Alpha');
        const file = createFile('Alpha/note.md', alpha);
        const initialState = createSelectionState(root, 5);

        const folderState = selectionReducer(initialState, { type: 'SET_SELECTED_FOLDER', folder: alpha });
        expect(folderState.listScrollToTopSignal).toBe(5);

        const fileState = selectionReducer(folderState, { type: 'SET_SELECTED_FILE', file });
        expect(fileState.listScrollToTopSignal).toBe(5);

        const tagState = selectionReducer(fileState, { type: 'SET_SELECTED_TAG', tag: 'work/projects' });
        expect(tagState.listScrollToTopSignal).toBe(5);
    });

    it('does not mutate the source state when bumping the signal', () => {
        const root = createFolder('/');
        const initialState = createSelectionState(root, 3);

        const nextState = selectionReducer(initialState, { type: 'REQUEST_LIST_SCROLL_TOP' });

        expect(initialState.listScrollToTopSignal).toBe(3);
        expect(nextState).not.toBe(initialState);
        expect(nextState.listScrollToTopSignal).toBe(4);
    });
});
