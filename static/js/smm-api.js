(function () {
    const API_BASE_URL = window.SMM_API_BASE_URL || 'http://127.0.0.1:8000';

    function getToken() {
        return localStorage.getItem('api_token') || sessionStorage.getItem('api_token') || '';
    }

    function getCurrentUser() {
        const raw = localStorage.getItem('smm_user') || sessionStorage.getItem('smm_user');
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function saveAuth(data) {
        if (data.token) sessionStorage.setItem('api_token', data.token);
        if (data.token_type) sessionStorage.setItem('token_type', data.token_type);
        if (data.user) {
            const currentUser = getCurrentUser() || {};
            const nextUser = { ...currentUser, ...data.user };
            sessionStorage.setItem('smm_user', JSON.stringify(nextUser));
            if (nextUser.id) sessionStorage.setItem('user_id', nextUser.id);
        }
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();
        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        let response;

        try {
            response = await fetch(`${API_BASE_URL}${path}`, {
                ...options,
                headers
            });
        } catch (error) {
            throw new Error(error.message === 'Failed to fetch'
                ? `Could not connect to backend at ${API_BASE_URL}. Make sure Laravel is running.`
                : error.message);
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.status === false) {
            throw new Error(data.message || data.error || 'Request failed. Please try again.');
        }

        return data;
    }

    async function apiRequestAny(paths, options = {}) {
        let lastError = null;

        for (const path of paths) {
            try {
                return await apiRequest(path, options);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError || new Error('Request failed. Please try again.');
    }

    function itemsFromPaginated(payload) {
        return payload?.data?.data || payload?.data || [];
    }

    function formatMoney(value) {
        return `₹${Number(value || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    function currentUserId() {
        return getCurrentUser()?.id || sessionStorage.getItem('user_id') || localStorage.getItem('user_id') || '';
    }

    function showAlert(message) {
        alert(message);
    }

    function ensureAdminStatusSelectStyle() {
        if (document.getElementById('admin-status-select-style')) return;

        const style = document.createElement('style');
        style.id = 'admin-status-select-style';
        style.textContent = `
            .admin-status-select {
                width: 100%;
                min-width: 132px;
                border: 1px solid var(--border, #e5e7eb);
                border-radius: 10px;
                background: var(--white, #fff);
                color: var(--dark, #111827);
                font-size: 13px;
                font-weight: 600;
                padding: 8px 10px;
                outline: none;
            }
            .admin-status-select:disabled {
                opacity: 0.6;
                cursor: wait;
            }
        `;
        document.head.appendChild(style);
    }

    async function refreshCurrentFinancialState() {
        totalFundsPromise = null;
        spentBalancePromise = null;
        freshCurrentUserPromise = null;

        try {
            const freshUser = await getFreshCurrentUser();
            if (freshUser?.balance !== undefined) updateBalanceCards(freshUser.balance);
        } catch (_error) {
            const user = getCurrentUser();
            if (user?.balance !== undefined) updateBalanceCards(user.balance);
        }

        refreshDashboardTotals();
    }

    function initPublicPageMode() {
        if (getToken() || !/(services|api|contact)\.html$/i.test(location.pathname)) return;

        document.body.classList.add('public-page');

        if (!document.getElementById('public-page-style')) {
            const style = document.createElement('style');
            style.id = 'public-page-style';
            style.textContent = `
                body.public-page .sidebar { display: none !important; }
                body.public-page .main { margin-left: 0 !important; width: 100% !important; }
                body.public-page .top-bar { left: 0 !important; padding-left: 60px !important; padding-right: 60px !important; }
                body.public-page .mobile-toggle,
                body.public-page .mobile-menu-btn,
                body.public-page .balance-card,
                body.public-page .notification,
                body.public-page .user-profile { display: none !important; }
                body.public-page .public-nav {
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    margin-left: auto;
                }
                body.public-page .public-nav a {
                    color: var(--secondary-light, #666);
                    font-size: 13px;
                    font-weight: 600;
                    letter-spacing: 0.04em;
                    text-decoration: none;
                    text-transform: uppercase;
                }
                body.public-page .public-nav a:hover,
                body.public-page .public-nav a.active { color: var(--primary, #52906b); }
                @media (max-width: 768px) {
                    body.public-page .top-bar { padding-left: 20px !important; padding-right: 20px !important; gap: 16px; }
                    body.public-page .public-nav { gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
                    body.public-page .public-nav a { font-size: 11px; }
                }
            `;
            document.head.appendChild(style);
        }

        const topBar = document.querySelector('.top-bar');
        if (topBar && !topBar.querySelector('.public-nav')) {
            const currentPage = location.pathname.split('/').pop().toLowerCase();
            topBar.insertAdjacentHTML('beforeend', `
                <nav class="public-nav" aria-label="Public navigation">
                    <a href="services.html" class="${currentPage === 'services.html' ? 'active' : ''}">Services</a>
                    <a href="api.html" class="${currentPage === 'api.html' ? 'active' : ''}">API</a>
                    <a href="contact.html" class="${currentPage === 'contact.html' ? 'active' : ''}">Contact</a>
                    <a href="index.html">Login</a>
                </nav>
            `);
        }
    }

    function updateRoleNavigation() {
        const user = getCurrentUser() || {};
        const role = String(user.role || 'client').toLowerCase();
        const logoText = document.querySelector('.logo-text');
        const logoLink = logoText?.closest('a');
        const dashboardLink = document.querySelector('.sidebar-nav a[href="dashboard.html"], .sidebar-nav a[href="admin.html"]');

        if (logoText) {
            logoText.textContent = role === 'admin' ? 'Admin Panel' : 'SMM Panel';
        }

        if (logoLink) {
            logoLink.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
        }

        document.querySelectorAll('.order-alert').forEach((node) => {
            node.style.display = role === 'admin' ? 'none' : '';
        });

        document.querySelectorAll('.sidebar-nav a[href="updates.html"]').forEach((node) => {
            node.style.display = role === 'admin' ? '' : 'none';
        });

        document.querySelectorAll('.sidebar-nav a[href="whatsapp-widget.html"]').forEach((node) => {
            node.style.display = role === 'admin' ? '' : 'none';
        });

        document.querySelectorAll('.sidebar-footer a[href="support.html"], .sidebar-footer a[href^="https://wa.me/"], .whatsapp-float').forEach((node) => {
            if (role === 'admin' && (node.matches('a[href^="https://wa.me/"]') || node.classList.contains('whatsapp-float') || node.hasAttribute('hidden'))) {
                node.remove();
            } else {
                node.style.display = '';
            }
        });

        if (role !== 'admin' && /(updates|whatsapp-widget)\.html$/i.test(location.pathname)) {
            window.location.replace('dashboard.html');
            return;
        }

        if (!dashboardLink) return;

        dashboardLink.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
        dashboardLink.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                node.textContent = role === 'admin' ? ' Admin Dashboard' : ' Dashboard';
            }
        });
    }

    let totalFundsPromise = null;
    let spentBalancePromise = null;
    let freshCurrentUserPromise = null;

    async function getAllPaginatedItems(path) {
        const firstPayload = await apiRequest(path);
        const firstItems = itemsFromPaginated(firstPayload);
        const lastPage = Number(firstPayload.data?.last_page || 1);
        const pageRequests = [];

        for (let page = 2; page <= lastPage; page += 1) {
            const separator = path.includes('?') ? '&' : '?';
            pageRequests.push(apiRequest(`${path}${separator}page=${page}`));
        }

        const results = await Promise.allSettled(pageRequests);
        const restItems = results.flatMap((result) => (
            result.status === 'fulfilled' ? itemsFromPaginated(result.value) : []
        ));

        return [...firstItems, ...restItems];
    }

    async function getTotalFundsAmount() {
        const user = getCurrentUser();
        if (!user) return 0;
        if (totalFundsPromise) return totalFundsPromise;

        totalFundsPromise = (async () => {
            const payments = await getAllPaginatedItems('/api/get_payments');

            return payments
                .filter((payment) => String(payment.user_id) === String(user.id))
                .filter((payment) => ['success', 'successful', 'completed', 'paid'].includes(String(payment.status || '').toLowerCase()))
                .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
        })();

        return totalFundsPromise;
    }

    async function getSpentBalanceAmount() {
        const user = getCurrentUser();
        if (!user) return 0;
        if (spentBalancePromise) return spentBalancePromise;

        spentBalancePromise = (async () => {
            const orders = await getAllPaginatedItems('/api/get_orders');

            return orders
                .filter((order) => String(order.user_id) === String(user.id))
                .filter((order) => String(order.status || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'completed')
                .reduce((total, order) => total + Number(order.charge || 0), 0);
        })();

        return spentBalancePromise;
    }

    async function getFreshCurrentUser() {
        const user = getCurrentUser();
        if (!user?.id) return user;
        if (freshCurrentUserPromise) return freshCurrentUserPromise;

        freshCurrentUserPromise = (async () => {
            const users = await getAllPaginatedItems('/api/get_users');
            const freshUser = users.find((item) => String(item.id) === String(user.id));

            if (freshUser) {
                saveAuth({ user: freshUser });
                return { ...user, ...freshUser };
            }

            return user;
        })();

        return freshCurrentUserPromise;
    }

    function updateBalanceCards(amount) {
        document.querySelectorAll('.balance-card span').forEach((node) => {
            node.textContent = formatMoney(amount);
        });
    }

    function refreshDashboardTotals() {
        if (!/dashboard\.html$/i.test(location.pathname)) return;

        const statCards = document.querySelectorAll('.stats-grid .stat-card');

        Promise.allSettled([
            getSpentBalanceAmount(),
            getTotalFundsAmount()
        ]).then(([spentResult, totalFundsResult]) => {
            if (spentResult.status === 'fulfilled' && statCards[1]) {
                const spentBalance = statCards[1].querySelector('.stat-info p');
                if (spentBalance) spentBalance.textContent = formatMoney(spentResult.value);
            }

            if (totalFundsResult.status === 'fulfilled' && statCards[2]) {
                const totalFunds = statCards[2].querySelector('.stat-info p');
                if (totalFunds) totalFunds.textContent = formatMoney(totalFundsResult.value);
            }
        });
    }

    function initTotalFundsDisplay() {
        if (!document.querySelector('.balance-card span')) return;

        const user = getCurrentUser();
        if (!user) return;

        updateBalanceCards(user.balance);
        getFreshCurrentUser()
            .then((freshUser) => updateBalanceCards(freshUser?.balance))
            .catch(() => updateBalanceCards(user.balance));
    }

    function initDashboardUser() {
        if (!/dashboard\.html$/i.test(location.pathname)) return;

        const user = getCurrentUser();
        if (!user) return;

        const statCards = document.querySelectorAll('.stats-grid .stat-card');
        const welcomeName = document.querySelector('.stats-grid .stat-card:first-child .stat-info p');
        if (welcomeName) {
            welcomeName.textContent = user.username || user.email || 'User';
        }

        if (statCards[2]) {
            const totalFunds = statCards[2].querySelector('.stat-info p');
            if (totalFunds) totalFunds.textContent = formatMoney(user.balance);
        }

        updateBalanceCards(user.balance);
        getFreshCurrentUser()
            .then((freshUser) => {
                if (!freshUser) return;
                if (welcomeName) welcomeName.textContent = freshUser.username || freshUser.email || 'User';
                updateBalanceCards(freshUser.balance);
            })
            .catch(() => updateBalanceCards(user.balance));

        refreshDashboardTotals();
    }

    function initSignup() {
        if (!/signup\.html$/i.test(location.pathname)) return;

        const button = document.querySelector('.btn-primary');
        if (!button) return;
        const params = new URLSearchParams(window.location.search);
        const referralCode = params.get('ref')?.trim();
        const referrerId = params.get('referrer_id')?.trim();

        if (referralCode || referrerId) {
            apiRequest('/api/track_referral_visit', {
                method: 'POST',
                body: JSON.stringify({
                    ...(referralCode ? { ref: referralCode, referral_code: referralCode } : {}),
                    ...(referrerId ? { referrer_id: referrerId } : {})
                })
            }).catch(() => {});
        }

        button.addEventListener('click', async (event) => {
            event.preventDefault();

            const username = document.getElementById('fullname')?.value.trim();
            const email = document.getElementById('email')?.value.trim();
            const phoneNumber = document.getElementById('phone_number')?.value.trim();
            const password = document.getElementById('password')?.value;
            const confirmPassword = document.getElementById('confirm-password')?.value;

            if (!username || !email || !phoneNumber || !password || !confirmPassword) {
                showAlert('Please fill all fields.');
                return;
            }

            if (phoneNumber.replace(/\D/g, '').length < 10) {
                showAlert('Please enter a valid phone number.');
                return;
            }

            if (password !== confirmPassword) {
                showAlert('Passwords do not match.');
                return;
            }

            button.disabled = true;
            button.textContent = 'Creating...';

            try {
                const payload = {
                    username,
                    email,
                    phone_number: phoneNumber,
                    phone: phoneNumber,
                    password
                };
                if (referralCode) {
                    payload.ref = referralCode;
                    payload.referral_code = referralCode;
                }
                if (referrerId) {
                    payload.referrer_id = referrerId;
                }

                await apiRequest('/api/sign_up', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                showAlert('Account created successfully. Please login.');
                window.location.href = 'index.html';
            } catch (error) {
                showAlert(error.message);
            } finally {
                button.disabled = false;
                button.textContent = 'Create Account';
            }
        });
    }

    function initDashboardOrderForm() {
        if (!/dashboard\.html$/i.test(location.pathname)) return;

        const form = document.querySelector('.order-form');
        const categorySelect = document.getElementById('category-select');
        const serviceSelect = document.getElementById('service-select');
        const serviceSearchInput = document.querySelector('.search-services input');
        if (!form || !categorySelect || !serviceSelect) return;

        const inputs = form.querySelectorAll('.form-input');
        const linkInput = inputs[0];
        const quantityInput = inputs[1];
        const avgTimeInput = inputs[2];
        const chargeInput = inputs[3];
        const infoText = form.querySelector('.form-info-text');
        let services = [];
        let categories = [];
        let activePlatform = 'all';
        let searchTerm = '';
        const platformItems = Array.from(document.querySelectorAll('.platform-item'));
        const preselectedServiceId = new URLSearchParams(window.location.search).get('service_id');

        function serviceById(id) {
            return services.find((service) => String(service.id) === String(id));
        }

        function updateCharge() {
            const service = serviceById(serviceSelect.value);
            const quantity = Number(quantityInput?.value || 0);
            const rate = Number(service?.rate_per_1000 || 0);
            if (chargeInput) chargeInput.value = formatMoney((quantity * rate) / 1000);
        }

        function renderCategories(platform = 'all') {
            activePlatform = platform;
            const matchingServices = filteredDashboardServices();
            const matchingCategoryIds = new Set(matchingServices.map((service) => String(service.category_id)));
            const filtered = categories.filter((category) => {
                const matchesPlatform = platform === 'all'
                    || String(category.platform || '').toLowerCase() === platform;
                return matchesPlatform && (!searchTerm || matchingCategoryIds.has(String(category.id)));
            });

            categorySelect.innerHTML = '<option value="">Select a category</option>';
            filtered.forEach((category) => {
                categorySelect.insertAdjacentHTML('beforeend', `<option value="${category.id}">${escapeHtml(category.name)}</option>`);
            });

            if (filtered.length === 1) {
                categorySelect.value = filtered[0].id;
            }

            renderServices();
        }

        function selectServiceFromUrl() {
            if (!preselectedServiceId) return;

            const service = serviceById(preselectedServiceId);
            if (!service) return;

            const platform = String(service.platform || service.category?.platform || 'all').toLowerCase();
            const platformItem = platformItems.find((item) => item.getAttribute('data-platform') === platform);

            platformItems.forEach((item) => item.classList.remove('active'));
            if (platformItem) {
                platformItem.classList.add('active');
                activePlatform = platform;
            } else {
                const allItem = platformItems.find((item) => item.getAttribute('data-platform') === 'all');
                allItem?.classList.add('active');
                activePlatform = 'all';
            }

            searchTerm = '';
            if (serviceSearchInput) serviceSearchInput.value = '';
            renderCategories(activePlatform);

            categorySelect.value = service.category_id;
            renderServices();
            serviceSelect.value = service.id;
            updateServiceDetails();

            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function filteredDashboardServices() {
            return services.filter((service) => {
                const platform = String(service.platform || service.category?.platform || '').toLowerCase();
                const matchesPlatform = activePlatform === 'all' || platform === activePlatform;
                const haystack = `${service.id} ${service.name || ''} ${service.category?.name || ''} ${service.platform || ''}`.toLowerCase();
                return matchesPlatform && (!searchTerm || haystack.includes(searchTerm));
            });
        }

        function updatePlatformIcons() {
            if (!platformItems.length) return;

            if (!searchTerm) {
                platformItems.forEach((item) => {
                    item.style.display = '';
                    item.classList.toggle('active', item.getAttribute('data-platform') === 'all');
                });
                activePlatform = 'all';
                return;
            }

            const matchingPlatforms = new Set(
                services
                    .filter((service) => {
                        const haystack = `${service.id} ${service.name || ''} ${service.category?.name || ''} ${service.platform || ''}`.toLowerCase();
                        return haystack.includes(searchTerm);
                    })
                    .map((service) => String(service.platform || service.category?.platform || '').toLowerCase())
                    .filter(Boolean)
            );

            platformItems.forEach((item) => {
                const platform = item.getAttribute('data-platform') || '';
                const showIcon = platform !== 'all' && (
                    matchingPlatforms.has(platform) || platform.includes(searchTerm)
                );
                item.style.display = showIcon ? '' : 'none';
            });

            const visibleItems = platformItems.filter((item) => item.style.display !== 'none');
            if (visibleItems.length === 1) {
                platformItems.forEach((item) => item.classList.remove('active'));
                visibleItems[0].classList.add('active');
                activePlatform = visibleItems[0].getAttribute('data-platform') || 'all';
            }
        }

        function renderServices() {
            const categoryId = categorySelect.value;
            const filtered = filteredDashboardServices().filter((service) => String(service.category_id) === String(categoryId));

            serviceSelect.innerHTML = '<option value="">Select a service</option>';
            filtered.forEach((service) => {
                serviceSelect.insertAdjacentHTML('beforeend', `<option value="${service.id}">${escapeHtml(service.name)} - ${formatMoney(service.rate_per_1000)}</option>`);
            });

            if (filtered.length === 1) {
                serviceSelect.value = filtered[0].id;
            }

            updateServiceDetails();
        }

        function updateServiceDetails() {
            const service = serviceById(serviceSelect.value);
            if (avgTimeInput) avgTimeInput.value = service?.avg_time || '';
            if (infoText && service) infoText.textContent = `Min: ${service.min_order || 0} - Max: ${service.max_order || 0}`;
            updateCharge();
        }

        document.querySelectorAll('.platform-item').forEach((item) => {
            item.addEventListener('click', () => {
                renderCategories(item.getAttribute('data-platform') || 'all');
            });
        });

        categorySelect.addEventListener('change', renderServices);
        serviceSelect.addEventListener('change', updateServiceDetails);
        quantityInput?.addEventListener('input', updateCharge);
        serviceSearchInput?.addEventListener('input', () => {
            searchTerm = serviceSearchInput.value.trim().toLowerCase();
            updatePlatformIcons();
            renderCategories(activePlatform);
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const userId = currentUserId();
            const service = serviceById(serviceSelect.value);
            const quantity = Number(quantityInput?.value || 0);
            const link = linkInput?.value.trim();

            if (!userId) {
                showAlert('Please login before placing an order.');
                window.location.href = 'index.html';
                return;
            }

            if (!service || !link || !quantity) {
                showAlert('Please select a service, enter link, and quantity.');
                return;
            }

            try {
                const charge = ((quantity * Number(service.rate_per_1000 || 0)) / 1000).toFixed(2);
                const data = await apiRequest('/api/create_order', {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: userId,
                        service_id: service.id,
                        link,
                        quantity,
                        charge,
                        amount: Number(charge),
                        status: 'completed',
                        update_balance: true,
                        debit_balance: true,
                        balance_action: 'debit',
                        update_referral: true,
                        referral_action: 'earn',
                        referral_source: 'order',
                        referral_amount: Number(charge)
                    })
                });

                showAlert(data.message || 'Order created successfully.');
                saveAuth(data);
                if (data.user?.balance !== undefined) updateBalanceCards(data.user.balance);
                form.reset();
                updateServiceDetails();
                spentBalancePromise = null;
                refreshDashboardTotals();
            } catch (error) {
                showAlert(error.message);
            }
        });

        Promise.all([
            getAllPaginatedItems('/api/get_categories'),
            getAllPaginatedItems('/api/get_services')
        ]).then(([categoryData, serviceData]) => {
            categories = categoryData;
            services = serviceData;
            renderCategories('all');
            selectServiceFromUrl();
        }).catch((error) => {
            showAlert(error.message);
        });
    }

    function initOrders() {
        if (!/orders\.html$/i.test(location.pathname)) return;

        const tbody = document.querySelector('.orders-table tbody');
        if (!tbody) return;
        let currentPage = 1;
        let activeOrderStatus = 'all';
        let lastOrders = [];
        let lastOrderMeta = null;
        let allOrdersCache = null;
        let orderSearchTerm = '';
        const ordersPerPage = 10;
        const orderSearchInput = document.querySelector('.search-bar-wrap input');
        const currentUser = getCurrentUser() || {};
        const isAdmin = String(currentUser.role || 'client').toLowerCase() === 'admin';
        const orderStatuses = ['completed', 'cancelled'];
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading orders...</td></tr>';
        if (isAdmin) ensureAdminStatusSelectStyle();

        function renderOrdersPagination(meta) {
            document.querySelector('.orders-pagination')?.remove();
            if (!meta) return;

            const pages = Array.from({ length: Number(meta.last_page) }, (_item, index) => index + 1);
            const buttons = pages.map((page) => `
                <button class="pagination-btn ${page === Number(meta.current_page) ? 'active' : ''}" data-page="${page}" type="button">${page}</button>
            `).join('');

            const tableCard = document.querySelector('.table-card');
            tableCard?.insertAdjacentHTML('beforeend', `
                <div class="orders-pagination">
                    ${Number(meta.last_page || 1) > 1 ? `
                        <button class="pagination-btn" data-page="${Number(meta.current_page) - 1}" type="button" ${meta.prev_page_url ? '' : 'disabled'}>Previous</button>
                        ${buttons}
                        <button class="pagination-btn" data-page="${Number(meta.current_page) + 1}" type="button" ${meta.next_page_url ? '' : 'disabled'}>Next</button>
                    ` : ''}
                    <div class="pagination-summary">Showing ${meta.from || 0}-${meta.to || 0} of ${meta.total || 0} orders</div>
                </div>
            `);

            document.querySelectorAll('.orders-pagination .pagination-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    const page = Number(button.dataset.page);
                    if (!page || page === currentPage) return;
                    if (activeOrderStatus === 'all') {
                        loadOrders(page);
                    } else {
                        renderFilteredStatusPage(page);
                    }
                });
            });
        }

        function statusClass(status) {
            const normalized = normalizeOrderStatus(status || 'partial');
            if (normalized === 'cancelled') return 'status-canceled';
            if (normalized === 'in_progress') return 'status-processing';
            if (normalized === 'partial') return 'status-processing';
            return `status-${normalized}`;
        }

        function normalizeOrderStatus(status) {
            const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (normalized === 'inprogress') return 'in_progress';
            if (normalized === 'canceled') return 'cancelled';
            return ['pending', 'in_progress', 'completed', 'partial', 'cancelled'].includes(normalized)
                ? normalized
                : 'pending';
        }

        function orderStatusLabel(status) {
            const normalized = normalizeOrderStatus(status);
            return {
                pending: 'Pending',
                in_progress: 'In progress',
                completed: 'Completed',
                partial: 'Partial',
                cancelled: 'Cancelled'
            }[normalized];
        }

        function orderStatusControl(order) {
            if (!isAdmin) {
                return `<span class="status-badge ${statusClass(order.status)}">${orderStatusLabel(order.status)}</span>`;
            }

            const normalized = normalizeOrderStatus(order.status);
            const options = orderStatuses.map((status) => `
                <option value="${status}" ${status === normalized ? 'selected' : ''}>${orderStatusLabel(status)}</option>
            `).join('');

            return `
                <select class="admin-status-select order-status-select" data-order-id="${escapeHtml(order.id)}" data-current-status="${normalized}">
                    ${options}
                </select>
            `;
        }

        async function updateOrderStatus(order, status) {
            const oldStatus = normalizeOrderStatus(order.status);
            const nextStatus = normalizeOrderStatus(status);
            const shouldDebitBalance = nextStatus === 'completed' && oldStatus !== 'completed';
            const shouldRefundBalance = nextStatus === 'cancelled' && oldStatus === 'completed';
            const charge = Number(order.charge || 0);
            const referralAction = shouldDebitBalance ? 'earn' : (shouldRefundBalance ? 'refund' : 'none');

            return apiRequestAny([
                '/api/update_order_status',
                '/api/updateorderstatus',
                '/api/update_order',
                '/api/updateorder'
            ], {
                method: 'POST',
                body: JSON.stringify({
                    id: order.id,
                    order_id: order.id,
                    user_id: order.user_id,
                    service_id: order.service_id,
                    charge,
                    amount: charge,
                    old_status: oldStatus,
                    status: nextStatus,
                    update_balance: shouldDebitBalance,
                    debit_balance: shouldDebitBalance,
                    refund_balance: shouldRefundBalance,
                    credit_balance: shouldRefundBalance,
                    balance_action: shouldDebitBalance ? 'debit' : (shouldRefundBalance ? 'refund' : 'none'),
                    update_referral: referralAction !== 'none',
                    referral_action: referralAction,
                    referral_source: 'order',
                    referral_order_id: order.id,
                    referral_amount: charge
                })
            });
        }

        async function syncOrderReferral(order, oldStatus, nextStatus) {
            const completedNow = nextStatus === 'completed' && oldStatus !== 'completed';
            const refundedNow = nextStatus === 'cancelled' && oldStatus === 'completed';
            if (!completedNow && !refundedNow) return;

            const charge = Number(order.charge || 0);

            await apiRequestAny([
                '/api/update_referral_earnings',
                '/api/referral_order_status',
                '/api/referral_order_completed',
                '/api/sync_referral_order'
            ], {
                method: 'POST',
                body: JSON.stringify({
                    order_id: order.id,
                    user_id: order.user_id,
                    client_id: order.user_id,
                    status: nextStatus,
                    old_status: oldStatus,
                    amount: charge,
                    charge,
                    action: completedNow ? 'earn' : 'refund',
                    source: 'order'
                })
            });
        }

        function bindOrderStatusSelects(orders) {
            if (!isAdmin) return;

            tbody.querySelectorAll('.order-status-select').forEach((select) => {
                select.addEventListener('change', async () => {
                    const order = orders.find((item) => String(item.id) === String(select.dataset.orderId));
                    const previousStatus = select.dataset.currentStatus || normalizeOrderStatus(order?.status);
                    const nextStatus = normalizeOrderStatus(select.value);
                    if (!order || nextStatus === previousStatus) return;

                    select.disabled = true;

                    try {
                        const data = await updateOrderStatus(order, nextStatus);
                        await syncOrderReferral(order, previousStatus, nextStatus).catch(() => {});
                        order.status = nextStatus;
                        select.dataset.currentStatus = nextStatus;
                        allOrdersCache = null;
                        await refreshCurrentFinancialState();
                        loadOrders(currentPage);
                        showAlert(data.message || 'Order status updated successfully.');
                    } catch (error) {
                        select.value = previousStatus;
                        showAlert(error.message);
                    } finally {
                        select.disabled = false;
                    }
                });
            });
        }

        function orderUserCell(order) {
            const user = order.user || {};
            const name = user.name || order.name || order.full_name || '';
            const username = user.username || order.username || '';
            const primary = name || username || (order.user_id ? `User ${order.user_id}` : '-');
            const secondary = username && username !== primary ? username : '';

            return `
                <div class="order-user">
                    <span class="order-user-name">${escapeHtml(primary)}</span>
                    ${secondary ? `<span class="order-user-username">${escapeHtml(secondary)}</span>` : ''}
                </div>
            `;
        }

        function renderOrderRows(orders = lastOrders) {
            tbody.innerHTML = orders.length ? '' : '<tr><td colspan="8" style="text-align:center;">No orders found.</td></tr>';
            orders.forEach((order) => {
                const created = new Date(order.created_at || Date.now());
                const serviceName = order.service?.name || `Service #${order.service_id || ''}`;
                tbody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td data-label="ID" class="order-id">${order.id}</td>
                        <td data-label="User">${orderUserCell(order)}</td>
                        <td data-label="Date">
                            <div class="order-date">${created.toLocaleDateString('en-IN')}</div>
                            <div class="order-date" style="opacity: 0.6;">${created.toLocaleTimeString('en-IN')}</div>
                        </td>
                        <td data-label="Link"><a href="${order.link || '#'}" class="order-link" target="_blank">${escapeHtml(order.link || '-')}</a></td>
                        <td data-label="Charge" class="order-charge">${formatMoney(order.charge)}</td>
                        <td data-label="Quantity">${order.quantity || 0}</td>
                        <td data-label="Service">${escapeHtml(serviceName)}</td>
                        <td data-label="Status">${orderStatusControl(order)}</td>
                    </tr>
                `);
            });
            bindOrderStatusSelects(orders);
        }

        function buildClientPaginationMeta(items, page) {
            const total = items.length;
            const lastPage = Math.max(1, Math.ceil(total / ordersPerPage));
            const safePage = Math.min(Math.max(1, page), lastPage);
            const from = total ? ((safePage - 1) * ordersPerPage) + 1 : 0;
            const to = Math.min(safePage * ordersPerPage, total);

            return {
                current_page: safePage,
                last_page: lastPage,
                from,
                to,
                total,
                prev_page_url: safePage > 1 ? '#' : null,
                next_page_url: safePage < lastPage ? '#' : null
            };
        }

        function sortOrdersAscending(orders) {
            return [...orders].sort((a, b) => {
                const aId = Number(a.id || 0);
                const bId = Number(b.id || 0);
                if (aId !== bId) return aId - bId;

                return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            });
        }

        async function loadAllOrders() {
            if (allOrdersCache) return allOrdersCache;

            const orders = await getAllPaginatedItems('/api/get_orders');
            allOrdersCache = sortOrdersAscending(
                isAdmin
                    ? orders
                    : orders.filter((order) => String(order.user_id) === String(currentUser.id))
            );
            return allOrdersCache;
        }

        async function renderFilteredStatusPage(page = 1) {
            currentPage = page;
            document.querySelector('.orders-pagination')?.remove();
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading orders...</td></tr>';

            try {
                const allOrders = await loadAllOrders();
                const filteredOrders = filterOrders(allOrders);
                const meta = buildClientPaginationMeta(filteredOrders, page);
                const start = (meta.current_page - 1) * ordersPerPage;
                const pageOrders = filteredOrders.slice(start, start + ordersPerPage);

                renderOrderRows(pageOrders);
                renderOrdersPagination(meta);
            } catch (error) {
                tbody.innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`;
            }
        }

        function filterOrders(orders) {
            return orders.filter((order) => {
                const statusMatches = activeOrderStatus === 'all'
                    || normalizeOrderStatus(order.status) === activeOrderStatus;
                const haystack = [
                    order.id,
                    order.link,
                    order.status,
                    order.service_id,
                    order.service?.name,
                    order.user?.name,
                    order.user?.username,
                    order.name,
                    order.username
                ].join(' ').toLowerCase();

                return statusMatches && (!orderSearchTerm || haystack.includes(orderSearchTerm));
            });
        }

        function loadOrders(page = 1) {
            renderFilteredStatusPage(page);
        }

        orderSearchInput?.addEventListener('input', () => {
            orderSearchTerm = orderSearchInput.value.trim().toLowerCase();
            if (orderSearchTerm || activeOrderStatus !== 'all') {
                renderFilteredStatusPage(1);
            } else {
                loadOrders(1);
            }
        });

        document.querySelectorAll('.filter-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                activeOrderStatus = normalizeOrderStatus(chip.dataset.status || chip.textContent);
                if (activeOrderStatus === 'all' && !orderSearchTerm) {
                    loadOrders(1);
                } else {
                    renderFilteredStatusPage(1);
                }
            });
        });

        loadOrders(1);
    }

    function initServices() {
        if (!/services\.html$/i.test(location.pathname)) return;

        const content = document.querySelector('.content');
        if (!content) return;

        const currentUser = getCurrentUser() || {};
        const isAdmin = String(currentUser.role || 'client').toLowerCase() === 'admin';
        const platformSelect = content.querySelector('.filter-select');
        const searchInput = content.querySelector('.search-input');
        const searchButton = content.querySelector('.btn-filter');
        const serviceCreateEndpoints = ['/api/create_service', '/api/createservice'];
        content.querySelectorAll('.service-category').forEach((node) => node.remove());
        content.querySelector('.services-pagination')?.remove();

        if (isAdmin && !document.getElementById('admin-service-form')) {
            if (!document.getElementById('admin-service-form-style')) {
                const style = document.createElement('style');
                style.id = 'admin-service-form-style';
                style.textContent = `
                    #admin-service-form {
                        display: grid;
                        grid-template-columns: repeat(4, minmax(0, 1fr));
                        gap: 16px;
                        padding: 24px;
                    }
                    #admin-service-form .full-row { grid-column: 1 / -1; }
                    @media (max-width: 1100px) {
                        #admin-service-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                    }
                    @media (max-width: 640px) {
                        #admin-service-form { grid-template-columns: 1fr; padding: 18px; }
                    }
                `;
                document.head.appendChild(style);
            }
            content.insertAdjacentHTML('afterbegin', `
                <div class="table-container" id="admin-service-card" style="margin-bottom: 32px;">
                    <form id="admin-service-form">
                        <input class="search-input" name="name" type="text" placeholder="Service name" required>
                        <select class="search-input" name="category_id" id="admin-service-category" required>
                            <option value="">Loading categories...</option>
                        </select>
                        <input class="search-input" name="platform" type="text" placeholder="Platform">
                        <input class="search-input" name="rate_per_1000" type="number" step="0.01" min="0" placeholder="Rate per 1000" required>
                        <input class="search-input" name="min_order" type="number" min="0" placeholder="Min order" required>
                        <input class="search-input" name="max_order" type="number" min="0" placeholder="Max order" required>
                        <input class="search-input" name="avg_time" type="text" placeholder="Average time">
                        <textarea class="search-input" name="description" placeholder="Description" style="min-height: 56px; resize: vertical;"></textarea>
                        <button class="btn-filter full-row" type="submit">Submit Service</button>
                    </form>
                </div>
            `);
        }

        content.insertAdjacentHTML('beforeend', `
            <div class="service-category" id="services-loading-state">
                <div class="table-container">
                    <table class="services-table">
                        <tbody><tr><td style="text-align:center; padding:48px;">Loading services...</td></tr></tbody>
                    </table>
                </div>
            </div>
        `);
        let currentPage = 1;
        let lastServices = [];
        let lastMeta = null;
        const loadedPlatforms = new Set();

        async function createService(payload) {
            let lastError = null;
            for (const endpoint of serviceCreateEndpoints) {
                try {
                    return await apiRequest(endpoint, {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error('Could not create service.');
        }

        async function loadAdminServiceCategories() {
            const categorySelect = document.getElementById('admin-service-category');
            if (!categorySelect) return;

            try {
                const categories = await getAllPaginatedItems('/api/get_categories');
                categorySelect.innerHTML = '<option value="">Select category</option>';

                categories
                    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                    .forEach((category) => {
                        categorySelect.insertAdjacentHTML(
                            'beforeend',
                            `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name || `Category #${category.id}`)}</option>`
                        );
                    });

                if (!categories.length) {
                    categorySelect.innerHTML = '<option value="">No categories found</option>';
                }
            } catch (error) {
                categorySelect.innerHTML = '<option value="">Could not load categories</option>';
                showAlert(error.message);
            }
        }

        function updatePlatformDropdown(services) {
            if (!platformSelect) return;

            services.forEach((service) => {
                const platform = service.platform || service.category?.platform;
                if (platform) loadedPlatforms.add(platform);
            });

            const selected = platformSelect.value || 'All Platforms';
            platformSelect.innerHTML = '<option>All Platforms</option>';
            Array.from(loadedPlatforms)
                .sort((a, b) => String(a).localeCompare(String(b)))
                .forEach((platform) => {
                    platformSelect.insertAdjacentHTML('beforeend', `<option>${escapeHtml(platform)}</option>`);
                });

            if (Array.from(platformSelect.options).some((option) => option.value === selected)) {
                platformSelect.value = selected;
            }
        }

        function loadAllPlatforms(firstPayload) {
            const meta = firstPayload?.data;
            const lastPage = Number(meta?.last_page || 1);

            updatePlatformDropdown(itemsFromPaginated(firstPayload));

            if (lastPage <= 1) return;

            const pageRequests = [];
            for (let page = 2; page <= lastPage; page += 1) {
                pageRequests.push(apiRequest(`/api/get_services?page=${page}`));
            }

            Promise.allSettled(pageRequests).then((results) => {
                results.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        updatePlatformDropdown(itemsFromPaginated(result.value));
                    }
                });
            });
        }

        function filteredServices(services) {
            const platform = platformSelect?.value || 'All Platforms';
            const search = (searchInput?.value || '').trim().toLowerCase();

            return services.filter((service) => {
                const matchesPlatform = platform === 'All Platforms'
                    || String(service.platform || service.category?.platform || '').toLowerCase() === platform.toLowerCase();
                const haystack = `${service.id} ${service.name || ''} ${service.category?.name || ''} ${service.platform || ''}`.toLowerCase();
                return matchesPlatform && (!search || haystack.includes(search));
            });
        }

        function renderPagination(meta) {
            content.querySelector('.services-pagination')?.remove();

            if (!meta || Number(meta.last_page || 1) <= 1) return;

            const pages = Array.from({ length: Number(meta.last_page) }, (_item, index) => index + 1);
            const buttons = pages.map((page) => `
                <button class="pagination-btn ${page === Number(meta.current_page) ? 'active' : ''}" data-page="${page}" type="button">${page}</button>
            `).join('');

            content.insertAdjacentHTML('beforeend', `
                <div class="services-pagination">
                    <button class="pagination-btn" data-page="${Number(meta.current_page) - 1}" type="button" ${meta.prev_page_url ? '' : 'disabled'}>Previous</button>
                    ${buttons}
                    <button class="pagination-btn" data-page="${Number(meta.current_page) + 1}" type="button" ${meta.next_page_url ? '' : 'disabled'}>Next</button>
                    <div class="pagination-summary">Showing ${meta.from || 0}-${meta.to || 0} of ${meta.total || 0} services</div>
                </div>
            `);

            content.querySelectorAll('.services-pagination .pagination-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    const page = Number(button.dataset.page);
                    if (page && page !== currentPage) loadServices(page);
                });
            });
        }

        function renderServices(services, meta) {
            const visibleServices = filteredServices(services);
            const grouped = visibleServices.reduce((acc, service) => {
                const categoryName = service.category?.name || 'Services';
                acc[categoryName] = acc[categoryName] || [];
                acc[categoryName].push(service);
                return acc;
            }, {});

            content.querySelectorAll('.service-category').forEach((node) => node.remove());
            content.querySelector('.services-pagination')?.remove();
            document.getElementById('services-loading-state')?.remove();

            if (!visibleServices.length) {
                content.insertAdjacentHTML('beforeend', `
                    <div class="service-category">
                        <div class="table-container">
                            <table class="services-table">
                                <tbody><tr><td style="text-align:center; padding:48px;">No services found.</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                `);
                renderPagination(meta);
                return;
            }

            Object.entries(grouped).forEach(([categoryName, rows]) => {
                content.insertAdjacentHTML('beforeend', `
                    <div class="service-category">
                        <div class="category-header"><h3>${escapeHtml(categoryName)}</h3></div>
                        <div class="table-container">
                            <table class="services-table">
                                <thead><tr><th>ID</th><th>Service Name</th><th>Rate/1K</th><th>Action</th></tr></thead>
                                <tbody>
                                    ${rows.map((service) => `
                                        <tr>
                                            <td class="service-id" data-label="ID">${service.id}</td>
                                            <td data-label="Service Name">
                                                <div class="title-row"><span class="service-name">${escapeHtml(service.name)}</span></div>
                                                <div class="badge-container">
                                                    <span class="badge-tag badge-gray min-max-tag">Min: ${service.min_order || 0}</span>
                                                    <span class="badge-tag badge-gray min-max-tag">Max: ${service.max_order || 0}</span>
                                                </div>
                                            </td>
                                            <td class="rate-cell" data-label="Rate/1K">${formatMoney(service.rate_per_1000)}</td>
                                            <td data-label="Action"><button class="btn-view" data-service-id="${service.id}" type="button">View</button></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `);
            });

            content.querySelectorAll('.btn-view[data-service-id]').forEach((button) => {
                button.addEventListener('click', () => {
                    const service = lastServices.find((item) => String(item.id) === String(button.dataset.serviceId));
                    if (!service) return;

                    showServiceModal(service);
                });
            });

            renderPagination(meta);
        }

        function showServiceModal(service) {
            const overlay = document.getElementById('modal-overlay');
            const title = document.getElementById('modal-title');
            const list = document.querySelector('.detail-list');
            const createOrderButton = document.querySelector('.btn-create-order');

            if (!overlay || !title || !list) {
                showAlert(service.description || service.name);
                return;
            }

            title.textContent = service.name || `Service #${service.id}`;
            list.innerHTML = `
                <li class="detail-item"><span class="detail-label">Service Name:</span> <span>${escapeHtml(service.name || '-')}</span></li>
                <li class="detail-item"><span class="detail-label">Category:</span> <span>${escapeHtml(service.category?.name || '-')}</span></li>
                <li class="detail-item"><span class="detail-label">Platform:</span> <span>${escapeHtml(service.platform || service.category?.platform || '-')}</span></li>
                <li class="detail-item"><span class="detail-label">Rate per 1000:</span> <span>${formatMoney(service.rate_per_1000)}</span></li>
                <li class="detail-item"><span class="detail-label">Minimum Order:</span> <span>${service.min_order || 0}</span></li>
                <li class="detail-item"><span class="detail-label">Maximum Order:</span> <span>${service.max_order || 0}</span></li>
                <li class="detail-item"><span class="detail-label">Average Time:</span> <span>${escapeHtml(service.avg_time || '-')}</span></li>
                <li class="detail-item"><span class="detail-label">Description:</span> <span>${escapeHtml(service.description || '-')}</span></li>
            `;

            if (createOrderButton) {
                createOrderButton.onclick = () => {
                    window.location.href = `dashboard.html?service_id=${encodeURIComponent(service.id)}`;
                };
            }

            overlay.classList.add('active');
            overlay.style.display = 'flex';
        }

        window.showServiceModal = showServiceModal;

        function loadServices(page = 1) {
            currentPage = page;
            apiRequest(`/api/get_services?page=${page}`).then((payload) => {
                lastServices = itemsFromPaginated(payload);
                lastMeta = payload.data;
                if (page === 1 && loadedPlatforms.size === 0) {
                    loadAllPlatforms(payload);
                } else {
                    updatePlatformDropdown(lastServices);
                }
                renderServices(lastServices, lastMeta);
            }).catch(showAlert);
        }

        searchButton?.addEventListener('click', () => renderServices(lastServices, lastMeta));
        searchInput?.addEventListener('input', () => renderServices(lastServices, lastMeta));
        searchInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') renderServices(lastServices, lastMeta);
        });
        platformSelect?.addEventListener('change', () => renderServices(lastServices, lastMeta));
        if (isAdmin) loadAdminServiceCategories();

        document.getElementById('admin-service-form')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!isAdmin) return;

            const form = event.currentTarget;
            const button = form.querySelector('button[type="submit"]');
            const formData = new FormData(form);
            const payload = Object.fromEntries(formData.entries());

            payload.category_id = Number(payload.category_id || 0);
            payload.rate_per_1000 = Number(payload.rate_per_1000 || 0);
            payload.min_order = Number(payload.min_order || 0);
            payload.max_order = Number(payload.max_order || 0);

            button.disabled = true;
            button.textContent = 'Submitting...';

            try {
                const data = await createService({
                    ...payload,
                    service_name: payload.name,
                    rate: payload.rate_per_1000
                });
                showAlert(data.message || 'Service created successfully.');
                form.reset();
                loadedPlatforms.clear();
                loadServices(1);
            } catch (error) {
                showAlert(error.message);
            } finally {
                button.disabled = false;
                button.textContent = 'Submit Service';
            }
        });

        loadServices(1);
    }

    function initAddFunds() {
        if (!/addfund\.html$/i.test(location.pathname)) return;

        const paymentBody = document.getElementById('payment-history-body');
        const paymentPagination = document.getElementById('payment-pagination');
        let currentPaymentPage = 1;
        let allPaymentsCache = null;
        const paymentsPerPage = 10;
        const currentUser = getCurrentUser() || {};
        const isAdmin = String(currentUser.role || 'client').toLowerCase() === 'admin';
        const paymentStatuses = ['pending', 'approved', 'cancelled'];

        if (isAdmin) {
            ensureAdminStatusSelectStyle();
            document.querySelector('.main-grid')?.remove();
            const paymentHistory = document.querySelector('.payment-history-card');
            if (paymentHistory) paymentHistory.style.marginTop = '0';
        }

        function paymentStatusClass(status) {
            const normalized = normalizePaymentStatus(status);
            if (normalized === 'approved') return 'status-success';
            if (normalized === 'cancelled') return 'status-failed';
            if (normalized === 'partial') return 'status-partial';
            return 'status-pending';
        }

        function normalizePaymentStatus(status) {
            const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (['approved', 'success', 'successful', 'completed', 'paid'].includes(normalized)) return 'approved';
            if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
            if (normalized === 'partial') return 'partial';
            return ['pending', 'approved', 'cancelled', 'partial'].includes(normalized) ? normalized : 'pending';
        }

        function paymentStatusLabel(status) {
            return {
                approved: 'Approved',
                pending: 'Pending',
                cancelled: 'Cancelled',
                partial: 'Partial'
            }[normalizePaymentStatus(status)];
        }

        function paymentStatusControl(payment) {
            if (!isAdmin) {
                return `<span class="status-badge ${paymentStatusClass(payment.status)}">${paymentStatusLabel(payment.status)}</span>`;
            }

            const normalized = normalizePaymentStatus(payment.status);
            const options = paymentStatuses.map((status) => `
                <option value="${status}" ${status === normalized ? 'selected' : ''}>${paymentStatusLabel(status)}</option>
            `).join('');

            return `
                <select class="admin-status-select payment-status-select" data-payment-id="${escapeHtml(payment.id)}" data-current-status="${normalized}">
                    ${options}
                </select>
            `;
        }

        async function updatePaymentStatus(payment, status) {
            const oldStatus = normalizePaymentStatus(payment.status);
            const nextStatus = normalizePaymentStatus(status);
            const amount = Number(payment.amount || 0);
            const shouldCreditBalance = nextStatus === 'approved' && oldStatus !== 'approved';
            const shouldDebitBalance = nextStatus === 'cancelled' && oldStatus === 'approved';

            return apiRequestAny([
                '/api/update_payment_status',
                '/api/updatepaymentstatus',
                '/api/update_payment',
                '/api/updatepayment'
            ], {
                method: 'POST',
                body: JSON.stringify({
                    id: payment.id,
                    payment_id: payment.id,
                    user_id: payment.user_id,
                    amount,
                    old_status: oldStatus,
                    status: nextStatus,
                    update_balance: shouldCreditBalance || shouldDebitBalance,
                    credit_balance: shouldCreditBalance,
                    debit_balance: shouldDebitBalance,
                    balance_action: shouldCreditBalance ? 'credit' : (shouldDebitBalance ? 'debit' : 'none')
                })
            });
        }

        function bindPaymentStatusSelects(payments) {
            if (!isAdmin) return;

            paymentBody.querySelectorAll('.payment-status-select').forEach((select) => {
                select.addEventListener('change', async () => {
                    const payment = payments.find((item) => String(item.id) === String(select.dataset.paymentId));
                    const previousStatus = select.dataset.currentStatus || normalizePaymentStatus(payment?.status);
                    const nextStatus = normalizePaymentStatus(select.value);
                    if (!payment || nextStatus === previousStatus) return;

                    select.disabled = true;

                    try {
                        const data = await updatePaymentStatus(payment, nextStatus);
                        payment.status = nextStatus;
                        select.dataset.currentStatus = nextStatus;
                        allPaymentsCache = null;
                        await refreshCurrentFinancialState();
                        loadPayments(currentPaymentPage);
                        showAlert(data.message || 'Payment status updated successfully.');
                    } catch (error) {
                        select.value = previousStatus;
                        showAlert(error.message);
                    } finally {
                        select.disabled = false;
                    }
                });
            });
        }

        function renderPaymentPagination(meta) {
            if (!paymentPagination) return;

            if (!meta) {
                paymentPagination.innerHTML = '';
                return;
            }

            const pages = Array.from({ length: Number(meta.last_page || 1) }, (_item, index) => index + 1);
            const buttons = pages.map((page) => `
                <button class="pagination-btn ${page === Number(meta.current_page) ? 'active' : ''}" data-page="${page}" type="button">${page}</button>
            `).join('');

            paymentPagination.innerHTML = `
                <button class="pagination-btn" data-page="${Number(meta.current_page) - 1}" type="button" ${meta.prev_page_url ? '' : 'disabled'}>Previous</button>
                ${buttons}
                <button class="pagination-btn" data-page="${Number(meta.current_page) + 1}" type="button" ${meta.next_page_url ? '' : 'disabled'}>Next</button>
                <div class="pagination-summary">Showing ${meta.from || 0}-${meta.to || 0} of ${meta.total || 0} payments</div>
            `;

            paymentPagination.querySelectorAll('.pagination-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    const page = Number(button.dataset.page);
                    if (page && page !== currentPaymentPage) loadPayments(page);
                });
            });
        }

        function buildPaymentPaginationMeta(items, page) {
            const total = items.length;
            const lastPage = Math.max(1, Math.ceil(total / paymentsPerPage));
            const safePage = Math.min(Math.max(1, page), lastPage);
            const from = total ? ((safePage - 1) * paymentsPerPage) + 1 : 0;
            const to = Math.min(safePage * paymentsPerPage, total);

            return {
                current_page: safePage,
                last_page: lastPage,
                from,
                to,
                total,
                prev_page_url: safePage > 1 ? '#' : null,
                next_page_url: safePage < lastPage ? '#' : null
            };
        }

        function sortPaymentsAscending(payments) {
            return [...payments].sort((a, b) => {
                const aId = Number(a.id || 0);
                const bId = Number(b.id || 0);
                if (aId !== bId) return aId - bId;

                return new Date(a.created_at || 0) - new Date(b.created_at || 0);
            });
        }

        function paymentUserCell(payment) {
            const user = payment.user || payment._user || {};
            const name = user.name || user.username || payment.name || payment.username || (payment.user_id ? `User ${payment.user_id}` : '-');
            const username = user.username || payment.username || '';

            return `
                <div class="payment-user">
                    <span class="payment-user-name">${escapeHtml(name)}</span>
                    ${username && username !== name ? `<span class="payment-user-username">${escapeHtml(username)}</span>` : ''}
                </div>
            `;
        }

        async function attachPaymentUsers(payments) {
            if (!isAdmin) {
                return payments.map((payment) => ({ ...payment, _user: currentUser }));
            }

            const needsUserLookup = payments.some((payment) => payment.user_id && !payment.user);
            if (!needsUserLookup) return payments;

            try {
                const users = await getAllPaginatedItems('/api/get_users');
                const userMap = new Map(users.map((user) => [String(user.id), user]));

                return payments.map((payment) => ({
                    ...payment,
                    _user: payment.user || userMap.get(String(payment.user_id)) || null
                }));
            } catch (_error) {
                return payments;
            }
        }

        async function loadAllPayments() {
            if (allPaymentsCache) return allPaymentsCache;

            const userId = currentUserId();
            const payments = await getAllPaginatedItems('/api/get_payments');
            const visiblePayments = sortPaymentsAscending(
                isAdmin
                    ? payments
                    : payments.filter((payment) => !userId || String(payment.user_id) === String(userId))
            );
            allPaymentsCache = await attachPaymentUsers(visiblePayments);

            return allPaymentsCache;
        }

        function renderPayments(payments) {
            if (!paymentBody) return;

            paymentBody.innerHTML = payments.length ? '' : '<tr><td colspan="7" style="text-align:center;">No payments found.</td></tr>';
            payments.forEach((payment) => {
                const created = new Date(payment.created_at || Date.now());
                paymentBody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td>${payment.id}</td>
                        <td>${paymentUserCell(payment)}</td>
                        <td>${created.toLocaleDateString('en-IN')} ${created.toLocaleTimeString('en-IN')}</td>
                        <td>${formatMoney(payment.amount)}</td>
                        <td>${escapeHtml(payment.method || '-')}</td>
                        <td>${escapeHtml(payment.phone || '-')}</td>
                        <td>${paymentStatusControl(payment)}</td>
                    </tr>
                `);
            });
            bindPaymentStatusSelects(payments);
        }

        function loadPayments(page = 1) {
            if (!paymentBody) return;
            currentPaymentPage = page;
            paymentBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading payments...</td></tr>';
            renderPaymentPagination(null);

            loadAllPayments().then((payments) => {
                const meta = buildPaymentPaginationMeta(payments, page);
                const start = (meta.current_page - 1) * paymentsPerPage;
                const pagePayments = payments.slice(start, start + paymentsPerPage);

                renderPayments(pagePayments);
                renderPaymentPagination(meta);
            }).catch((error) => {
                paymentBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${escapeHtml(error.message)}</td></tr>`;
            });
        }

        window.handlePay = async function () {
            if (isAdmin) return;

            const amount = document.getElementById('amount')?.value;
            const phone = document.getElementById('phone')?.value;
            const method = document.getElementById('method')?.value;
            const userId = currentUserId();

            if (!userId) {
                showAlert('Please login before adding funds.');
                window.location.href = 'index.html';
                return;
            }

            if (!amount || Number(amount) < 10) {
                showAlert('Please enter a valid amount.');
                return;
            }

            if (!phone || phone.length < 10) {
                showAlert('Please enter a valid phone number.');
                return;
            }

            try {
                const data = await apiRequest('/api/create_payment', {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: userId,
                        amount,
                        method,
                        phone,
                        status: 'pending',
                        update_balance: false,
                        credit_balance: false,
                        balance_action: 'none'
                    })
                });
                const payment = data.data || {};
                saveAuth(data);
                totalFundsPromise = null;
                if (data.user?.balance !== undefined) updateBalanceCards(data.user.balance);
                document.getElementById('s-amount').textContent = formatMoney(amount);
                document.getElementById('s-id').textContent = `ID ${payment.id || Date.now()}`;
                document.getElementById('s-method').textContent = method;
                document.getElementById('s-phone').textContent = phone;
                document.getElementById('s-date').textContent = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
                const card = document.getElementById('summaryCard');
                card.style.display = 'block';
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showAlert(data.message || 'Payment request created successfully.');
                document.getElementById('amount').value = '';
                document.getElementById('phone').value = '';
                document.querySelectorAll('.q-pill').forEach((pill) => pill.classList.remove('active'));
                allPaymentsCache = null;
                loadPayments(1);
            } catch (error) {
                showAlert(error.message);
            }
        };

        loadPayments(1);
    }

    function initSupportForms() {
        if (!/(contact|support)\.html$/i.test(location.pathname)) return;

        const currentUser = getCurrentUser() || {};
        const isAdmin = String(currentUser.role || 'client').toLowerCase() === 'admin';
        const form = document.querySelector('.support-form-card form');
        let supportTicketsController = null;

        if (isAdmin && /support\.html$/i.test(location.pathname)) {
            initSupportTicketsTable({ adminView: true });
            return;
        }

        if (!form) return;

        if (/support\.html$/i.test(location.pathname)) {
            supportTicketsController = initSupportTicketsTable({ adminView: false });
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const fields = form.querySelectorAll('input, select, textarea');
            const userId = currentUserId();

            try {
                const data = await apiRequest('/api/createsupporttickets', {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: userId || null,
                        full_name: fields[0]?.value.trim(),
                        email: fields[1]?.value.trim(),
                        order_id: fields[2]?.value.trim() || null,
                        status: fields[3]?.value || 'open',
                        subject: fields[4]?.value,
                        message: fields[5]?.value.trim()
                    })
                });
                showAlert(data.message || 'Support ticket created successfully.');
                form.reset();
                supportTicketsController?.reload?.();
            } catch (error) {
                showAlert(error.message);
            }
        });
    }

    function initSupportTicketsTable({ adminView = false } = {}) {
        const content = document.querySelector('.content');
        if (!content) return null;

        const endpoints = ['/api/getsupporttickets', '/api/get_support_tickets', '/api/supporttickets'];
        let tickets = [];
        let currentPage = 1;
        const rowsPerPage = 10;
        const currentUser = getCurrentUser() || {};
        const userId = currentUserId();

        const tableMarkup = `
            <div class="table-container" style="grid-column: 1 / -1; background: var(--white); border: 1px solid var(--border); border-radius: 28px; box-shadow: var(--shadow-lg); overflow: hidden;">
                <table class="support-ticket-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="padding: 18px; text-align: left; color: var(--secondary); border-bottom: 1px solid var(--border);">ID</th>
                            <th style="padding: 18px; text-align: left; color: var(--secondary); border-bottom: 1px solid var(--border);">Name</th>
                            <th style="padding: 18px; text-align: left; color: var(--secondary); border-bottom: 1px solid var(--border);">Email</th>
                            <th style="padding: 18px; text-align: left; color: var(--secondary); border-bottom: 1px solid var(--border);">Order ID</th>
                            <th style="padding: 18px; text-align: left; color: var(--secondary); border-bottom: 1px solid var(--border);">Subject</th>
                            <th style="padding: 18px; text-align: left; color: var(--secondary); border-bottom: 1px solid var(--border);">Status</th>
                            <th style="padding: 18px; text-align: left; color: var(--secondary); border-bottom: 1px solid var(--border);">Message</th>
                            <th style="padding: 18px; text-align: left; color: var(--secondary); border-bottom: 1px solid var(--border);">Created</th>
                        </tr>
                    </thead>
                    <tbody id="support-tickets-body">
                        <tr><td colspan="8" style="padding: 48px; text-align: center;">Loading support tickets...</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="updates-pagination" id="support-tickets-pagination" style="grid-column: 1 / -1;"></div>
        `;

        if (adminView) {
            content.innerHTML = tableMarkup;
        } else if (!document.getElementById('support-tickets-body')) {
            content.insertAdjacentHTML('beforeend', tableMarkup);
        }

        const tableBody = document.getElementById('support-tickets-body');
        const pagination = document.getElementById('support-tickets-pagination');
        if (!tableBody || !pagination) return null;

        function itemsFromPayload(payload) {
            const data = payload?.data ?? payload;
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data?.support_tickets)) return data.support_tickets;
            if (Array.isArray(data?.tickets)) return data.tickets;
            if (Array.isArray(data)) return data;
            return [];
        }

        function lastPageFromPayload(payload) {
            return Number(payload?.data?.last_page || payload?.last_page || 1);
        }

        function formatDate(value) {
            if (!value) return '-';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return String(value);
            return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
        }

        function ticketValue(ticket, ...keys) {
            for (const key of keys) {
                if (ticket?.[key] !== undefined && ticket[key] !== null && ticket[key] !== '') return ticket[key];
            }
            return '-';
        }

        function renderPagination(totalItems) {
            const lastPage = Math.max(1, Math.ceil(totalItems / rowsPerPage));
            const safePage = Math.min(Math.max(1, currentPage), lastPage);
            const from = totalItems ? ((safePage - 1) * rowsPerPage) + 1 : 0;
            const to = Math.min(safePage * rowsPerPage, totalItems);
            currentPage = safePage;

            if (totalItems <= rowsPerPage) {
                pagination.innerHTML = totalItems ? `<div class="pagination-summary">Showing ${from}-${to} of ${totalItems} tickets</div>` : '';
                return;
            }

            const pages = Array.from(new Set([1, lastPage, safePage - 1, safePage, safePage + 1]))
                .filter((page) => page >= 1 && page <= lastPage)
                .sort((a, b) => a - b);
            let previousPage = 0;
            const pageButtons = pages.map((page) => {
                const ellipsis = page - previousPage > 1 ? '<span class="pagination-ellipsis">...</span>' : '';
                previousPage = page;
                return `${ellipsis}<button class="pagination-btn ${page === safePage ? 'active' : ''}" type="button" data-page="${page}">${page}</button>`;
            }).join('');

            pagination.innerHTML = `
                <button class="pagination-btn" type="button" data-page="${safePage - 1}" ${safePage <= 1 ? 'disabled' : ''}>Previous</button>
                ${pageButtons}
                <button class="pagination-btn" type="button" data-page="${safePage + 1}" ${safePage >= lastPage ? 'disabled' : ''}>Next</button>
                <div class="pagination-summary">Showing ${from}-${to} of ${totalItems} tickets</div>
            `;

            pagination.querySelectorAll('.pagination-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    const page = Number(button.dataset.page);
                    if (!page || page === currentPage) return;
                    currentPage = page;
                    renderTickets();
                });
            });
        }

        function renderTickets() {
            const start = (currentPage - 1) * rowsPerPage;
            const pageItems = tickets.slice(start, start + rowsPerPage);

            if (!pageItems.length) {
                tableBody.innerHTML = '<tr><td colspan="8" style="padding: 48px; text-align: center;">No support tickets found.</td></tr>';
                pagination.innerHTML = '';
                return;
            }

            tableBody.innerHTML = pageItems.map((ticket) => `
                <tr>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border);">${escapeHtml(ticketValue(ticket, 'id', 'ticket_id'))}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border);">${escapeHtml(ticketValue(ticket, 'full_name', 'name', 'username'))}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border);">${escapeHtml(ticketValue(ticket, 'email'))}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border);">${escapeHtml(ticketValue(ticket, 'order_id'))}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border);">${escapeHtml(ticketValue(ticket, 'subject'))}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border);">${escapeHtml(ticketValue(ticket, 'status'))}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border); max-width: 320px;">${escapeHtml(ticketValue(ticket, 'message', 'description'))}</td>
                    <td style="padding: 16px; border-bottom: 1px solid var(--border);">${escapeHtml(formatDate(ticketValue(ticket, 'created_at', 'created_date', 'date')))}</td>
                </tr>
            `).join('');

            renderPagination(tickets.length);
        }

        async function requestTickets(path) {
            const firstPayload = await apiRequest(path);
            const firstItems = itemsFromPayload(firstPayload);
            const lastPage = lastPageFromPayload(firstPayload);
            const requests = [];

            for (let page = 2; page <= lastPage; page += 1) {
                const separator = path.includes('?') ? '&' : '?';
                requests.push(apiRequest(`${path}${separator}page=${page}`));
            }

            const results = await Promise.allSettled(requests);
            const restItems = results.flatMap((result) => (
                result.status === 'fulfilled' ? itemsFromPayload(result.value) : []
            ));

            return [...firstItems, ...restItems];
        }

        async function loadTickets() {
            tableBody.innerHTML = '<tr><td colspan="8" style="padding: 48px; text-align: center;">Loading support tickets...</td></tr>';
            pagination.innerHTML = '';
            let lastError = null;
            for (const endpoint of endpoints) {
                try {
                    const rows = await requestTickets(endpoint);
                    tickets = rows
                        .filter((ticket) => {
                            if (adminView) return true;
                            const ticketUserId = ticket.user_id || ticket.user?.id || ticket.client_id || '';
                            const ticketEmail = ticket.email || ticket.user?.email || '';
                            return (userId && String(ticketUserId) === String(userId))
                                || (currentUser.email && String(ticketEmail).toLowerCase() === String(currentUser.email).toLowerCase());
                        })
                        .sort((a, b) => Number(a.id || a.ticket_id || 0) - Number(b.id || b.ticket_id || 0));
                    currentPage = 1;
                    renderTickets();
                    return;
                } catch (error) {
                    lastError = error;
                }
            }

            tableBody.innerHTML = `<tr><td colspan="8" style="padding: 48px; text-align: center;">${escapeHtml(lastError?.message || 'Could not load support tickets.')}</td></tr>`;
            pagination.innerHTML = '';
        }

        loadTickets();
        return { reload: loadTickets };
    }

    function initMassOrders() {
        if (!/mass-orders\.html$/i.test(location.pathname)) return;

        const button = document.querySelector('.mass-order-card .btn-submit');
        const textarea = document.querySelector('.mass-textarea');
        const tableBody = document.getElementById('mass-orders-table-body');
        const pagination = document.getElementById('mass-orders-pagination');
        if (!button || !textarea) return;

        const rowsPerPage = 10;
        const currentUser = getCurrentUser() || {};
        const isAdmin = String(currentUser.role || 'client').toLowerCase() === 'admin';
        const massOrderStatuses = ['partial', 'pending', 'processing', 'completed'];
        let massOrders = [];
        let currentPage = 1;

        if (isAdmin) {
            ensureAdminStatusSelectStyle();
            document.querySelector('.mass-order-card')?.remove();
        }

        function formatDate(value) {
            const date = new Date(value || Date.now());
            if (Number.isNaN(date.getTime())) return '-';
            return date.toISOString().slice(0, 10);
        }

        function formatUser(item) {
            return item.user?.name || item.user?.username || item.username || item.user_id || '-';
        }

        function statusClass(status) {
            const normalized = normalizeMassOrderStatus(status);
            if (normalized === 'completed') return 'status-completed';
            if (normalized === 'processing' || normalized === 'partial') return 'status-processing';
            if (['failed', 'cancelled', 'canceled', 'rejected'].includes(normalized)) return 'status-failed';
            return 'status-pending';
        }

        function normalizeMassOrderStatus(status) {
            const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (['complete', 'success'].includes(normalized)) return 'completed';
            if (['in_progress', 'inprogress', 'process'].includes(normalized)) return 'processing';
            return massOrderStatuses.includes(normalized) ? normalized : 'pending';
        }

        function massOrderStatusLabel(status) {
            const normalized = normalizeMassOrderStatus(status);
            return {
                partial: 'Partial',
                pending: 'Pending',
                processing: 'Processing',
                completed: 'Completed'
            }[normalized];
        }

        function massOrderStatusControl(item) {
            if (!isAdmin) {
                return `<span class="status-badge ${statusClass(item.status)}">${massOrderStatusLabel(item.status)}</span>`;
            }

            const normalized = normalizeMassOrderStatus(item.status);
            const options = massOrderStatuses.map((status) => `
                <option value="${status}" ${status === normalized ? 'selected' : ''}>${massOrderStatusLabel(status)}</option>
            `).join('');

            return `
                <select class="admin-status-select mass-order-status-select" data-mass-order-id="${escapeHtml(item.id)}" data-current-status="${normalized}">
                    ${options}
                </select>
            `;
        }

        async function updateMassOrderStatus(item, status) {
            const nextStatus = normalizeMassOrderStatus(status);

            return apiRequest('/api/update_mass_order_status', {
                method: 'POST',
                body: JSON.stringify({
                    id: item.id,
                    mass_order_id: item.id,
                    user_id: item.user_id,
                    old_status: normalizeMassOrderStatus(item.status),
                    status: nextStatus
                })
            });
        }

        function bindMassOrderStatusSelects(items) {
            if (!isAdmin) return;

            tableBody.querySelectorAll('.mass-order-status-select').forEach((select) => {
                select.addEventListener('change', async () => {
                    const item = items.find((row) => String(row.id) === String(select.dataset.massOrderId));
                    const previousStatus = select.dataset.currentStatus || normalizeMassOrderStatus(item?.status);
                    const nextStatus = normalizeMassOrderStatus(select.value);
                    if (!item || nextStatus === previousStatus) return;

                    select.disabled = true;

                    try {
                        const data = await updateMassOrderStatus(item, nextStatus);
                        item.status = nextStatus;
                        select.dataset.currentStatus = nextStatus;
                        await loadMassOrders();
                        showAlert(data.message || 'Mass order status updated successfully.');
                    } catch (error) {
                        select.value = previousStatus;
                        showAlert(error.message);
                    } finally {
                        select.disabled = false;
                    }
                });
            });
        }

        function renderPagination(totalItems, page) {
            if (!pagination) return;

            const lastPage = Math.max(1, Math.ceil(totalItems / rowsPerPage));
            const safePage = Math.min(Math.max(1, page), lastPage);
            const from = totalItems ? ((safePage - 1) * rowsPerPage) + 1 : 0;
            const to = Math.min(safePage * rowsPerPage, totalItems);

            if (!totalItems) {
                pagination.innerHTML = '';
                return;
            }

            if (totalItems <= rowsPerPage) {
                pagination.innerHTML = `<div class="pagination-summary">Showing ${from}-${to} of ${totalItems} mass orders</div>`;
                return;
            }

            const pages = Array.from({ length: lastPage }, (_item, index) => index + 1);
            pagination.innerHTML = `
                <button class="pagination-btn" type="button" data-page="${safePage - 1}" ${safePage <= 1 ? 'disabled' : ''}>Previous</button>
                ${pages.map((pageNumber) => `
                    <button class="pagination-btn ${pageNumber === safePage ? 'active' : ''}" type="button" data-page="${pageNumber}">${pageNumber}</button>
                `).join('')}
                <button class="pagination-btn" type="button" data-page="${safePage + 1}" ${safePage >= lastPage ? 'disabled' : ''}>Next</button>
                <div class="pagination-summary">Showing ${from}-${to} of ${totalItems} mass orders</div>
            `;

            pagination.querySelectorAll('.pagination-btn').forEach((pageButton) => {
                pageButton.addEventListener('click', () => {
                    const nextPage = Number(pageButton.dataset.page);
                    if (!nextPage || nextPage === currentPage) return;
                    currentPage = nextPage;
                    renderMassOrders();
                });
            });
        }

        function renderMassOrders() {
            if (!tableBody) return;

            const lastPage = Math.max(1, Math.ceil(massOrders.length / rowsPerPage));
            currentPage = Math.min(Math.max(1, currentPage), lastPage);
            const start = (currentPage - 1) * rowsPerPage;
            const pageItems = massOrders.slice(start, start + rowsPerPage);

            if (!pageItems.length) {
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:48px;">No mass orders found.</td></tr>';
                renderPagination(massOrders.length, currentPage);
                return;
            }

            tableBody.innerHTML = pageItems.map((item) => `
                <tr>
                    <td data-label="ID"><span class="mass-order-id">${escapeHtml(item.id || '-')}</span></td>
                    <td data-label="User">${escapeHtml(formatUser(item))}</td>
                    <td data-label="Raw Input" class="mass-raw-input">${escapeHtml(item.raw_input || '-')}</td>
                    <td data-label="Status">${massOrderStatusControl(item)}</td>
                    <td data-label="Created Date">${escapeHtml(formatDate(item.created_at))}</td>
                </tr>
            `).join('');
            bindMassOrderStatusSelects(pageItems);

            renderPagination(massOrders.length, currentPage);
        }

        async function loadMassOrders() {
            if (!tableBody) return;

            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:48px;">Loading mass orders...</td></tr>';
            try {
                const rows = await getAllPaginatedItems('/api/getmassorder');
                massOrders = rows
                    .filter((item) => isAdmin || String(item.user_id) === String(currentUser.id))
                    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
                renderMassOrders();
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:48px;">${escapeHtml(error.message)}</td></tr>`;
                if (pagination) pagination.innerHTML = '';
            }
        }

        button.addEventListener('click', async () => {
            if (isAdmin) return;

            const userId = currentUserId();
            if (!userId) {
                showAlert('Please login before creating mass orders.');
                window.location.href = 'index.html';
                return;
            }

            if (!textarea.value.trim()) {
                showAlert('Please enter at least one order line.');
                return;
            }

            try {
                const data = await apiRequest('/api/createmassorder', {
                    method: 'POST',
                    body: JSON.stringify({ user_id: userId, raw_input: textarea.value.trim() })
                });
                showAlert(data.message || 'Mass order created successfully.');
                textarea.value = '';
                currentPage = 1;
                await loadMassOrders();
            } catch (error) {
                showAlert(error.message);
            }
        });

        loadMassOrders();
    }

    function initReferral() {
        if (!/referral\.html$/i.test(location.pathname)) return;

        const referralLink = document.getElementById('referral-link');
        const copyButton = document.getElementById('copy-referral-link');
        const payoutForm = document.getElementById('payout-request-form');
        const payoutAmountInput = document.getElementById('payout-amount');
        const payoutButton = document.getElementById('request-payout-btn');
        const payoutBody = document.getElementById('payout-history-body') || document.querySelector('.payout-table tbody');
        const payoutPagination = document.getElementById('payout-pagination');
        const payoutsPerPage = 10;
        let payoutRows = [];
        let currentPayoutPage = 1;
        let currentReferralLink = '';
        let availablePayoutAmount = 0;
        let minimumPayoutAmount = 0;

        function setText(id, value) {
            const node = document.getElementById(id);
            if (node) node.textContent = value;
        }

        function pick(...values) {
            return values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
        }

        function setMoneyIfFound(id, ...values) {
            const value = pick(...values);
            if (value === '') return;
            setText(id, formatMoney(value));
        }

        function normalizeRows(value) {
            if (Array.isArray(value)) return value;
            if (Array.isArray(value?.data)) return value.data;
            if (Array.isArray(value?.items)) return value.items;
            return [];
        }

        function sortRowsById(rows) {
            return [...rows].sort((a, b) => {
                const aId = Number(a.id || a.payout_id || a.withdrawal_id || 0);
                const bId = Number(b.id || b.payout_id || b.withdrawal_id || 0);
                if (aId !== bId) return aId - bId;

                return new Date(a.created_at || a.payout_date || a.date || 0)
                    - new Date(b.created_at || b.payout_date || b.date || 0);
            });
        }

        function referralDashboardPath() {
            const userId = currentUserId();
            return userId
                ? `/api/referral_dashboard?user_id=${encodeURIComponent(userId)}`
                : '/api/referral_dashboard';
        }

        function buildFallbackReferralLink(data) {
            const user = getCurrentUser() || {};
            const code = pick(data.referral_code, data.code, user.referral_code, user.username, user.id, currentUserId());
            if (!code) return '';
            return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}signup.html?ref=${encodeURIComponent(code)}`;
        }

        function normalizeReferralLink(value, data) {
            const fallback = buildFallbackReferralLink(data);
            const rawLink = value || fallback;
            if (!rawLink) return '';

            try {
                const url = new URL(rawLink, window.location.href);
                const isLocalHost = ['127.0.0.1', 'localhost'].includes(url.hostname);

                if (isLocalHost && ['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
                    const currentFolder = window.location.pathname.replace(/[^/]*$/, '');
                    const refCode = pick(
                        url.searchParams.get('ref'),
                        data.referral_code,
                        data.code,
                        currentUserId()
                    );
                    return `${window.location.origin}${currentFolder}signup.html${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`;
                }

                return url.href;
            } catch (_error) {
                return fallback || rawLink;
            }
        }

        function statusClass(status) {
            return String(status || 'pending').trim().toLowerCase().replace(/[\s_]+/g, '-');
        }

        function formatPayoutDate(value) {
            if (!value) return '-';
            const text = String(value);
            const dateOnly = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
            if (dateOnly) return dateOnly;

            const date = new Date(text);
            if (Number.isNaN(date.getTime())) return text;

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function renderEmptyPayouts(message = 'No payout history found.') {
            if (!payoutBody) return;
            payoutBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; padding:60px; color: var(--secondary-light);">
                        ${escapeHtml(message)}
                    </td>
                </tr>
            `;
            if (payoutPagination) payoutPagination.innerHTML = '';
        }

        function renderPayoutPagination(totalItems, page) {
            if (!payoutPagination) return;

            const lastPage = Math.max(1, Math.ceil(totalItems / payoutsPerPage));
            const safePage = Math.min(Math.max(1, page), lastPage);
            const from = totalItems ? ((safePage - 1) * payoutsPerPage) + 1 : 0;
            const to = Math.min(safePage * payoutsPerPage, totalItems);

            if (!totalItems) {
                payoutPagination.innerHTML = '';
                return;
            }

            const pages = Array.from({ length: lastPage }, (_item, index) => index + 1);
            payoutPagination.innerHTML = `
                <button class="pagination-btn" type="button" data-page="${safePage - 1}" ${safePage <= 1 ? 'disabled' : ''}>Previous</button>
                ${pages.map((pageNumber) => `
                    <button class="pagination-btn ${pageNumber === safePage ? 'active' : ''}" type="button" data-page="${pageNumber}">${pageNumber}</button>
                `).join('')}
                <button class="pagination-btn" type="button" data-page="${safePage + 1}" ${safePage >= lastPage ? 'disabled' : ''}>Next</button>
                <div class="pagination-summary">Showing ${from}-${to} of ${totalItems} payouts</div>
            `;

            payoutPagination.querySelectorAll('.pagination-btn').forEach((button) => {
                button.addEventListener('click', () => {
                    const nextPage = Number(button.dataset.page);
                    if (!nextPage || nextPage === currentPayoutPage) return;
                    renderPayoutsPage(nextPage);
                });
            });
        }

        function renderPayoutsPage(page = 1) {
            if (!payoutBody) return;
            if (!payoutRows.length) {
                renderEmptyPayouts();
                return;
            }

            const lastPage = Math.max(1, Math.ceil(payoutRows.length / payoutsPerPage));
            currentPayoutPage = Math.min(Math.max(1, page), lastPage);
            const start = (currentPayoutPage - 1) * payoutsPerPage;
            const pageRows = payoutRows.slice(start, start + payoutsPerPage);

            payoutBody.innerHTML = pageRows.map((payout) => {
                const id = pick(payout.id, payout.payout_id, payout.withdrawal_id, '-');
                const date = pick(payout.payout_date, payout.date, payout.created_at, '-');
                const amount = pick(payout.amount, payout.payout_amount, payout.total, 0);
                const status = pick(payout.status, payout.payout_status, 'pending');

                return `
                    <tr>
                        <td data-label="ID">${escapeHtml(id)}</td>
                        <td data-label="Payout date">${escapeHtml(formatPayoutDate(date))}</td>
                        <td data-label="Payout amount">${formatMoney(amount)}</td>
                        <td data-label="Payout status">
                            <span class="payout-status ${escapeHtml(statusClass(status))}">${escapeHtml(status)}</span>
                        </td>
                    </tr>
                `;
            }).join('');

            renderPayoutPagination(payoutRows.length, currentPayoutPage);
        }

        function renderPayouts(rows) {
            payoutRows = sortRowsById(rows);
            currentPayoutPage = 1;
            renderPayoutsPage(currentPayoutPage);
        }

        function payoutAmountFromData(data) {
            return Number(pick(
                data.available_earnings,
                data.available_commission,
                data.available_referral_earnings,
                data.referral_available_earnings,
                data.referral_available_commission,
                data.withdrawable_earnings,
                data.withdrawable_commission,
                data.pending_amount,
                data.withdrawable_amount,
                data.payable_amount,
                0
            ) || 0);
        }

        function minimumPayoutFromData(data) {
            return Number(pick(data.minimum_payout, data.min_payout, 0) || 0);
        }

        async function loadReferralDashboard() {
            const payload = await apiRequest(referralDashboardPath());
            const rawData = payload.data || payload || {};
            const data = { ...rawData, ...(rawData.stats || {}), ...(rawData.summary || {}) };

            availablePayoutAmount = payoutAmountFromData(data);
            minimumPayoutAmount = minimumPayoutFromData(data);

            currentReferralLink = normalizeReferralLink(pick(data.referral_link, data.link, data.url), data);
            if (referralLink) referralLink.textContent = currentReferralLink || 'Referral link not available';

            setText('commission-rate', `${Number(pick(data.commission_rate, data.commission, 0)).toFixed(2).replace(/\.00$/, '')}%`);
            setText('minimum-payout', formatMoney(minimumPayoutAmount));
            setText('referral-visits', pick(data.visits, data.clicks, 0));
            setText('referral-registrations', pick(data.registrations, data.signups, data.registered_users, 0));
            setText('referral-count', pick(data.referrals, data.total_referrals, data.referral_count, 0));
            setText('conversion-rate', `${Number(pick(data.conversion_rate, 0)).toFixed(2)}%`);
            setMoneyIfFound('total-earnings',
                data.total_earnings,
                data.earned_total,
                data.total_commission,
                data.total_referral_earnings,
                data.referral_total_earnings,
                data.referral_total_commission,
                data.referral_earnings,
                data.earnings,
                data.earned
            );
            setText('available-earnings', formatMoney(availablePayoutAmount));

            renderPayouts(normalizeRows(pick(data.payout_history, data.payouts, data.withdrawals, [])));
        }

        if (copyButton) {
            copyButton.addEventListener('click', () => {
                if (!currentReferralLink) {
                    showAlert('Referral link is still loading.');
                    return;
                }

                navigator.clipboard.writeText(currentReferralLink)
                    .then(() => showAlert('Referral link copied.'))
                    .catch(() => showAlert('Could not copy referral link.'));
            });
        }

        if (payoutForm) {
            payoutForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                const userId = currentUserId();
                const amount = Number(payoutAmountInput?.value || 0);

                if (!userId) {
                    showAlert('Please login before requesting payout.');
                    window.location.href = 'index.html';
                    return;
                }

                if (!amount || amount <= 0) {
                    showAlert('Please enter a valid payout amount.');
                    return;
                }

                if (minimumPayoutAmount && amount < minimumPayoutAmount) {
                    showAlert(`Minimum payout amount is ${formatMoney(minimumPayoutAmount)}.`);
                    return;
                }

                if (amount > availablePayoutAmount) {
                    showAlert('Payout amount cannot be greater than available earnings.');
                    return;
                }

                if (payoutButton) {
                    payoutButton.disabled = true;
                    payoutButton.textContent = 'Requesting...';
                }

                try {
                    const data = await apiRequest('/api/create_payout', {
                        method: 'POST',
                        body: JSON.stringify({
                            user_id: userId,
                            amount,
                            status: 'success'
                        })
                    });

                    saveAuth(data);
                    if (data.user?.balance !== undefined) updateBalanceCards(data.user.balance);
                    showAlert(data.message || 'Payout request created successfully.');
                    if (payoutAmountInput) payoutAmountInput.value = '';
                    await loadReferralDashboard();
                } catch (error) {
                    showAlert(error.message);
                } finally {
                    if (payoutButton) {
                        payoutButton.disabled = false;
                        payoutButton.textContent = 'Request payout';
                    }
                }
            });
        }

        renderEmptyPayouts('Loading payout history...');
        loadReferralDashboard().catch((error) => {
            if (referralLink) referralLink.textContent = 'Unable to load referral link';
            renderEmptyPayouts(error.message);
            showAlert(error.message);
        });
    }

    window.SmmApi = {
        apiRequest,
        getToken,
        getCurrentUser,
        getAllPaginatedItems,
        saveAuth,
        formatMoney
    };

    document.addEventListener('DOMContentLoaded', () => {
        initPublicPageMode();
        updateRoleNavigation();
        initTotalFundsDisplay();
        initDashboardUser();
        initSignup();
        initDashboardOrderForm();
        initOrders();
        initServices();
        initAddFunds();
        initSupportForms();
        initMassOrders();
        initReferral();
    });
})();
