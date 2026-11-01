'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const readCss = (name) => fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'public', 'css', name),
    'utf8'
);

describe('hidden scrollbars', () => {
    for (const name of ['shell.css', 'login.css', 'editor.css']) {
        it(`${name} hides scrollbars without disabling scroll`, () => {
            const css = readCss(name);
            assert.match(css, /scrollbar-width:\s*none/);
            assert.match(css, /-ms-overflow-style:\s*none/);
            assert.match(css, /::-webkit-scrollbar/);
            assert.doesNotMatch(css, /overflow:\s*hidden\s*!important/);
        });
    }

    it('SPA globals include a hidden-scrollbar utility', () => {
        const css = fs.readFileSync(
            path.join(__dirname, '..', 'frontend-app', 'src', 'styles', 'globals.css'),
            'utf8'
        );
        assert.match(css, /\.ns-scroll/);
        assert.match(css, /scrollbar-width:\s*none/);
    });
});
