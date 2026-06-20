'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'index.html'),
    'utf8'
);

describe('frontend/index.html', () => {
    it('loads shared login scripts from /js/', () => {
        assert.match(indexHtml, /<script src="\/js\/loginLogic\.js"><\/script>/);
        assert.match(indexHtml, /<script src="\/js\/loginPage\.js"><\/script>/);
    });

    it('does not inline login logic in the page', () => {
        assert.doesNotMatch(indexHtml, /function getGreetingPeriod/);
        assert.doesNotMatch(indexHtml, /async function login\(/);
    });

    it('keeps required login form elements', () => {
        for (const id of [
            'loginTitle',
            'loginNotice',
            'username',
            'password',
            'passwordConfirmRow',
            'passwordConfirm',
            'rememberMe',
            'submitBtn',
        ]) {
            assert.match(indexHtml, new RegExp(`id="${id}"`));
        }
    });
});
