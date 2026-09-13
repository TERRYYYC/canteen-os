import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setup } from './team-meals-pages-guard-harness.mjs';

test('untouched new Dish stays clear across language and return, without a leave confirmation', async () => {
  const s = await setup();
  try {
    let confirms = 0;
    window.confirm = () => { confirms++; return false; };
    for (const lang of ['zh', 'en', 'uk']) {
      await s.mount('dish', lang, 'new');
      assert.equal(s.m.inspectDishOwner().draft.dirty, false);
      assert.equal(s.m.inspectReloadSafety().reason, 'clear');
      assert.equal(s.unload(), false);
      assert.equal(s.el.querySelector('.adm-dish-save-draft').disabled, false, 'first save can still validate the empty form');
      s.el.querySelector('.adm-topbar-back').click();
      assert.equal(confirms, 0);
      assert.equal(location.hash, '#/admin');
      s.home();
    }
    assert.equal(s.counts.writes, 0);
  } finally { s.cleanup(); }
});

for (const [selector, value] of [['#adm-dish-name-zh', '新汤'], ['#adm-dish-id', 'new-soup'], ['#adm-dish-baseServings', '13.7']]) {
  test(`first raw edit ${selector} is protected immediately and survives language/return`, async () => {
    const s = await setup();
    try {
      await s.mount('dish', 'zh', 'new');
      s.input(selector, value);
      assert.equal(s.m.inspectDishOwner().draft.dirty, true);
      assert.equal(s.m.inspectReloadSafety().reason, 'dirty');
      assert.equal(s.unload(), true);
      let confirms = 0;
      window.confirm = () => { confirms++; return false; };
      s.el.querySelector('.adm-topbar-back').click();
      assert.equal(confirms, 1);
      assert.equal(location.hash, '#/admin/dish/new');
      s.home();
      await s.mount('dish', 'uk', 'new');
      assert.equal(s.el.querySelector(selector).value, value);
      assert.equal(s.m.inspectReloadSafety().reason, 'dirty');
      assert.equal(s.counts.writes, 0);
    } finally { s.cleanup(); }
  });
}

test('untouched new Dish does not inherit the previously saved document source or success', async () => {
  const s = await setup();
  try {
    await s.mount('dish');
    s.input('#adm-dish-name-zh', '已保存的汤');
    s.el.querySelector('.adm-dish-save-draft').click();
    await s.flush();
    assert.equal(s.counts.writes, 1);
    assert.match(s.el.querySelector('.adm-dish-edit-state').textContent, /Saved · not published/);
    await s.mount('dish', 'en', 'new');
    assert.equal(s.m.inspectReloadSafety().reason, 'clear');
    assert.equal(s.el.querySelector('#adm-dish-id').readOnly, false);
    assert.equal(s.el.querySelector('.adm-dish-edit-state').querySelector('code'), null);
    assert.doesNotMatch(s.el.querySelector('.adm-dish-edit-state').textContent, /Saved|unpublished/);
    s.input('#adm-dish-name-zh', '第二道新菜');
    s.input('#adm-dish-id', 'second-new');
    s.el.querySelector('.adm-dish-save-draft').click();
    await s.flush();
    assert.equal(s.counts.writes, 2);
    assert.match(s.el.querySelector('.adm-dish-edit-state').textContent, /Saved · not published/);
  } finally { s.cleanup(); }
});

test('first photo action on blank Dish is protected before loading and retains its decoded raw on return', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Image'), images = [];
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
    naturalWidth = 2; naturalHeight = 2;
    set src(value) { images.push(this); }
  } });
  const s = await setup(), gate = s.holdModule('image');
  try {
    await s.mount('dish', 'en', 'new');
    const file = new Blob(['local photo'], { type: 'image/png' });
    const picker = s.el.querySelector('#adm-dish-photo-pick');
    assert.equal(picker.disabled, false);
    picker.files = [file]; picker.dispatchEvent({ type: 'change' });
    assert.equal(s.m.inspectReloadSafety().reason, 'saving', 'original read ticket protects before the first await');
    s.home();
    gate.resolve(); await s.flush();
    assert.equal(images.length, 1);
    images[0].onload(); await s.flush();
    assert.equal(s.m.inspectReloadSafety().reason, 'dirty', 'decoded detached photo has a raw owner');
    await s.mount('dish', 'uk', 'new');
    assert.equal(s.m.inspectDishOwner().draft.pending.blob, file);
    assert.equal(s.m.inspectDishOwner().session.getState().phase, 'dirty');
    assert.equal(s.unload(), true);
    assert.equal(s.counts.writes, 0);
  } finally {
    gate.resolve(); await s.flush(); s.cleanup();
    if (previous) Object.defineProperty(globalThis, 'Image', previous); else delete globalThis.Image;
  }
});

test('first name translation retains C1 input through optional loading and language change', async () => {
  const s = await setup(), gate = s.holdModule('legacy');
  try {
    await s.mount('dish', 'en', 'new');
    s.input('#adm-dish-name-zh', '要翻译的新汤');
    assert.equal(s.m.inspectDishOwner().session.getState().phase, 'dirty');
    s.legacy.translate = async () => ({ en: 'Translated soup', uk: 'Перекладений суп' });
    s.el.querySelector('.adm-dish-translate').click();
    assert.equal(s.m.inspectReloadSafety().reason, 'saving');
    await s.mount('dish', 'uk', 'new');
    gate.resolve(); await s.flush();
    assert.equal(s.el.querySelector('#adm-dish-name-en').value, 'Translated soup');
    assert.equal(s.m.inspectReloadSafety().reason, 'dirty');
    assert.equal(s.counts.writes, 0);
  } finally { gate.resolve(); await s.flush(); s.cleanup(); }
});

test('pending or unknown existing Dish stays protected while a blank new form is untouched', async () => {
  const s = await setup(), gate = s.holdWrite();
  try {
    await s.mount('dish');
    s.input('#adm-dish-name-zh', '等待保存的汤');
    s.el.querySelector('.adm-dish-save-draft').click(); await s.flush();
    assert.equal(s.counts.writes, 1);
    await s.mount('dish', 'en', 'new');
    assert.equal(s.m.inspectDishOwner().draft.dirty, false);
    assert.equal(s.m.inspectReloadSafety().reason, 'saving');
    gate.reject(new TypeError('Original response lost')); await s.flush();
    assert.equal(s.m.inspectReloadSafety().reason, 'unknown');
    assert.equal(s.unload(), true);
    await s.mount('dish', 'uk', 'soup');
    assert.equal(s.m.inspectDishOwner().session.getState().phase, 'outcome-unknown');
    assert.equal(s.el.querySelector('#adm-dish-name-zh').value, '等待保存的汤');
    s.el.querySelector('.adm-dish-save-draft').click(); await s.flush();
    assert.equal(s.counts.writes, 1, 'return cannot resend an unresolved save');
  } finally { s.cleanup(); }
});

test('new Dish optional servings are separate from factual missing ingredients and steps in all languages', async () => {
  const s = await setup();
  try {
    for (const [lang, optional, ingredients, steps, servings] of [
      ['zh', /可不填/, /还没有配料/, /还没有步骤/, /还没写按几份/],
      ['en', /Optional/, /No ingredients yet/, /No steps yet/, /Servings not set/],
      ['uk', /Необов’язково/, /Ще немає інгредієнтів/, /Ще немає кроків/, /Не вказано, на скільки порцій/],
    ]) {
      await s.mount('dish', lang, 'new');
      assert.equal(s.el.querySelector('#adm-dish-baseServings').value, '');
      assert.match(s.el.textContent, optional);
      const missing = s.el.querySelector('.adm-dish-missing').textContent;
      assert.match(missing, ingredients);
      assert.match(missing, steps);
      assert.doesNotMatch(missing, servings);
    }
  } finally { s.cleanup(); }
});

test('Ingredient unavailable video action uses user-facing copy and preserves manual input', async () => {
  const s = await setup();
  try {
    for (const [lang, label, hint] of [
      ['zh', /视频截图暂不可用/, /选一张/],
      ['en', /Video capture unavailable/, /Choose a file/],
      ['uk', /Кадри з відео недоступні/, /Вибрати файл/],
    ]) {
      await s.mount('ingredient', lang, 'new');
      s.input('#adm-ing-name-zh', '保留手动食材');
      const video = s.el.querySelectorAll('button').find(button => label.test(button.textContent));
      assert.ok(video, 'unavailable action has an accurate label');
      assert.equal(video.getAttribute('aria-disabled'), 'true');
      video.click();
      assert.match(s.el.textContent, hint);
      assert.doesNotMatch(s.el.textContent, /第二轮|2-й етап|round 2|Terry|命令行|command line/);
      assert.equal(s.el.querySelector('#adm-ing-name-zh').value, '保留手动食材');
      assert.equal(s.counts.writes, 0);
    }
  } finally { s.cleanup(); }
});
