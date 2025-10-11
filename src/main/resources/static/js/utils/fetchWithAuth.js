/**
 * 認証付きFetch API ヘルパー関数
 * X-CSRF-TOKENを自動付与し、セッション管理を行う
 */
class FetchWithAuth {
    constructor() {
        this.csrfToken = null;
        this.baseURL = '';
    }

    /**
     * CSRFトークンを取得
     */
    async loadCSRFToken() {
        try {
            // 複数のコントローラーからCSRFトークンを取得を試行
            const endpoints = [
                '/api/attendance/csrf-token',
                '/api/leave/csrf-token',
                '/api/admin/csrf-token'
            ];
            
            for (const endpoint of endpoints) {
                try {
                    console.log(`CSRFトークン取得を試行: ${endpoint}`);
                    const response = await fetch(endpoint, {
                        credentials: 'include'
                    });
                    
                    console.log(`CSRFトークン取得レスポンス: ${response.status}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log('CSRFトークンデータ:', data);
                        this.csrfToken = data.token;
                        return this.csrfToken;
                    }
                } catch (error) {
                    console.warn(`CSRFトークン取得失敗 (${endpoint}):`, error);
                }
            }
            
            // CSRFトークンが取得できない場合は警告を出して続行
            console.warn('CSRFトークンが取得できませんでした。API呼び出しは失敗する可能性があります。');
        } catch (error) {
            console.error('CSRFトークン取得エラー:', error);
        }
        return null;
    }

    /**
     * 認証付きFetchリクエスト
     * @param {string} url - リクエストURL
     * @param {Object} options - Fetchオプション
     * @returns {Promise<Response>} - レスポンス
     */
    async fetch(url, options = {}) {
        // デフォルトオプションを設定
        const defaultOptions = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        // CSRFトークンが設定されていない場合は取得
        if (!this.csrfToken) {
            await this.loadCSRFToken();
        }

        // CSRFトークンをヘッダーに追加（POST, PUT, DELETEリクエストの場合）
        if (this.csrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase())) {
            defaultOptions.headers['X-CSRF-TOKEN'] = this.csrfToken;
            defaultOptions.headers['X-XSRF-TOKEN'] = this.csrfToken; // Spring Security互換
        }

        // オプションをマージ
        const mergedOptions = { ...defaultOptions, ...options };
        if (mergedOptions.headers) {
            mergedOptions.headers = { ...defaultOptions.headers, ...mergedOptions.headers };
        }

        try {
            console.log(`API呼び出し: ${url}`, mergedOptions);
            const response = await fetch(url, mergedOptions);
            
            console.log(`APIレスポンス: ${response.status} ${response.statusText}`);
            
            // 401/403の場合はログイン画面にリダイレクト（ログイン画面以外の場合のみ）
            if (response.status === 401 || response.status === 403) {
                const loginContainer = document.getElementById('loginContainer');
                if (!loginContainer || loginContainer.style.display === 'none') {
                    console.log('認証エラー: ログイン画面にリダイレクト');
                    this.redirectToLogin();
                } else {
                    console.log('認証エラー: ログイン画面表示中なのでリダイレクトをスキップ');
                }
                throw new Error('認証が必要です');
            }

            return response;
        } catch (error) {
            console.error('Fetch エラー:', error);
            throw error;
        }
    }

    /**
     * GETリクエスト
     * @param {string} url - リクエストURL
     * @param {Object} options - 追加オプション
     * @returns {Promise<Response>} - レスポンス
     */
    async get(url, options = {}) {
        return this.fetch(url, { ...options, method: 'GET' });
    }

    /**
     * POSTリクエスト
     * @param {string} url - リクエストURL
     * @param {Object} data - 送信データ
     * @param {Object} options - 追加オプション
     * @returns {Promise<Response>} - レスポンス
     */
    async post(url, data = null, options = {}) {
        const requestOptions = {
            ...options,
            method: 'POST'
        };

        if (data) {
            requestOptions.body = JSON.stringify(data);
        }

        return this.fetch(url, requestOptions);
    }

    /**
     * PUTリクエスト
     * @param {string} url - リクエストURL
     * @param {Object} data - 送信データ
     * @param {Object} options - 追加オプション
     * @returns {Promise<Response>} - レスポンス
     */
    async put(url, data = null, options = {}) {
        const requestOptions = {
            ...options,
            method: 'PUT'
        };

        if (data) {
            requestOptions.body = JSON.stringify(data);
        }

        return this.fetch(url, requestOptions);
    }

    /**
     * DELETEリクエスト
     * @param {string} url - リクエストURL
     * @param {Object} options - 追加オプション
     * @returns {Promise<Response>} - レスポンス
     */
    async delete(url, options = {}) {
        return this.fetch(url, { ...options, method: 'DELETE' });
    }

    /**
     * ファイルダウンロード（PDF等）
     * @param {string} url - ダウンロードURL
     * @param {string} filename - ファイル名
     * @param {Object} options - 追加オプション
     * @returns {Promise<void>}
     */
    async downloadFile(url, filename, options = {}) {
        try {
            const response = await this.fetch(url, options);
            
            if (response.ok) {
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(downloadUrl);
                document.body.removeChild(a);
                return true;
            } else {
                throw new Error(`ダウンロードに失敗しました: ${response.status}`);
            }
        } catch (error) {
            console.error('ファイルダウンロードエラー:', error);
            throw error;
        }
    }

    /**
     * ログイン画面にリダイレクト
     */
    redirectToLogin() {
        // 現在のURLを保存（ログイン後に戻るため）
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/login') {
            sessionStorage.setItem('redirectAfterLogin', currentPath);
        }
        
        // ログイン画面を表示
        const loginContainer = document.getElementById('loginContainer');
        const mainContainer = document.getElementById('mainContainer');
        
        if (loginContainer && mainContainer) {
            loginContainer.style.display = 'block';
            mainContainer.style.display = 'none';
        }
    }

    /**
     * ログイン後のリダイレクト先を取得
     * @returns {string} - リダイレクト先URL
     */
    getRedirectAfterLogin() {
        const redirectPath = sessionStorage.getItem('redirectAfterLogin');
        sessionStorage.removeItem('redirectAfterLogin');
        return redirectPath || '/dashboard';
    }

    /**
     * レスポンスをJSONとして解析
     * @param {Response} response - レスポンス
     * @returns {Promise<Object>} - 解析されたJSONデータ
     */
    async parseJson(response) {
        try {
            const text = await response.text();
            if (!text.trim()) {
                // 空のレスポンスの場合
                return { success: false, message: '空のレスポンスが返されました' };
            }
            
            try {
                return JSON.parse(text);
            } catch (parseError) {
                console.error('JSON解析エラー:', parseError);
                console.error('レスポンステキスト:', text);
                // JSONでない場合は、エラーメッセージとして返す
                return { 
                    success: false, 
                    message: `サーバーエラー (${response.status}): ${text.substring(0, 200)}` 
                };
            }
        } catch (error) {
            console.error('レスポンス読み込みエラー:', error);
            return { 
                success: false, 
                message: `レスポンスの読み込みに失敗しました: ${error.message}` 
            };
        }
    }

    /**
     * エラーハンドリング付きAPI呼び出し
     * @param {Function} apiCall - API呼び出し関数
     * @param {string} errorMessage - エラーメッセージ
     * @returns {Promise<Object>} - APIレスポンス
     */
    async handleApiCall(apiCall, errorMessage = 'API呼び出しに失敗しました') {
        try {
            const response = await apiCall();
            
            if (response.ok) {
                const data = await this.parseJson(response);
                return data;
            } else {
                // エラーレスポンスの解析を試行
                let errorData;
                try {
                    errorData = await this.parseJson(response);
                } catch (parseError) {
                    console.warn('エラーレスポンスの解析に失敗:', parseError);
                    errorData = null;
                }
                
                // エラーデータが取得できた場合はそのメッセージを使用
                if (errorData && errorData.message) {
                    throw new Error(errorData.message);
                } else {
                    // エラーデータが取得できない場合は、HTTPステータスコードを使用
                    throw new Error(`${errorMessage} (HTTP ${response.status})`);
                }
            }
        } catch (error) {
            console.error('API呼び出しエラー:', error);
            // エラーメッセージが既に適切な場合はそのまま、そうでなければデフォルトメッセージを使用
            if (error.message && !error.message.includes('API呼び出しに失敗しました')) {
                throw error;
            } else {
                throw new Error(errorMessage);
            }
        }
    }
}

// グローバルインスタンスを作成
window.fetchWithAuth = new FetchWithAuth();
