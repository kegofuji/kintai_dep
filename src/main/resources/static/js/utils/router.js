/**
 * SPAルーティング機能
 * History API を利用したルーティングを実装
 */
class Router {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;

        // thisにバインドしたルート変更ハンドラを保持
        this.handleRouteChange = this.handleRouteChange.bind(this);

        // ルート定義
        this.defineRoutes();

        // ルート変更イベントの監視を開始
        window.addEventListener('popstate', this.handleRouteChange);

        if (document.readyState !== 'loading') {
            this.initializeCurrentRoute();
        } else {
            document.addEventListener('DOMContentLoaded', () => this.initializeCurrentRoute());
        }
    }

    /**
     * 初期表示時のルート処理
     */
    initializeCurrentRoute() {
        const initialPath = this.normalizePath(window.location.pathname);

        if (initialPath === '/') {
            this.navigate('/login', { updateHistory: true, replace: true });
            return;
        }

        if (!this.routes.has(initialPath)) {
            this.navigate('/dashboard', { updateHistory: true, replace: true });
            return;
        }

        this.navigate(initialPath, { updateHistory: false });
    }

    /**
     * ルート定義
     */
    defineRoutes() {
        // 一般ユーザー向けルート
        this.routes.set('/', { screen: 'dashboardScreen', title: '打刻画面' });
        this.routes.set('/login', { title: 'ログイン', login: true });
        this.routes.set('/dashboard', { screen: 'dashboardScreen', title: '打刻画面' });
        this.routes.set('/history', { screen: 'historyScreen', title: '勤怠履歴' });
        this.routes.set('/vacation', { screen: 'vacationScreen', title: '休暇申請' });
        this.routes.set('/adjustment', { screen: 'adjustmentScreen', title: '打刻修正' });
        
        // 管理者向けルート
        this.routes.set('/admin', { screen: 'adminDashboardScreen', title: '管理者TOP', admin: true });
        this.routes.set('/admin/employees', { screen: 'adminEmployeesScreen', title: '社員管理', admin: true });
        // 勤怠管理画面は廃止
        this.routes.set('/admin/approvals', { screen: 'adminApprovalsScreen', title: '打刻修正', admin: true });
        this.routes.set('/admin/vacation-management', { screen: 'adminVacationManagementScreen', title: '休暇管理', admin: true });
    }

    /**
     * ルート変更処理
     */
    handleRouteChange() {
        const path = this.normalizePath(window.location.pathname);
        this.navigate(path, { updateHistory: false });
    }

    /**
     * ルート遷移
     * @param {string} path - 遷移先パス
     * @param {Object|boolean} options - 履歴更新オプション
     */
    navigate(path, options = {}) {
        const normalizedOptions = typeof options === 'boolean'
            ? { updateHistory: options }
            : options;

        const {
            updateHistory = true,
            replace = false
        } = normalizedOptions;

        let normalizedPath = this.normalizePath(path);

        if (normalizedPath === '/') {
            normalizedPath = '/dashboard';
        }

        const route = this.routes.get(normalizedPath);
        if (!route) {
            console.warn(`ルートが見つかりません: ${normalizedPath}`);
            if (normalizedPath !== '/dashboard') {
                this.navigate('/dashboard', { updateHistory: true, replace: true });
            }
            return;
        }

        if (route.admin && !this.isAdmin()) {
            console.warn('管理者権限が必要です');
            this.navigate('/dashboard', { updateHistory: true, replace: true });
            return;
        }

        const currentPath = window.location.pathname;
        if (updateHistory) {
            const state = { path: normalizedPath };
            if (replace) {
                window.history.replaceState(state, '', normalizedPath);
            } else if (currentPath !== normalizedPath) {
                window.history.pushState(state, '', normalizedPath);
            }
        } else if (replace && currentPath !== normalizedPath) {
            window.history.replaceState({ path: normalizedPath }, '', normalizedPath);
        }

        if (this.currentRoute === normalizedPath) {
            this.updateNavigation(normalizedPath);
            return;
        }

        if (route.login) {
            this.showScreen(null);
        } else if (route.screen) {
            this.showScreen(route.screen);
            this.initializeScreen(route.screen);
        }

        if (route.title) {
            this.updateTitle(route.title);
        }

        this.currentRoute = normalizedPath;
        this.updateNavigation(normalizedPath);
    }

    /**
     * パス正規化
     * @param {string} path - パス
     * @returns {string} - 正規化されたパス
     */
    normalizePath(path) {
        if (!path) {
            return '/';
        }

        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }

        return path;
    }

    /**
     * 画面表示
     * @param {string} screenId - 画面ID
     */
    showScreen(screenId) {
        // すべての画面を非表示
        const screens = document.querySelectorAll('.screen-container');
        screens.forEach(screen => {
            screen.classList.remove('active');
        });

        if (!screenId) {
            return;
        }

        // 指定された画面を表示
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        } else {
            console.error(`画面が見つかりません: ${screenId}`);
        }
    }

    /**
     * タイトル更新
     * @param {string} title - タイトル
     */
    updateTitle(title) {
        // 画面名のみをタイトルに表示（要望 7:B）
        document.title = `${title}`;
    }

    /**
     * 管理者権限チェック
     * @returns {boolean} - 管理者かどうか
     */
    isAdmin() {
        // グローバル変数から管理者権限をチェック
        return window.currentUser === 'admin';
    }

    /**
     * 画面固有の初期化処理
     * @param {string} screenId - 画面ID
     */
    initializeScreen(screenId) {
        // 各画面の初期化処理を呼び出し
        switch (screenId) {
            case 'dashboardScreen':
                if (window.dashboardScreen) {
                    window.dashboardScreen.init();
                }
                break;
            case 'historyScreen':
                if (window.historyScreen && !window.historyScreen.initialized) {
                    window.historyScreen.init();
                }
                break;
            case 'vacationScreen':
                if (window.vacationScreen) {
                    window.vacationScreen.init();
                }
                break;
            case 'adjustmentScreen':
                if (window.adjustmentScreen) {
                    window.adjustmentScreen.init();
                }
                break;
            case 'adminDashboardScreen':
                if (window.adminScreen) {
                    window.adminScreen.initDashboard();
                }
                break;
            case 'adminEmployeesScreen':
                if (window.adminScreen) {
                    window.adminScreen.initEmployees();
                }
                break;
            // adminAttendanceScreen は廃止
            case 'adminApprovalsScreen':
                if (window.adminScreen) {
                    window.adminScreen.initApprovals();
                }
                break;
            case 'adminReportsScreen':
                if (window.adminScreen) {
                    window.adminScreen.initReports();
                }
                break;
            case 'adminVacationManagementScreen':
                if (window.adminScreen) {
                    window.adminScreen.initVacationManagement();
                }
                break;
        }
    }

    /**
     * 現在のルートを取得
     * @returns {string} - 現在のルート
     */
    getCurrentRoute() {
        return this.currentRoute;
    }

    /**
     * ルートが存在するかチェック
     * @param {string} path - パス
     * @returns {boolean} - 存在するかどうか
     */
    hasRoute(path) {
        const normalizedPath = this.normalizePath(path);
        return this.routes.has(normalizedPath);
    }

    /**
     * 管理者メニューの表示/非表示を制御
     * @param {boolean} isAdmin - 管理者かどうか
     */
    toggleAdminMenu(isAdmin) {
        const adminMenu = document.getElementById('adminMenu');
        if (adminMenu) {
            if (isAdmin) {
                adminMenu.classList.add('show');
            } else {
                adminMenu.classList.remove('show');
            }
        }
    }

    /**
     * ナビゲーションバーのアクティブ状態を更新
     * @param {string} currentPath - 現在のパス
     */
    updateNavigation(currentPath) {
        const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
        navLinks.forEach(link => {
            link.classList.remove('active');

            const href = link.getAttribute('href');
            if (!href || href === '#') {
                return;
            }

            const hashPath = href.startsWith('#') ? href.substring(1) : href;
            if (!hashPath) {
                return;
            }
            const linkPath = this.normalizePath(hashPath);
            if (linkPath === currentPath || (linkPath === '/' && currentPath === '/dashboard')) {
                link.classList.add('active');
            }
        });
    }
}

// Router クラスをグローバルに公開
window.Router = Router;
