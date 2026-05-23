(() => {
    const API_BASE_URL = window.SMM_API_BASE_URL || 'http://127.0.0.1:8000';
    const LOGOUT_ENDPOINT = `${API_BASE_URL}/api/logout`;
    const LOGIN_PAGE = 'index.html';

    function getStoredToken() {
        return localStorage.getItem('api_token') || sessionStorage.getItem('api_token');
    }

    function clearStoredAuth() {
        localStorage.removeItem('api_token');
        localStorage.removeItem('token_type');
        localStorage.removeItem('smm_user');
        localStorage.removeItem('user_id');
        sessionStorage.removeItem('api_token');
        sessionStorage.removeItem('token_type');
        sessionStorage.removeItem('smm_user');
        sessionStorage.removeItem('user_id');
    }

    function goToLogin() {
        window.location.href = LOGIN_PAGE;
    }

    async function handleLogout(event) {
        event.preventDefault();

        const token = getStoredToken();

        try {
            if (token) {
                await fetch(LOGOUT_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ api_token: token })
                });
            }
        } catch (error) {
            console.error('Logout request failed:', error);
        } finally {
            clearStoredAuth();
            goToLogin();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const logoutLinks = Array.from(document.querySelectorAll('a, button')).filter((element) => {
            return element.textContent.trim().toLowerCase() === 'logout';
        });

        logoutLinks.forEach((element) => {
            element.addEventListener('click', handleLogout);
        });
    });
})();
