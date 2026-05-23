(function () {
    const API_BASE_URL = window.SMM_API_BASE_URL || 'http://127.0.0.1:8000';

    function normalizePhone(value) {
        return String(value || '').replace(/[^\d]/g, '');
    }

    function whatsappLinks() {
        return Array.from(document.querySelectorAll('a[href*="wa.me/"]'));
    }

    function itemsFromPayload(payload) {
        return payload?.data?.data || payload?.data || [];
    }

    async function apiRequest(path) {
        const response = await fetch(`${API_BASE_URL}${path}`, {
            headers: { Accept: 'application/json' }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.status === false) {
            throw new Error(data.error || data.message || 'Could not load WhatsApp widget.');
        }

        return data;
    }

    async function loadWidget() {
        const firstPayload = await apiRequest('/api/getwhatsappwidgets');
        const firstItems = itemsFromPayload(firstPayload);
        const lastPage = Number(firstPayload.data?.last_page || 1);
        const pageRequests = [];

        for (let page = 2; page <= lastPage; page += 1) {
            pageRequests.push(apiRequest(`/api/getwhatsappwidgets?page=${page}`));
        }

        const results = await Promise.allSettled(pageRequests);
        const restItems = results.flatMap((result) => (
            result.status === 'fulfilled' ? itemsFromPayload(result.value) : []
        ));
        const widgets = [...firstItems, ...restItems];

        return widgets.find((widget) => widget.is_active !== false && String(widget.is_active) !== '0');
    }

    function applyWidget(widget) {
        const links = whatsappLinks();
        if (!links.length) return;

        if (!widget) return;

        const phone = normalizePhone(widget.phone_number);
        if (!phone) return;

        const message = String(widget.greeting_message || '').trim();
        const href = message
            ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
            : `https://wa.me/${phone}`;

        links.forEach((link) => {
            link.href = href;
            link.style.display = '';
        });

        window.SmmWhatsAppWidget = { widget, href };
    }

    function initWhatsAppWidget() {
        loadWidget()
            .then(applyWidget)
            .catch((error) => {
                window.SmmWhatsAppWidget = { error: error.message };
                // Keep the hardcoded fallback links if the backend is unavailable.
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhatsAppWidget);
    } else {
        initWhatsAppWidget();
    }
})();
