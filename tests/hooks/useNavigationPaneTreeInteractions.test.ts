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

import React from 'react';
import { App, TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { ItemType } from '../../src/types';
import type { IPropertyTreeProvider } from '../../src/interfaces/IPropertyTreeProvider';
import type { PropertyTreeNode } from '../../src/types/storage';
import type { SelectionState } from '../../src/context/SelectionContext';
import {
    useNavigationPaneTreeInteractions,
    type NavigationPaneTreeInteractionsResult
} from '../../src/hooks/navigationPane/useNavigationPaneTreeInteractions';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { createTestTFile } from '../utils/createTestTFile';

function createPropertyValueNode(key: string, valuePath: string, name: string, notes: string[]): PropertyTreeNode {
    return {
        id: buildPropertyValueNodeId(key, valuePath),
        kind: 'value',
        key,
        valuePath,
        name,
        displayPath: name,
        children: new Map(),
        notesWithValue: new Set(notes)
    };
}

function createPropertyKeyNode(key: string, name: string, notes: string[], values: PropertyTreeNode[] = []): PropertyTreeNode {
    const node: PropertyTreeNode = {
        id: buildPropertyKeyNodeId(key),
        kind: 'key',
        key,
        valuePath: null,
        name,
        displayPath: name,
        children: new Map(),
        notesWithValue: new Set(notes)
    };

    values.forEach(valueNode => {
        node.children.set(valueNode.id, valueNode);
    });

    return node;
}

function createSelectionState(): SelectionState {
    return {
        selectionType: ItemType.FOLDER,
        selectedFolder: null,
        selectedTag: null,
        selectedProperty: null,
        selectedFiles: new Set(),
        anchorIndex: null,
        lastMovementDirection: null,
        isRevealOperation: false,
        isFolderChangeWithAutoSelect: false,
        isKeyboardNavigation: false,
        isFolderNavigation: false,
        selectedFile: null,
        revealSource: null,
        navigationHistory: [],
        navigationHistoryIndex: -1,
        listScrollToTopSignal: 0
    };
}

// Creates a folder that reports child folders, so double-click keeps the expand/collapse behavior
function createTestFolderWithSubfolder(app: App, path: string): TFolder {
    const folder = createTestFolder(app, path);
    const child = createTestFolder(app, `${path}/child`);
    child.parent = folder;
    (folder as TFolder & { children: unknown[] }).children.push(child);
    return folder;
}

interface TestVaultMethods {
    registerFile(file: ReturnType<typeof createTestTFile>): void;
    registerFolder(folder: TFolder): void;
}

function getTestVault(app: App): App['vault'] & TestVaultMethods {
    return app.vault as App['vault'] & TestVaultMethods;
}

function createTestFolder(app: App, path: string): TFolder {
    const folder = new TFolder(path) as TFolder & {
        children: ReturnType<typeof createTestTFile>[];
        name: string;
        parent: TFolder | null;
        vault: App['vault'];
    };
    folder.children = [];
    folder.name = path.split('/').pop() ?? path;
    folder.parent = null;
    folder.vault = app.vault;
    getTestVault(app).registerFolder(folder);
    return folder;
}

function addFolderNote(app: App, folder: TFolder, path: string): void {
    const file = createTestTFile(path) as ReturnType<typeof createTestTFile> & { parent: TFolder; vault: App['vault'] };
    file.parent = folder;
    file.vault = app.vault;
    (folder as TFolder & { children: ReturnType<typeof createTestTFile>[] }).children.push(file);
    getTestVault(app).registerFile(file);
}

describe('useNavigationPaneTreeInteractions', () => {
    it('uses the property tree provider cache for global descendant expansion', () => {
        const childNode = createPropertyValueNode('status', 'open', 'Open', ['notes/a.md']);
        const keyNode = createPropertyKeyNode('status', 'Status', ['notes/a.md'], []);
        const propertyTree = new Map<string, PropertyTreeNode>([[keyNode.key, keyNode]]);
        const collectDescendantNodeIds = vi.fn(() => new Set([childNode.id]));
        const expansionDispatch = vi.fn();

        const propertyTreeProvider: IPropertyTreeProvider = {
            hasNodes: () => true,
            addTreeUpdateListener: () => () => {},
            findNode: nodeId => (nodeId === keyNode.id ? keyNode : null),
            getKeyNode: normalizedKey => (normalizedKey === keyNode.key ? keyNode : null),
            resolveSelectionNodeId: nodeId => nodeId,
            collectDescendantNodeIds,
            collectFilePaths: () => new Set(),
            collectFilesForKeys: () => new Set()
        };

        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app: new App(),
                commandQueue: null,
                isMobile: false,
                settings: DEFAULT_SETTINGS,
                uiState: { singlePane: false },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch,
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch: vi.fn(),
                propertyTreeService: propertyTreeProvider,
                tagTree: new Map(),
                propertyTree,
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn()
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as NavigationPaneTreeInteractionsResult;

        result.handlePropertyToggleAllSiblings(keyNode);

        expect(collectDescendantNodeIds).toHaveBeenCalledWith(keyNode.id);
        expect(expansionDispatch).toHaveBeenCalledWith({
            type: 'TOGGLE_DESCENDANT_PROPERTIES',
            descendantNodeIds: [childNode.id],
            expand: true
        });
    });

    it('switches to the list pane when a right-sidebar folder note is clicked in single-pane mode', () => {
        const app = new App();
        const folder = createTestFolder(app, 'Projects');
        addFolderNote(app, folder, 'Projects/index.md');
        const uiDispatch = vi.fn();
        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app,
                commandQueue: null,
                isMobile: false,
                settings: {
                    ...DEFAULT_SETTINGS,
                    enableFolderNotes: true,
                    folderNoteName: 'index',
                    folderNoteOpenLocation: 'right-sidebar',
                    showNearestFolderNoteInSidebar: true
                },
                uiState: { singlePane: true },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch: vi.fn(),
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch,
                propertyTreeService: null,
                tagTree: new Map(),
                propertyTree: new Map(),
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn()
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as NavigationPaneTreeInteractionsResult;

        result.handleFolderNameClick(folder);

        expect(uiDispatch).toHaveBeenCalledWith({ type: 'SET_SINGLE_PANE_VIEW', view: 'files' });
        expect(uiDispatch).toHaveBeenCalledWith({ type: 'SET_FOCUSED_PANE', pane: 'files' });
    });

    it('keeps the current pane when a non-sidebar folder note is clicked in single-pane mode', () => {
        const app = new App();
        app.workspace = {
            getLeaf: vi.fn(() => null)
        } as unknown as App['workspace'];
        const folder = createTestFolder(app, 'Projects');
        addFolderNote(app, folder, 'Projects/index.md');
        const uiDispatch = vi.fn();
        let captured: NavigationPaneTreeInteractionsResult | null = null;

        function Harness() {
            captured = useNavigationPaneTreeInteractions({
                app,
                commandQueue: null,
                isMobile: false,
                settings: {
                    ...DEFAULT_SETTINGS,
                    enableFolderNotes: true,
                    folderNoteName: 'index',
                    folderNoteOpenLocation: 'current-tab',
                    showNearestFolderNoteInSidebar: true
                },
                uiState: { singlePane: true },
                expansionState: {
                    expandedFolders: new Set(),
                    expandedTags: new Set(),
                    expandedProperties: new Set(),
                    expandedVirtualFolders: new Set()
                },
                expansionDispatch: vi.fn(),
                selectionState: createSelectionState(),
                selectionDispatch: vi.fn(),
                uiDispatch,
                propertyTreeService: null,
                tagTree: new Map(),
                propertyTree: new Map(),
                tagsVirtualFolderHasChildren: false,
                setShortcutsExpanded: vi.fn(),
                setRecentNotesExpanded: vi.fn(),
                clearActiveShortcut: vi.fn(),
                openFolderNoteInRightSidebar: vi.fn(),
                onModifySearchWithTag: vi.fn(),
                onModifySearchWithProperty: vi.fn()
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as NavigationPaneTreeInteractionsResult;

        result.handleFolderNameClick(folder);

        expect(uiDispatch).not.toHaveBeenCalledWith({ type: 'SET_SINGLE_PANE_VIEW', view: 'files' });
        expect(uiDispatch).not.toHaveBeenCalledWith({ type: 'SET_FOCUSED_PANE', pane: 'files' });
    });

    describe('handleFolderDoubleClick', () => {
        // Renders the hook with the given selection state and returns the captured interactions plus the spies
        function captureInteractions(
            app: App,
            selectionState: SelectionState
        ): {
            result: NavigationPaneTreeInteractionsResult;
            selectionDispatch: ReturnType<typeof vi.fn>;
            expansionDispatch: ReturnType<typeof vi.fn>;
        } {
            const selectionDispatch = vi.fn();
            const expansionDispatch = vi.fn();
            let captured: NavigationPaneTreeInteractionsResult | null = null;

            function Harness() {
                captured = useNavigationPaneTreeInteractions({
                    app,
                    commandQueue: null,
                    isMobile: false,
                    settings: DEFAULT_SETTINGS,
                    uiState: { singlePane: false },
                    expansionState: {
                        expandedFolders: new Set(),
                        expandedTags: new Set(),
                        expandedProperties: new Set(),
                        expandedVirtualFolders: new Set()
                    },
                    expansionDispatch,
                    selectionState,
                    selectionDispatch,
                    uiDispatch: vi.fn(),
                    propertyTreeService: null,
                    tagTree: new Map(),
                    propertyTree: new Map(),
                    tagsVirtualFolderHasChildren: false,
                    setShortcutsExpanded: vi.fn(),
                    setRecentNotesExpanded: vi.fn(),
                    clearActiveShortcut: vi.fn(),
                    openFolderNoteInRightSidebar: vi.fn(),
                    onModifySearchWithTag: vi.fn(),
                    onModifySearchWithProperty: vi.fn()
                });
                return null;
            }

            renderToStaticMarkup(React.createElement(Harness));

            if (!captured) {
                throw new Error('Expected hook result');
            }

            return { result: captured, selectionDispatch, expansionDispatch };
        }

        it('requests a list scroll-to-top without toggling when the already selected folder is double-clicked', () => {
            const app = new App();
            const folder = createTestFolderWithSubfolder(app, 'Projects');
            const selectionState = { ...createSelectionState(), selectedFolder: folder };

            const { result, selectionDispatch, expansionDispatch } = captureInteractions(app, selectionState);

            // wasSelected=true: the folder was already selected before the click sequence started
            result.handleFolderDoubleClick(folder, true);

            expect(selectionDispatch).toHaveBeenCalledWith({ type: 'REQUEST_LIST_SCROLL_TOP' });
            expect(expansionDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TOGGLE_FOLDER_EXPANDED' }));
        });

        it('toggles expansion without requesting a scroll when an unselected folder with subfolders is double-clicked', () => {
            const app = new App();
            const selectedFolder = createTestFolder(app, 'Selected');
            const otherFolder = createTestFolderWithSubfolder(app, 'Other');
            const selectionState = { ...createSelectionState(), selectedFolder };

            const { result, selectionDispatch, expansionDispatch } = captureInteractions(app, selectionState);

            // wasSelected=false: a different folder was selected before this one was double-clicked
            result.handleFolderDoubleClick(otherFolder, false);

            expect(expansionDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_FOLDER_EXPANDED', folderPath: 'Other' });
            expect(selectionDispatch).not.toHaveBeenCalledWith({ type: 'REQUEST_LIST_SCROLL_TOP' });
        });

        it('does nothing when an unselected folder without subfolders is double-clicked', () => {
            const app = new App();
            const selectedFolder = createTestFolder(app, 'Selected');
            const leafFolder = createTestFolder(app, 'Leaf');
            const selectionState = { ...createSelectionState(), selectedFolder };

            const { result, selectionDispatch, expansionDispatch } = captureInteractions(app, selectionState);

            // wasSelected=false: unselected leaf folder — no scroll, and no subfolders to toggle
            result.handleFolderDoubleClick(leafFolder, false);

            expect(selectionDispatch).not.toHaveBeenCalledWith({ type: 'REQUEST_LIST_SCROLL_TOP' });
            expect(expansionDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TOGGLE_FOLDER_EXPANDED' }));
        });
    });
});
