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
import {
    computeScrollTopButtonThresholds,
    computeScrollTopGlidePlan,
    shouldShowScrollTopButton
} from '../../src/utils/scrollTopButton';

// Fixed thresholds keep the hysteresis boundaries explicit and independent of viewport math
const SHOW = 400;
const HIDE = 200;

function visible(offset: number, wasVisible: boolean, showThreshold = SHOW, hideThreshold = HIDE): boolean {
    return shouldShowScrollTopButton({ offset, wasVisible, showThreshold, hideThreshold });
}

describe('shouldShowScrollTopButton', () => {
    // V1 — reveal threshold boundary (>= is inclusive)
    it('reveals at or past the show threshold when starting hidden', () => {
        expect(visible(SHOW - 1, false)).toBe(false);
        expect(visible(SHOW, false)).toBe(true);
        expect(visible(SHOW + 1, false)).toBe(true);
    });

    // V2 — conceal threshold boundary (<= is inclusive)
    it('conceals at or below the hide threshold when starting visible', () => {
        expect(visible(HIDE + 1, true)).toBe(true);
        expect(visible(HIDE, true)).toBe(false);
        expect(visible(HIDE - 1, true)).toBe(false);
    });

    // V3 — dead zone only preserves the current state, it never flips
    it('keeps the current state inside the hysteresis dead zone', () => {
        const deadZoneOffset = 300; // between HIDE (200) and SHOW (400)
        expect(visible(deadZoneOffset, false)).toBe(false);
        expect(visible(deadZoneOffset, true)).toBe(true);
    });

    // V4 — full round trip; micro-jitter inside the dead zone must not flicker
    it('follows a complete scroll round trip without flicker', () => {
        let state = false;
        state = visible(0, state);
        expect(state).toBe(false); // at top
        state = visible(SHOW, state);
        expect(state).toBe(true); // scrolled past show → reveal
        state = visible(300, state);
        expect(state).toBe(true); // dead zone → stays visible
        state = visible(HIDE, state);
        expect(state).toBe(false); // back to hide threshold → conceal
        state = visible(300, state);
        expect(state).toBe(false); // dead zone → stays hidden
        state = visible(SHOW, state);
        expect(state).toBe(true); // scrolled down again → reveal
    });

    // V5 — defensive handling of pathological offsets
    it('treats non-finite and non-positive offsets as hidden', () => {
        expect(visible(0, false)).toBe(false);
        expect(visible(0, true)).toBe(false); // exactly at top → hidden regardless of previous state
        expect(visible(-50, true)).toBe(false); // iOS rubber-band overscroll
        expect(visible(Number.MAX_SAFE_INTEGER, false)).toBe(true);
        expect(visible(Number.NaN, true)).toBe(false);
        expect(visible(Number.POSITIVE_INFINITY, false)).toBe(false);
        expect(visible(Number.NEGATIVE_INFINITY, true)).toBe(false);
    });

    // V6 — degenerate configuration collapses to a single threshold (no undefined behavior)
    it('collapses an inverted hysteresis band to a single threshold at show', () => {
        // hide (300) >= show (200): dead zone is invalid, so behavior is a hard cutoff at show
        expect(visible(250, false, 200, 300)).toBe(true);
        expect(visible(150, true, 200, 300)).toBe(false);
        expect(visible(200, false, 200, 300)).toBe(true); // boundary inclusive
        // A non-finite hide threshold degrades the same way
        expect(visible(250, false, 200, Number.NaN)).toBe(true);
        expect(visible(150, true, 200, Number.NaN)).toBe(false);
    });

    it('hides when the show threshold itself is not finite', () => {
        expect(visible(1000, true, Number.NaN, 200)).toBe(false);
    });
});

describe('computeScrollTopButtonThresholds', () => {
    it('derives half-viewport show and quarter-viewport hide with hide always below show', () => {
        const { show, hide } = computeScrollTopButtonThresholds(1000);
        expect(show).toBe(500); // 0.5 x viewport
        expect(hide).toBe(250); // 0.25 x viewport
        expect(hide).toBeLessThan(show);
    });

    it('applies the minimum show floor for short panes', () => {
        const { show, hide } = computeScrollTopButtonThresholds(100);
        expect(show).toBe(80); // floored at MIN_SHOW_THRESHOLD_PX (0.5 x 100 = 50 < 80)
        expect(hide).toBeLessThan(show);
    });

    it('falls back to a sane band for zero or non-finite heights', () => {
        for (const clientHeight of [0, Number.NaN, Number.POSITIVE_INFINITY, -10]) {
            const { show, hide } = computeScrollTopButtonThresholds(clientHeight);
            expect(show).toBe(80);
            expect(hide).toBeLessThan(show);
        }
    });
});

describe('computeScrollTopGlidePlan', () => {
    const CLIENT_HEIGHT = 1000; // far threshold = 2000, glide start = 1250

    // Near distance (<= 2 viewports): glide directly, no teleport
    it('returns an empty plan when scrolled within two viewports', () => {
        expect(computeScrollTopGlidePlan(0, CLIENT_HEIGHT)).toEqual({});
        expect(computeScrollTopGlidePlan(1500, CLIENT_HEIGHT)).toEqual({});
        expect(computeScrollTopGlidePlan(2000, CLIENT_HEIGHT)).toEqual({}); // boundary is inclusive of "near"
    });

    // Far distance (> 2 viewports): teleport to ~1.25 viewports, then glide
    it('teleports to between one and 1.5 viewports for far scrolls', () => {
        for (const offset of [2001, 5000, 50000, Number.MAX_SAFE_INTEGER]) {
            const plan = computeScrollTopGlidePlan(offset, CLIENT_HEIGHT);
            expect(plan.immediateTop).toBeDefined();
            const top = plan.immediateTop as number;
            expect(top).toBeGreaterThanOrEqual(CLIENT_HEIGHT); // >= 1 viewport
            expect(top).toBeLessThanOrEqual(CLIENT_HEIGHT * 1.5); // <= 1.5 viewports
            expect(top).toBeLessThan(offset); // always moves upward
        }
        expect(computeScrollTopGlidePlan(2001, CLIENT_HEIGHT).immediateTop).toBe(1250);
    });

    // Pathological viewport sizes degrade to a plain direct glide (no teleport)
    it('degrades safely for zero, negative, or non-finite viewport heights', () => {
        for (const clientHeight of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(computeScrollTopGlidePlan(999999, clientHeight)).toEqual({});
        }
    });

    // A non-finite offset also degrades safely
    it('degrades safely for non-finite offsets', () => {
        expect(computeScrollTopGlidePlan(Number.NaN, CLIENT_HEIGHT)).toEqual({});
        expect(computeScrollTopGlidePlan(Number.POSITIVE_INFINITY, CLIENT_HEIGHT)).toEqual({});
    });
});
