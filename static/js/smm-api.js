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

        button.addEventListener('click', async (event) => {
            event.preventDefault();

            const username = document.getElementById('fullname')?.value.trim();
            const email = document.getElementById('email')?.value.trim();
            const password = document.getElementById('password')?.value;
            const confirmPassword = document.getElementById('confirm-password')?.value;

            if (!username || !email || !password || !confirmPassword) {
                showAlert('Please fill all fields.');
                return;
            }

            if (password !== confirmPassword) {
                showAlert('Passwords do not match.');
                return;
            }

            button.disabled = true;
            button.textContent = 'Creating...';

            try {
                await apiRequest('/api/sign_up', {
                    method: 'POST',
                    body: JSON.stringify({ username, email, password })
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
                const data = await apiRequest('/api/create_order', {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: userId,
                        service_id: service.id,
                        link,
                        quantity,
                        charge: ((quantity * Number(service.rate_per_1000 || 0)) / 1000).toFixed(2)
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
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Loading orders...</td></tr>';

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
            const normalized = normalizeOrderStatus(status || 'pending');
            if (normalized === 'cancelled') return 'status-canceled';
            if (normalized === 'in_progress') return 'status-processing';
            return `status-${normalized}`;
        }

        function normalizeOrderStatus(status) {
            const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (normalized === 'inprogress') return 'in_progress';
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

        function renderOrderRows(orders = lastOrders) {
            tbody.innerHTML = orders.length ? '' : '<tr><td colspan="9" style="text-align:center;">No orders found.</td></tr>';
            orders.forEach((order) => {
                const created = new Date(order.created_at || Date.now());
                const serviceName = order.service?.name || `Service #${order.service_id || ''}`;
                tbody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td data-label="ID" class="order-id">${order.id}</td>
                        <td data-label="Date">
                            <div class="order-date">${created.toLocaleDateString('en-IN')}</div>
                            <div class="order-date" style="opacity: 0.6;">${created.toLocaleTimeString('en-IN')}</div>
                        </td>
                        <td data-label="Link"><a href="${order.link || '#'}" class="order-link" target="_blank">${escapeHtml(order.link || '-')}</a></td>
                        <td data-label="Charge" class="order-charge">${formatMoney(order.charge)}</td>
                        <td data-label="Start Count">${order.start_count || 0}</td>
                        <td data-label="Quantity">${order.quantity || 0}</td>
                        <td data-label="Service">${escapeHtml(serviceName)}</td>
                        <td data-label="Status"><span class="status-badge ${statusClass(order.status)}">${orderStatusLabel(order.status)}</span></td>
                        <td data-label="Remains">${order.remains || 0}</td>
                    </tr>
                `);
            });
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

        async function loadAllOrders() {
            if (allOrdersCache) return allOrdersCache;

            allOrdersCache = await getAllPaginatedItems('/api/get_orders');
            return allOrdersCache;
        }

        async function renderFilteredStatusPage(page = 1) {
            currentPage = page;
            document.querySelector('.orders-pagination')?.remove();
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Loading orders...</td></tr>';

            try {
                const allOrders = await loadAllOrders();
                const filteredOrders = filterOrders(allOrders);
                const meta = buildClientPaginationMeta(filteredOrders, page);
                const start = (meta.current_page - 1) * ordersPerPage;
                const pageOrders = filteredOrders.slice(start, start + ordersPerPage);

                renderOrderRows(pageOrders);
                renderOrdersPagination(meta);
            } catch (error) {
                tbody.innerHTML = `<tr><td colspan="9">${error.message}</td></tr>`;
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
                    order.user?.username,
                    order.user?.email
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

        const platformSelect = content.querySelector('.filter-select');
        const searchInput = content.querySelector('.search-input');
        const searchButton = content.querySelector('.btn-filter');
        content.querySelectorAll('.service-category').forEach((node) => node.remove());
        content.querySelector('.services-pagination')?.remove();
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

        loadServices(1);
    }

    function initAddFunds() {
        if (!/addfund\.html$/i.test(location.pathname)) return;

        const paymentBody = document.getElementById('payment-history-body');
        const paymentPagination = document.getElementById('payment-pagination');
        let currentPaymentPage = 1;
        let allPaymentsCache = null;
        const paymentsPerPage = 10;

        function paymentStatusClass(status) {
            const normalized = normalizePaymentStatus(status);
            if (normalized === 'success') return 'status-success';
            if (normalized === 'failed') return 'status-failed';
            return 'status-pending';
        }

        function normalizePaymentStatus(status) {
            const normalized = String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (['success', 'successful', 'completed', 'paid'].includes(normalized)) return 'success';
            if (['failed', 'rejected', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
            return 'pending';
        }

        function paymentStatusLabel(status) {
            return {
                success: 'Success',
                pending: 'Pending',
                failed: 'Failed'
            }[normalizePaymentStatus(status)];
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

        async function loadAllPayments() {
            if (allPaymentsCache) return allPaymentsCache;

            const userId = currentUserId();
            const payments = await getAllPaginatedItems('/api/get_payments');
            allPaymentsCache = payments.filter((payment) => !userId || String(payment.user_id) === String(userId));

            return allPaymentsCache;
        }

        function renderPayments(payments) {
            if (!paymentBody) return;

            paymentBody.innerHTML = payments.length ? '' : '<tr><td colspan="6" style="text-align:center;">No payments found.</td></tr>';
            payments.forEach((payment) => {
                const created = new Date(payment.created_at || Date.now());
                paymentBody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td>${payment.id}</td>
                        <td>${created.toLocaleDateString('en-IN')} ${created.toLocaleTimeString('en-IN')}</td>
                        <td>${formatMoney(payment.amount)}</td>
                        <td>${escapeHtml(payment.method || '-')}</td>
                        <td>${escapeHtml(payment.phone || '-')}</td>
                        <td><span class="status-badge ${paymentStatusClass(payment.status)}">${paymentStatusLabel(payment.status)}</span></td>
                    </tr>
                `);
            });
        }

        function loadPayments(page = 1) {
            if (!paymentBody) return;
            currentPaymentPage = page;
            paymentBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading payments...</td></tr>';
            renderPaymentPagination(null);

            loadAllPayments().then((payments) => {
                const meta = buildPaymentPaginationMeta(payments, page);
                const start = (meta.current_page - 1) * paymentsPerPage;
                const pagePayments = payments.slice(start, start + paymentsPerPage);

                renderPayments(pagePayments);
                renderPaymentPagination(meta);
            }).catch((error) => {
                paymentBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${escapeHtml(error.message)}</td></tr>`;
            });
        }

        window.handlePay = async function () {
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
                    body: JSON.stringify({ user_id: userId, amount, method, phone, status: 'pending' })
                });
                const payment = data.data || {};
                saveAuth(data);
                totalFundsPromise = null;
                if (data.user?.balance !== undefined) updateBalanceCards(data.user.balance);
                document.getElementById('s-amount').textContent = formatMoney(amount);
                document.getElementById('s-id').textContent = `#${payment.id || Date.now()}`;
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

        const form = document.querySelector('.support-form-card form');
        if (!form) return;

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
            } catch (error) {
                showAlert(error.message);
            }
        });
    }

    function initMassOrders() {
        if (!/mass-orders\.html$/i.test(location.pathname)) return;

        const button = document.querySelector('.mass-order-card .btn-submit');
        const textarea = document.querySelector('.mass-textarea');
        const tableBody = document.getElementById('mass-orders-table-body');
        const pagination = document.getElementById('mass-orders-pagination');
        if (!button || !textarea) return;

        const rowsPerPage = 10;
        let massOrders = [];
        let currentPage = 1;

        function formatDate(value) {
            const date = new Date(value || Date.now());
            if (Number.isNaN(date.getTime())) return '-';
            return date.toISOString().slice(0, 10);
        }

        function formatUser(item) {
            return item.user?.username || item.user?.name || item.user?.email || item.user_id || '-';
        }

        function statusClass(status) {
            const normalized = String(status || 'pending').trim().toLowerCase();
            if (['completed', 'complete', 'success'].includes(normalized)) return 'status-completed';
            if (['failed', 'cancelled', 'canceled', 'rejected'].includes(normalized)) return 'status-failed';
            return 'status-pending';
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
                    <td data-label="Status"><span class="status-badge ${statusClass(item.status)}">${escapeHtml(item.status || 'pending')}</span></td>
                    <td data-label="Created Date">${escapeHtml(formatDate(item.created_at))}</td>
                </tr>
            `).join('');

            renderPagination(massOrders.length, currentPage);
        }

        async function loadMassOrders() {
            if (!tableBody) return;

            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:48px;">Loading mass orders...</td></tr>';
            try {
                massOrders = (await getAllPaginatedItems('/api/getmassorder'))
                    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
                renderMassOrders();
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:48px;">${escapeHtml(error.message)}</td></tr>`;
                if (pagination) pagination.innerHTML = '';
            }
        }

        button.addEventListener('click', async () => {
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
        const payoutBody = document.getElementById('payout-history-body') || document.querySelector('.payout-table tbody');
        let currentReferralLink = '';

        function setText(id, value) {
            const node = document.getElementById(id);
            if (node) node.textContent = value;
        }

        function pick(...values) {
            return values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
        }

        function normalizeRows(value) {
            if (Array.isArray(value)) return value;
            if (Array.isArray(value?.data)) return value.data;
            if (Array.isArray(value?.items)) return value.items;
            return [];
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

        function renderEmptyPayouts(message = 'No payout history found.') {
            if (!payoutBody) return;
            payoutBody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align:center; padding:60px; color: var(--secondary-light);">
                        ${escapeHtml(message)}
                    </td>
                </tr>
            `;
        }

        function renderPayouts(rows) {
            if (!payoutBody) return;
            if (!rows.length) {
                renderEmptyPayouts();
                return;
            }

            payoutBody.innerHTML = rows.map((payout) => {
                const date = pick(payout.payout_date, payout.date, payout.created_at, '-');
                const amount = pick(payout.amount, payout.payout_amount, payout.total, 0);
                const status = pick(payout.status, payout.payout_status, 'pending');

                return `
                    <tr>
                        <td data-label="Payout date">${escapeHtml(date)}</td>
                        <td data-label="Payout amount">${formatMoney(amount)}</td>
                        <td data-label="Payout status">
                            <span class="payout-status ${escapeHtml(statusClass(status))}">${escapeHtml(status)}</span>
                        </td>
                    </tr>
                `;
            }).join('');
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

        renderEmptyPayouts('Loading payout history...');

        apiRequest('/api/referral_dashboard').then((payload) => {
            const data = payload.data || payload || {};
            getTotalFundsAmount()
                .then(updateBalanceCards)
                .catch(() => updateBalanceCards(pick(data.balance, data.available_balance, 0)));

            currentReferralLink = normalizeReferralLink(pick(data.referral_link, data.link, data.url), data);
            if (referralLink) referralLink.textContent = currentReferralLink || 'Referral link not available';

            setText('commission-rate', `${Number(pick(data.commission_rate, data.commission, 0)).toFixed(2).replace(/\.00$/, '')}%`);
            setText('minimum-payout', formatMoney(pick(data.minimum_payout, data.min_payout, 0)));
            setText('referral-visits', pick(data.visits, data.clicks, 0));
            setText('referral-registrations', pick(data.registrations, data.signups, data.registered_users, 0));
            setText('referral-count', pick(data.referrals, data.total_referrals, data.referral_count, 0));
            setText('conversion-rate', `${Number(pick(data.conversion_rate, 0)).toFixed(2)}%`);
            setText('total-earnings', formatMoney(pick(data.total_earnings, data.earned_total, 0)));
            setText('available-earnings', formatMoney(pick(data.available_earnings, data.available_commission, data.pending_amount, 0)));

            renderPayouts(normalizeRows(pick(data.payout_history, data.payouts, data.withdrawals, [])));
        }).catch((error) => {
            if (referralLink) referralLink.textContent = 'Unable to load referral link';
            renderEmptyPayouts(error.message);
            showAlert(error.message);
        });
    }

    window.SmmApi = {
        apiRequest,
        getToken,
        getCurrentUser,
        saveAuth,
        formatMoney
    };

    document.addEventListener('DOMContentLoaded', () => {
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
