// ==UserScript==
// @name         开源阅读(Legado)预加载增强器
// @namespace    https://github.com/YourUsername/Legado-Enhancer
// @version      2.0.0
// @description  通过预加载，加快开源阅读(Legado)Web服务的翻页速度
// @license      GPL-3.0
// @include      /^https?:\/\/.*\/vue\/index\.html.*/
// @grant        unsafeWindow
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/caffetsong/legado-fast-page/main/legado-fast-page.user.js
// @downloadURL  https://raw.githubusercontent.com/caffetsong/legado-fast-page/main/legado-fast-page.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        CONTENT_SELECTOR: 'div[chapterindex]',
        TITLE_SELECTOR: 'div.title',
        TOOLBAR_SELECTOR: 'div.tools',
        BUTTON_SELECTOR: 'div.tool-icon',
    };

    const state = {
        bookBaseUrl: null,
        currentChapterIndex: -1,
        prefetchedChapter: { index: -1, content: null },
        isLoading: false,
    };

    function log(level, ...args) {
        const styles = {
            info: 'color: #0077c2; font-weight: bold;',
            success: 'color: #28a745; font-weight: bold;',
            warn: 'color: #ffc107; font-weight: bold;',
            error: 'color: #dc3545; font-weight: bold;',
            hijack: 'color: #9c27b0; font-weight: bold;'
        };
        console.log(`%c🚀 Legado Enhancer [${level.toUpperCase()}]`, styles[level] || '', ...args);
    }

    // --- 核心渲染与加载逻辑 ---

    function renderContent(rawHtml) {
        const contentContainer = document.querySelector(CONFIG.CONTENT_SELECTOR);
        if (!contentContainer) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');
        const newContent = doc.querySelector(CONFIG.CONTENT_SELECTOR);

        if (newContent) {
            contentContainer.innerHTML = newContent.innerHTML;
            const newTitleEl = contentContainer.querySelector(CONFIG.TITLE_SELECTOR);
            if (newTitleEl) document.title = newTitleEl.textContent.trim();
            log('success', `Render: 章节内容已瞬时渲染 (Index: ${state.currentChapterIndex})`);
            // 渲染后强制滚动到顶部
            window.scrollTo(0, 0);
        }
    }

    async function loadChapter(index) {
        if (index < 0 || state.isLoading) return;
        state.isLoading = true;
        log('info', `LoadChapter: 实时加载章节 (Index: ${index})...`);
        try {
            const apiUrl = `http://${window.location.host}/getBookContent?url=${state.bookBaseUrl}&index=${index}`;
            const response = await unsafeWindow.fetch(apiUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const content = await response.text();

            state.currentChapterIndex = index;
            renderContent(content);
            prefetchNextChapter();
        } catch (error) {
            log('error', `LoadChapter: 加载章节 ${index} 失败:`, error);
        } finally {
            state.isLoading = false;
        }
    }

    async function prefetchNextChapter() {
        if (state.isLoading || !state.bookBaseUrl || state.currentChapterIndex < 0) return;
        state.isLoading = true;
        const nextIndex = state.currentChapterIndex + 1;
        log('info', `Prefetch: 开始预加载下一章 (Index: ${nextIndex})...`);

        try {
            const nextApiUrl = `http://${window.location.host}/getBookContent?url=${state.bookBaseUrl}&index=${nextIndex}`;
            const response = await unsafeWindow.fetch(nextApiUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const content = await response.text();
            state.prefetchedChapter = { index: nextIndex, content: content };
            log('success', `Prefetch: 预加载成功 (Index: ${nextIndex})`);
        } catch (error) {
            log('error', `Prefetch: 预加载章节 ${nextIndex} 失败:`, error);
            state.prefetchedChapter = { index: -1, content: null };
        } finally {
            state.isLoading = false;
        }
    }

    function executePageTurn(direction) {
        if (direction === 'next') {
            const nextIndex = state.currentChapterIndex + 1;
            if (state.prefetchedChapter.index === nextIndex) {
                log('hijack', 'CACHE HIT: 缓存命中，零延迟渲染！');
                state.currentChapterIndex = nextIndex;
                renderContent(state.prefetchedChapter.content);
                state.prefetchedChapter = { index: -1, content: null };
                prefetchNextChapter();
            } else {
                log('hijack', 'CACHE MISS: 缓存未命中，执行实时加载。');
                loadChapter(nextIndex);
            }
        } else if (direction === 'prev') {
            loadChapter(state.currentChapterIndex - 1);
        }
    }

    // --- 事件劫持系统 (V2.0 核心) ---

    function setupHijackers() {
        // 1. 键盘劫持
        window.addEventListener('keydown', (event) => {
            if (!window.location.hash.includes('chapter')) return;
            if (event.key === 'ArrowRight') {
                event.preventDefault(); event.stopPropagation();
                log('hijack', 'KEYBOARD: 劫持 -> [向右翻页]');
                executePageTurn('next');
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault(); event.stopPropagation();
                log('hijack', 'KEYBOARD: 劫持 -> [向左翻页]');
                executePageTurn('prev');
            }
        }, true);

        // 2. 鼠标点击劫持 (针对 .tools 栏)
        window.addEventListener('click', (event) => {
            if (!window.location.hash.includes('chapter')) return;

            // 检查点击是否发生在工具栏按钮上
            const button = event.target.closest(CONFIG.BUTTON_SELECTOR);
            const toolbar = event.target.closest(CONFIG.TOOLBAR_SELECTOR);

            if (button && toolbar) {
                // 获取工具栏中所有按钮
                const buttons = Array.from(toolbar.querySelectorAll(CONFIG.BUTTON_SELECTOR));
                const index = buttons.indexOf(button);

                // 策略：第一个按钮是上一章，最后一个按钮是下一章
                if (index === 0) {
                    event.preventDefault(); event.stopPropagation();
                    log('hijack', 'CLICK: 劫持 -> [上一章按钮]');
                    executePageTurn('prev');
                } else if (index === buttons.length - 1) {
                    event.preventDefault(); event.stopPropagation();
                    log('hijack', 'CLICK: 劫持 -> [下一章按钮]');
                    executePageTurn('next');
                }
            }
        }, true); // 捕获阶段至关重要

        log('success', 'Hijacker: 全局事件劫持系统(键盘+鼠标)已部署。');
    }

    // --- 初始化拦截器 (仅用于嗅探初始状态) ---

    function processInitialRequest(url) {
        if (state.bookBaseUrl) return;

        if (typeof url === 'string' && url.includes('/getBookContent')) {
            try {
                const urlObj = new URL(url, window.location.origin);
                const bookUrl = urlObj.searchParams.get('url');
                const index = parseInt(urlObj.searchParams.get('index'), 10);

                if (bookUrl && !isNaN(index)) {
                    log('info', `Interceptor: 捕获到初始状态, Index: ${index}`);
                    state.bookBaseUrl = bookUrl;
                    state.currentChapterIndex = index;
                    log('success', 'State: 状态初始化成功!');
                    prefetchNextChapter();
                }
            } catch (e) { }
        }
    }

    function setupInterceptors() {
        const originalOpen = unsafeWindow.XMLHttpRequest.prototype.open;
        unsafeWindow.XMLHttpRequest.prototype.open = function (method, url, ...args) {
            this._url = url;
            return originalOpen.apply(this, [method, url, ...args]);
        };
        const originalSend = unsafeWindow.XMLHttpRequest.prototype.send;
        unsafeWindow.XMLHttpRequest.prototype.send = function (...args) {
            processInitialRequest(this._url);
            return originalSend.apply(this, args);
        };
        const originalFetch = unsafeWindow.fetch;
        unsafeWindow.fetch = async function (...args) {
            const url = args[0] instanceof Request ? args[0].url : args[0];
            processInitialRequest(url);
            return originalFetch.apply(this, args);
        };
        log('info', 'Interceptor: 初始化嗅探器已部署。');
    }

    // --- 启动 ---
    log('info', 'V2.0.0 启动中...');
    setupInterceptors();
    setupHijackers();

    window.addEventListener('DOMContentLoaded', () => {
        let attempts = 0;
        const check = setInterval(() => {
            if (document.querySelector(CONFIG.CONTENT_SELECTOR)) {
                clearInterval(check);
                log('success', '🚀 Legado Enhancer V2.0 已完全就绪。');
            }
            if (++attempts > 40) clearInterval(check);
        }, 250);
    });

})();