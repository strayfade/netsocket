'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const spaIndex = fs.readFileSync(
    path.join(__dirname, '..', 'frontend-app', 'index.html'),
    'utf8'
);
const loginPage = fs.readFileSync(
    path.join(__dirname, '..', 'frontend-app', 'src', 'features', 'login', 'LoginPage.tsx'),
    'utf8'
);
const loginLogic = fs.readFileSync(
    path.join(__dirname, '..', 'frontend-app', 'src', 'lib', 'loginLogic.ts'),
    'utf8'
);
const viteConfig = fs.readFileSync(
    path.join(__dirname, '..', 'frontend-app', 'vite.config.ts'),
    'utf8'
);
const automatePage = fs.readFileSync(
    path.join(__dirname, '..', 'frontend-app', 'src', 'features', 'automate', 'AutomatePage.tsx'),
    'utf8'
);

describe('SPA login surface', () => {
    it('SPA entry mounts React and loads shell/grid CSS at runtime', () => {
        assert.match(spaIndex, /id="root"/);
        assert.match(spaIndex, /src="\/src\/main\.tsx"/);
        assert.match(spaIndex, /\/css\/shell\.css/);
        assert.match(spaIndex, /data-theme="oled"/);
    });

    it('login page uses shared loginLogic helpers', () => {
        assert.match(loginPage, /validateLoginForm/);
        assert.match(loginPage, /getLoginTitle/);
        assert.match(loginPage, /resolveRedirectTarget/);
        assert.match(loginPage, /id="username"/);
        assert.match(loginPage, /id="password"/);
        assert.match(loginPage, /rememberMe/);
        assert.match(loginLogic, /MIN_PASSWORD_LENGTH/);
        assert.match(loginLogic, /function validateLoginForm/);
    });

    it('does not inline greeting period helpers in the SPA index shell', () => {
        assert.doesNotMatch(spaIndex, /function getGreetingPeriod/);
        assert.doesNotMatch(spaIndex, /async function login\(/);
    });
});

describe('SPA nodegraph surface', () => {
    it('loads the Roboto webfont LiteGraph paints node text with', () => {
        assert.match(spaIndex, /family=Roboto/);
    });

    it('proxies the LiteGraph canvas background image in dev', () => {
        assert.match(viteConfig, /'\/graph-background\.png'/);
    });

    it('redraws the canvas once the node webfonts are ready', () => {
        assert.match(automatePage, /document\.fonts\.load/);
        assert.match(automatePage, /setDirty\?\.\(true, true\)/);
    });
});
