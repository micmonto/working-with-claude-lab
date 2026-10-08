const fs = require('fs');
const { loadApp, APP_PATH, CSS_PATH } = require('./setup/loadApp');

const THEME_KEY = 'ops-dashboard.theme';

function click(document, id) {
  document.getElementById(id).dispatchEvent(new window.Event('click', { bubbles: true }));
}

function theme(document) {
  return document.documentElement.getAttribute('data-theme');
}

// jsdom keeps localStorage and the <html> attributes between the tests of a file.
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme toggle', () => {
  test('is a button in the header, outside the date range form', async () => {
    const { document } = await loadApp();
    const toggle = document.getElementById('theme-toggle');
    expect(document.getElementById('app-header').contains(toggle)).toBe(true);
    expect(document.getElementById('range-form').contains(toggle)).toBe(false);
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
  });

  test('the theme is light when nothing is stored', async () => {
    const { document, app } = await loadApp();
    expect(theme(document)).toBe('light');
    expect(app.state.theme).toBe('light');
  });

  test('clicking switches to dark and clicking again switches back', async () => {
    const { document } = await loadApp();
    click(document, 'theme-toggle');
    expect(theme(document)).toBe('dark');
    click(document, 'theme-toggle');
    expect(theme(document)).toBe('light');
  });

  test('the label names the theme a click will give', async () => {
    const { document } = await loadApp();
    const toggle = document.getElementById('theme-toggle');
    expect(toggle.textContent).toBe('Dark theme');
    click(document, 'theme-toggle');
    expect(toggle.textContent).toBe('Light theme');
    click(document, 'theme-toggle');
    expect(toggle.textContent).toBe('Dark theme');
  });

  test('the choice is saved in localStorage', async () => {
    const { document } = await loadApp();
    click(document, 'theme-toggle');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    click(document, 'theme-toggle');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });

  test('a stored dark theme is restored on load', async () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    const { document, app } = await loadApp();
    expect(theme(document)).toBe('dark');
    expect(app.state.theme).toBe('dark');
    expect(document.getElementById('theme-toggle').textContent).toBe('Light theme');
  });

  test('a stored value it does not know falls back to light', async () => {
    window.localStorage.setItem(THEME_KEY, 'purple');
    const { document } = await loadApp();
    expect(theme(document)).toBe('light');
  });

  test('toggling does not refetch or redraw the dashboard', async () => {
    const { document, api } = await loadApp();
    const callsBefore = api.calls.length;
    const firstBar = document.querySelector('#chart-on-time .bar');
    click(document, 'theme-toggle');
    expect(api.calls.length).toBe(callsBefore);
    expect(document.querySelector('#chart-on-time .bar')).toBe(firstBar);
    expect(document.querySelector('#kpi-orders .kpi-value').textContent).toBe('624');
  });

  test('still loads and toggles when storage is unavailable', async () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    };
    const { document } = await loadApp({ storage });
    expect(theme(document)).toBe('light');
    expect(document.querySelector('#kpi-orders .kpi-value').textContent).toBe('624');
    click(document, 'theme-toggle');
    expect(theme(document)).toBe('dark');
    expect(document.getElementById('status-line').textContent).toBe('');
  });
});

// jsdom does not load style.css, so the stylesheet is checked as text.
describe('theme stylesheet', () => {
  const HEX = /#[0-9a-fA-F]{3,8}\b/;
  const css = fs.readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  function block(selector) {
    const start = css.indexOf(selector + ' {');
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('}', start));
  }

  function variables(selector) {
    return (block(selector).match(/--[\w-]+(?=\s*:)/g) || []).sort();
  }

  test('every colour is declared as a CSS variable', () => {
    const offenders = css.split('\n').filter((line) => HEX.test(line) && !/^\s*--[\w-]+\s*:/.test(line));
    expect(offenders).toEqual([]);
  });

  test('the dark theme redefines every variable of the light theme', () => {
    const light = variables(':root');
    expect(light.length).toBeGreaterThan(0);
    expect(variables('[data-theme="dark"]')).toEqual(light);
  });

  test.each(['.chart-svg .bar', '.chart-svg .bar.warn', '.chart-svg .bar-label', '.chart-svg .bar-value'])(
    '%s takes its fill from a variable',
    (selector) => {
      expect(block(selector)).toMatch(/fill:\s*var\(--[\w-]+\)/);
    }
  );

  test('app.js holds no colour of its own', () => {
    const js = fs.readFileSync(APP_PATH, 'utf8');
    expect(js).not.toMatch(/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/);
    expect(js).not.toMatch(/\brgba?\(|\bhsla?\(/);
  });
});
