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

import { memo } from 'react';
import { ServiceIcon } from '../ServiceIcon';

// Hardcoded label: this fork feature does not add the string to the 21 locale files (see plan).
// Kept as a constant so it is trivial to route through the i18n layer later if upstreamed.
const SCROLL_TO_TOP_LABEL = 'Scroll to top';

interface ListScrollToTopButtonProps {
    /** Whether the button is currently revealed */
    visible: boolean;
    /** Scrolls the list pane back to the top */
    onClick: () => void;
}

/**
 * Floating button anchored to the bottom-inline-end of the list pane. Fades in once the list is
 * scrolled down past the threshold and scrolls smoothly back to the top when clicked. Stays mounted
 * across visibility changes so the opacity transition plays in both directions; visibility (and its
 * removal from the tab order / pointer targets) is driven purely by the CSS `nn-visible` modifier.
 */
export const ListScrollToTopButton = memo(function ListScrollToTopButton({ visible, onClick }: ListScrollToTopButtonProps) {
    return (
        <button
            type="button"
            className={`nn-list-scroll-top-button${visible ? ' nn-visible' : ''}`}
            aria-label={SCROLL_TO_TOP_LABEL}
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            onClick={onClick}
        >
            <ServiceIcon iconId="arrow-up" aria-hidden={true} />
        </button>
    );
});
