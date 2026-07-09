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
import { rankListPending, shouldEmitScrollTop } from '../../src/types/scroll';

describe('shouldEmitScrollTop', () => {
    it('does not emit on the initial mount when the signal is unchanged', () => {
        expect(shouldEmitScrollTop(0, 0)).toBe(false);
        expect(shouldEmitScrollTop(5, 5)).toBe(false);
    });

    it('emits when the signal value increments', () => {
        expect(shouldEmitScrollTop(0, 1)).toBe(true);
        expect(shouldEmitScrollTop(4, 5)).toBe(true);
    });
});

describe('rankListPending scroll-to-top coalescing risk', () => {
    // Regression guard: a bare { type: 'top' } request ranks lowest, so it would be dropped by
    // requestPendingScroll when a folder-navigation file request is already queued. The scroll-to-top
    // effect must therefore clearPending() before requesting the top scroll. This test freezes those
    // rank relationships so the assumption behind that workaround can never silently regress.
    it('ranks a plain top request below every file request', () => {
        const top = rankListPending({ type: 'top', reason: 'scroll-to-top' });

        expect(top).toBe(0);
        expect(top).toBeLessThan(rankListPending({ type: 'file', reason: 'list-structure-change' }));
        expect(top).toBeLessThan(rankListPending({ type: 'file', reason: 'visibility-change' }));
        expect(top).toBeLessThan(rankListPending({ type: 'file', reason: 'folder-navigation' }));
        expect(top).toBeLessThan(rankListPending({ type: 'file', reason: 'reveal' }));
    });

    it('gives folder-navigation file requests a higher rank than the top request that must override them', () => {
        // The exact competitor from the double-click boundary case: a selected file scroll queued by the
        // two leading onClick events. Because it outranks top, only clearPending() lets the top scroll win.
        expect(rankListPending({ type: 'file', reason: 'folder-navigation' })).toBe(3);
        expect(rankListPending(undefined)).toBe(-1);
    });
});
