/**
 * The controller every toolbar menu shares (`rendering/menu.ts`), asked directly what a card
 * only ever asks it of one menu at a time: which menus a call reaches.
 *
 * A modal menu makes the rest of the page inert, so nobody can open a second menu while the
 * first is open, and no card test can hold two open at once. The kinds are still the contract
 * the card's `willUpdate` relies on, closing the legend's menu without reaching the one the
 * action row folds its controls into and the other way round, so they are pinned here, where two
 * can be opened by hand.
 */

import { afterEach, describe, expect, it } from 'vitest';

import * as Menu from '../src/rendering/menu';

const LEGEND: Menu.MenuParts = {
  kind: 'legend',
  surface: 'legend-menu-surface',
  page: 'legend-menu-page',
};
const OVERFLOW: Menu.MenuParts = {
  kind: 'overflow',
  surface: 'custom-menu-surface',
  page: 'custom-menu-page',
};

/**
 * A menu and the button that opens it, inside a root standing in for a card's shadow root.
 *
 * @param root - Where both go
 * @param parts - Which menu it is
 * @returns The button and its menu
 */
function addMenu(root: HTMLElement, parts: Menu.MenuParts) {
  const opener = document.createElement('button');
  const dialog = document.createElement('dialog');
  opener.addEventListener('click', (ev) => Menu.pressMenuButton(ev, dialog, false, parts));
  root.append(opener, dialog);
  return { opener, dialog };
}

/** Lets a dialog's close event arrive, which is where a menu finishes closing. */
const closeEvents = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(async () => {
  Menu.closeMenus(document.body);
  await closeEvents();
  document.body.innerHTML = '';
});

describe('the menus a card holds', () => {
  it('closes the menus of one kind without reaching the other, and every menu without one', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const legend = addMenu(root, LEGEND);
    const overflow = addMenu(root, OVERFLOW);
    const open = () => [legend.dialog.open, overflow.dialog.open];
    const held = () => [Menu.hasOpenMenu(root, 'legend'), Menu.hasOpenMenu(root, 'overflow')];

    legend.opener.click();
    overflow.opener.click();
    expect(open()).toEqual([true, true]);
    expect(held()).toEqual([true, true]);

    Menu.closeMenus(root, 'legend');
    await closeEvents();
    expect(open()).toEqual([false, true]);
    expect(held()).toEqual([false, true]);

    legend.opener.click();
    Menu.closeMenus(root, 'overflow');
    await closeEvents();
    expect(open()).toEqual([true, false]);
    expect(held()).toEqual([true, false]);

    overflow.opener.click();
    Menu.closeMenus(root);
    await closeEvents();
    expect(open()).toEqual([false, false]);
    expect(Menu.hasOpenMenu(root)).toBe(false);
  });

  it("leaves another card's menus open", async () => {
    const mine = document.createElement('div');
    const theirs = document.createElement('div');
    document.body.append(mine, theirs);
    const ours = addMenu(mine, OVERFLOW);
    const other = addMenu(theirs, OVERFLOW);

    ours.opener.click();
    other.opener.click();
    Menu.closeMenus(mine);
    await closeEvents();

    expect([ours.dialog.open, other.dialog.open]).toEqual([false, true]);
    expect([Menu.hasOpenMenu(mine), Menu.hasOpenMenu(theirs)]).toEqual([false, true]);
  });
});
