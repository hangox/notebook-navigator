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

// Pure visibility logic for the list pane "scroll to top" floating button.
// Kept dependency-free so it can be unit-tested without a DOM.

export interface ScrollTopButtonThresholds {
    // Scrolled past this offset (px): reveal the button
    show: number;
    // Scrolled back to/above this offset (px): hide the button
    hide: number;
}

export interface ScrollTopButtonVisibilityInput {
    // Current vertical scroll offset (scrollTop) in px
    offset: number;
    // The button's present visibility (returned unchanged inside the hysteresis dead zone)
    wasVisible: boolean;
    // Reveal threshold in px
    showThreshold: number;
    // Conceal threshold in px (should be < showThreshold)
    hideThreshold: number;
}

// Reveal roughly after one viewport of scrolling; hysteresis keeps the button from flickering
// when the user hovers around the threshold. The hide point sits nearer the top so the button
// only disappears once the list is scrolled back close to the beginning.
const SHOW_THRESHOLD_VIEWPORT_RATIO = 1;
const HIDE_THRESHOLD_VIEWPORT_RATIO = 0.5;
// Floor for very short panes so the button never appears after a tiny scroll.
const MIN_SHOW_THRESHOLD_PX = 160;

/**
 * Derives the show/hide scroll offsets from the scroll container's viewport height.
 * Always returns hide < show so the hysteresis band is non-empty.
 * @param clientHeight - Visible height of the scroll container in px
 */
export function computeScrollTopButtonThresholds(clientHeight: number): ScrollTopButtonThresholds {
    const viewport = Number.isFinite(clientHeight) && clientHeight > 0 ? clientHeight : MIN_SHOW_THRESHOLD_PX;
    const show = Math.max(viewport * SHOW_THRESHOLD_VIEWPORT_RATIO, MIN_SHOW_THRESHOLD_PX);
    // Guarantee hide < show so the hysteresis band is always non-empty
    const hide = Math.min(viewport * HIDE_THRESHOLD_VIEWPORT_RATIO, show - 1);
    return { show, hide };
}

/**
 * Decides whether the floating scroll-to-top button should be visible using a hysteresis state machine.
 * - offset >= showThreshold        → true (reveal)
 * - offset <= hideThreshold        → false (conceal)
 * - hideThreshold < offset < show  → wasVisible (dead zone: keep current state, no flicker)
 *
 * Defensive: a non-finite or non-positive offset (uninitialized virtualizer, iOS rubber-band overscroll,
 * offset exactly at the top) always resolves to false. A degenerate configuration where hideThreshold is
 * non-finite or >= showThreshold collapses to a single threshold at showThreshold (no dead zone), so the
 * result stays well-defined rather than undefined behavior.
 */
export function shouldShowScrollTopButton({ offset, wasVisible, showThreshold, hideThreshold }: ScrollTopButtonVisibilityInput): boolean {
    // Non-finite / non-positive offset → hidden (covers NaN, ±Infinity, 0 and negative overscroll)
    if (!Number.isFinite(offset) || offset <= 0) {
        return false;
    }

    // Without a valid reveal threshold there is nothing meaningful to show
    if (!Number.isFinite(showThreshold)) {
        return false;
    }

    // Collapse an inverted/invalid hysteresis band to a single threshold at showThreshold
    const effectiveHide = Number.isFinite(hideThreshold) && hideThreshold < showThreshold ? hideThreshold : showThreshold;

    if (offset >= showThreshold) {
        return true;
    }
    if (offset <= effectiveHide) {
        return false;
    }
    return wasVisible;
}
