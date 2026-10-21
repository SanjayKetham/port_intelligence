/* ═══════════════════════════════════════════════════════════════
   Aiqon Port Congestion Intelligence — Application Logic
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = '';  // Same origin

// ─── Lucide Icons Engine ───────────────────────────────────────────────────

function renderLucideIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try {
            window.lucide.createIcons();
        } catch (e) {
            console.error('Error creating Lucide icons:', e);
        }
    }
}

// Auto-run on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderLucideIcons);
} else {
    renderLucideIcons();
}

// ─── State ─────────────────────────────────────────────────────────────────

let statsData = null;
let portsData = null;
let chartsInitialized = false;

// ─── Theme Management (White & Black) ──────────────────────────────────────

let currentTheme = localStorage.getItem('aiqon_theme') || 'white';

let chartTheme = {
    fontColor: '#52525b',
    gridColor: 'rgba(0, 0, 0, 0.06)',
    tooltipBg: 'rgba(9, 9, 11, 0.95)',
    tooltipTitle: '#ffffff',
    tooltipBody: '#d4d4d8'
};

function applyTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('aiqon_theme', theme);
    
    const sunIcons = document.querySelectorAll('.theme-icon-sun, #themeIconSun');
    const moonIcons = document.querySelectorAll('.theme-icon-moon, #themeIconMoon');
    
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        sunIcons.forEach(icon => icon.style.display = 'none');
        moonIcons.forEach(icon => icon.style.display = 'block');
        chartTheme.fontColor = '#a1a1aa';
        chartTheme.gridColor = 'rgba(255, 255, 255, 0.08)';
        chartTheme.tooltipBg = 'rgba(24, 24, 27, 0.95)';
        chartTheme.tooltipTitle = '#fafafa';
        chartTheme.tooltipBody = '#a1a1aa';
    } else {
        document.documentElement.removeAttribute('data-theme');
        sunIcons.forEach(icon => icon.style.display = 'block');
        moonIcons.forEach(icon => icon.style.display = 'none');
        chartTheme.fontColor = '#52525b';
        chartTheme.gridColor = 'rgba(0, 0, 0, 0.06)';
        chartTheme.tooltipBg = 'rgba(9, 9, 11, 0.95)';
        chartTheme.tooltipTitle = '#ffffff';
        chartTheme.tooltipBody = '#d4d4d8';
    }

    if (chartsInitialized && statsData) {
        initCharts(statsData);
    }
}

function toggleTheme() {
    const nextTheme = currentTheme === 'white' ? 'dark' : 'white';
    applyTheme(nextTheme);
    showToast(`Switched to ${nextTheme === 'white' ? 'White & Black' : 'Obsidian Black'} theme`, 'info');
}

// ─── View Management (Landing Page vs Operations Dashboard) ────────────────

function showLandingView() {
    const landingView = document.getElementById('landingView');
    const dashboardView = document.getElementById('dashboardView');
    if (landingView) {
        landingView.classList.add('active-view');
        landingView.style.display = 'block';
    }
    if (dashboardView) {
        dashboardView.classList.remove('active-view');
        dashboardView.style.display = 'none';
    }
    renderLucideIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboardView(targetSection = 'dashboard') {
    const landingView = document.getElementById('landingView');
    const dashboardView = document.getElementById('dashboardView');
    if (landingView) {
        landingView.classList.remove('active-view');
        landingView.style.display = 'none';
    }
    if (dashboardView) {
        dashboardView.classList.add('active-view');
        dashboardView.style.display = 'flex';
    }
    updateAuthUI(currentUser);
    switchSection(targetSection);
    renderLucideIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function launchDashboardClick() {
    if (currentUser && authToken) {
        showDashboardView('dashboard');
    } else {
        openAuthModal('login');
    }
}

function scrollToElement(elementId, event) {
    if (event) event.preventDefault();
    const el = document.getElementById(elementId);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
    }
}

// ─── Authentication State & Logic ──────────────────────────────────────────

let currentUser = null;
let authToken = localStorage.getItem('aiqon_token') || null;

async function checkAuthSession() {
    if (!authToken) {
        updateAuthUI(null);
        showLandingView();
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            localStorage.setItem('aiqon_user', JSON.stringify(currentUser));
            updateAuthUI(currentUser);
            showDashboardView('dashboard');
        } else {
            logoutUser(false);
        }
    } catch (e) {
        const cached = localStorage.getItem('aiqon_user');
        if (cached) {
            try {
                currentUser = JSON.parse(cached);
                updateAuthUI(currentUser);
                showDashboardView('dashboard');
            } catch (err) {
                showLandingView();
            }
        } else {
            showLandingView();
        }
    }
}

function updateAuthUI(user) {
    const avatarEl = document.getElementById('navUserAvatar');
    const nameEl = document.getElementById('navUserName');
    const roleEl = document.getElementById('navUserRole');
    
    if (user) {
        if (avatarEl) avatarEl.textContent = (user.name || 'U').charAt(0).toUpperCase();
        if (nameEl) nameEl.textContent = user.name || 'User';
        if (roleEl) roleEl.textContent = user.role || 'Operator';
    } else {
        if (nameEl) nameEl.textContent = 'Guest User';
        if (roleEl) roleEl.textContent = 'Observer';
    }
}

function openAuthModal(tab = 'login') {
    const backdrop = document.getElementById('authModalBackdrop');
    if (backdrop) backdrop.classList.add('active');
    switchAuthTab(tab);
    clearAuthAlerts();
}

function closeAuthModal() {
    const backdrop = document.getElementById('authModalBackdrop');
    if (backdrop) backdrop.classList.remove('active');
    clearAuthAlerts();
}

function handleBackdropClick(e) {
    if (e.target.id === 'authModalBackdrop') {
        closeAuthModal();
    }
}

function switchAuthTab(tab) {
    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    if (!tabLogin || !tabSignup || !loginForm || !signupForm) return;
    
    if (tab === 'login') {
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
    } else {
        tabLogin.classList.remove('active');
        tabSignup.classList.add('active');
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
    }
    clearAuthAlerts();
}

function clearAuthAlerts() {
    const logErr = document.getElementById('loginError');
    const signErr = document.getElementById('signupError');
    if (logErr) logErr.style.display = 'none';
    if (signErr) signErr.style.display = 'none';
}

let pendingRedirectSection = null;

function promptLoginToDetect(e) {
    if (e && e.preventDefault) e.preventDefault();
    pendingRedirectSection = 'predict';
    openAuthModal('login');
    showToast('Please sign in or use 1-click demo to run real-time Congestion Detection', 'info');
}

function toggleFaq(btn) {
    const item = btn.closest('.faq-item');
    if (!item) return;
    const wasActive = item.classList.contains('active');
    
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
    
    if (!wasActive) {
        item.classList.add('active');
    }
}

async function loginWithDemo(targetSection = 'dashboard') {
    const email = 'admin@aiqon.io';
    const password = 'admin123';
    showToast('Connecting instant demo account (Captain Sanjay)...', 'info');
    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Demo login failed');
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('aiqon_token', authToken);
        localStorage.setItem('aiqon_user', JSON.stringify(currentUser));
        closeAuthModal();
        const sectionToOpen = pendingRedirectSection || targetSection || 'dashboard';
        pendingRedirectSection = null;
        showDashboardView(sectionToOpen);
        showToast(`Welcome back, Captain Sanjay! ${sectionToOpen === 'predict' ? 'Congestion Detection ready.' : 'Operations Dashboard unlocked.'}`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    const errBox = document.getElementById('loginError');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Signing In...';
    btn.disabled = true;
    errBox.style.display = 'none';
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to authenticate');
        
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('aiqon_token', authToken);
        localStorage.setItem('aiqon_user', JSON.stringify(currentUser));
        closeAuthModal();
        const sectionToOpen = pendingRedirectSection || 'dashboard';
        pendingRedirectSection = null;
        showDashboardView(sectionToOpen);
        showToast(`Welcome back, ${currentUser.name}! Operations Dashboard unlocked.`, 'success');
    } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function handleSignupSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('signupSubmitBtn');
    const errBox = document.getElementById('signupError');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Creating Account...';
    btn.disabled = true;
    errBox.style.display = 'none';
    
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    
    try {
        const res = await fetch(`${API_BASE}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create account');
        
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('aiqon_token', authToken);
        localStorage.setItem('aiqon_user', JSON.stringify(currentUser));
        closeAuthModal();
        const sectionToOpen = pendingRedirectSection || 'dashboard';
        pendingRedirectSection = null;
        showDashboardView(sectionToOpen);
        showToast(`Account created! Welcome, ${currentUser.name}! Operations Dashboard unlocked.`, 'success');
    } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function logoutUser(showNotification = true) {
    if (authToken) {
        try {
            await fetch(`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
        } catch (e) {}
    }
    authToken = null;
    currentUser = null;
    localStorage.removeItem('aiqon_token');
    localStorage.removeItem('aiqon_user');
    updateAuthUI(null);
    showLandingView();
    if (showNotification) showToast('You have been signed out to the landing page', 'info');
}

// ─── Sidenav Drawer Controller ─────────────────────────────────────────────

function toggleSidenav(forceState) {
    const sidenav = document.getElementById('dashSidenav');
    const backdrop = document.getElementById('sidenavBackdrop');
    if (!sidenav) return;
    const isOpen = forceState !== undefined ? forceState : !sidenav.classList.contains('open');
    if (isOpen) {
        sidenav.classList.add('open');
        if (backdrop) backdrop.classList.add('active');
    } else {
        sidenav.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
    }
}

// ─── Navigation ────────────────────────────────────────────────────────────

function switchSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        section.style.animation = 'none';
        section.offsetHeight; // Trigger reflow
        section.style.animation = 'fadeIn 0.35s ease';
    }
    
    document.querySelectorAll(`.nav-link[data-section="${sectionId}"]`).forEach(l => l.classList.add('active'));
    
    const titleMap = {
        dashboard: 'Operations Command Center',
        predict: 'Congestion Detection Engine',
        analytics: 'Port & Fleet Analytics',
        model: 'Model Architecture & Explainability'
    };
    const topbarTitle = document.getElementById('topbarActiveSection');
    if (topbarTitle && titleMap[sectionId]) {
        topbarTitle.textContent = titleMap[sectionId];
    }
    
    // Close mobile sidenav if open
    toggleSidenav(false);
    
    // Initialize charts when analytics is first viewed
    if (sectionId === 'analytics' && !chartsInitialized && statsData) {
        initCharts(statsData);
        chartsInitialized = true;
    }
    
    renderLucideIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Handle nav clicks
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection(link.dataset.section);
    });
});

// ─── Toast Notifications ───────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ─── Number Animation ──────────────────────────────────────────────────────

function animateNumber(element, target, suffix = '', duration = 1000) {
    if (!element) return;
    const start = 0;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (target - start) * easeOut);
        element.textContent = current + suffix;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// ─── Range Slider Labels ──────────────────────────────────────────────────

function updateRangeLabel(input) {
    const valueEl = document.getElementById(input.id + 'Val');
    if (valueEl) {
        valueEl.textContent = input.value + '%';
    }
}

// ─── Data Loading ──────────────────────────────────────────────────────────

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        if (!response.ok) throw new Error('Failed to load stats');
        statsData = await response.json();
        updateDashboardKPIs(statsData);
        updateModelCards(statsData);
        return statsData;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadPorts() {
    try {
        const response = await fetch(`${API_BASE}/api/ports`);
        if (!response.ok) throw new Error('Failed to load ports');
        portsData = await response.json();
        renderPortGrid(portsData);
        renderLandingRadar(portsData);
        return portsData;
    } catch (error) {
        console.error('Error loading ports:', error);
    }
}

// ─── Update Dashboard KPIs ─────────────────────────────────────────────────

function updateDashboardKPIs(stats) {
    const accEl = document.getElementById('kpiAccVal');
    const congEl = document.getElementById('kpiCongRate');
    
    if (stats.model_performance && stats.model_performance.ensemble) {
        const acc = Math.round(stats.model_performance.ensemble.accuracy * 100);
        animateNumber(accEl, acc, '%');
    }
    
    if (stats.dataset) {
        const rate = Math.round(stats.dataset.congestion_rate * 100);
        animateNumber(congEl, rate, '%');
    }
    
    // Animate static target numbers
    document.querySelectorAll('.kpi-value[data-target]').forEach(el => {
        animateNumber(el, parseInt(el.dataset.target));
    });
}

// ─── Operational Live Telemetry Datasets ───────────────────────────────────

const LIVE_VESSELS = [
    { name: 'Ever Golden', type: 'Container', imo: 'IMO 9811000', port: 'Port of Shanghai', flag: 'PA', dwt: '198,000 DWT', cargo: '20,124 TEU', eta: 'In Port (Berth 4)', status: 'Critical', risk: 'critical', delay: '14.2h', action: 'Queue Priority Tier 1' },
    { name: 'Maersk Mc-Kinney', type: 'Container', imo: 'IMO 9619907', port: 'Port of Rotterdam', flag: 'DK', dwt: '194,849 DWT', cargo: '18,270 TEU', eta: 'Approaching (2h)', status: 'High Risk', risk: 'high', delay: '8.5h', action: 'Hold at Outer Anchorage' },
    { name: 'MSC Oscar', type: 'Container', imo: 'IMO 9703291', port: 'Port of Singapore', flag: 'PA', dwt: '197,362 DWT', cargo: '19,224 TEU', eta: 'In Port (Berth 12)', status: 'Moderate', risk: 'medium', delay: '6.1h', action: 'Expedited Discharge' },
    { name: 'Cosco Universe', type: 'Container', imo: 'IMO 9795610', port: 'Port of Los Angeles', flag: 'HK', dwt: '199,000 DWT', cargo: '21,237 TEU', eta: 'Anchorage Waiting', status: 'Critical', risk: 'critical', delay: '18.4h', action: 'Reroute to Pier 300' },
    { name: 'Nordic Orion', type: 'Bulk Carrier', imo: 'IMO 9529463', port: 'Port of Santos', flag: 'LR', dwt: '75,603 DWT', cargo: '68,400 MT Grain', eta: 'Approaching (4h)', status: 'High Risk', risk: 'high', delay: '12.0h', action: 'Labor Shift Sync' },
    { name: 'Front Altair', type: 'Tanker', imo: 'IMO 9745902', port: 'Port of Dubai', flag: 'MH', dwt: '109,999 DWT', cargo: '85,000 bbl Crude', eta: 'In Port (Berth 2)', status: 'Moderate', risk: 'medium', delay: '5.4h', action: 'Standard Berth Turnaround' },
    { name: 'Mumbai Express', type: 'General Cargo', imo: 'IMO 9400124', port: 'Port of Mumbai', flag: 'IN', dwt: '48,000 DWT', cargo: '2,400 TEU', eta: 'Berthing Scheduled', status: 'Optimal', risk: 'low', delay: '2.1h', action: 'Direct Berthing Cleared' },
    { name: 'Hamburg Highway', type: 'Ro-Ro', imo: 'IMO 9673418', port: 'Port of Hamburg', flag: 'JP', dwt: '56,000 DWT', cargo: '4,200 Vehicles', eta: 'Approaching (6h)', status: 'Moderate', risk: 'medium', delay: '7.8h', action: 'Tide Window Scheduled' }
];

const LIVE_INCIDENTS = [
    { icon: 'alert-triangle', title: 'High Anchorage Density', port: 'Port of Shanghai', time: '12m ago', text: 'Outer anchorage queue reached 18 vessels. Terminal yard utilization at 82%.', severity: 'high' },
    { icon: 'cloud-lightning', title: 'Gale Wind Advisory', port: 'Port of Rotterdam', time: '26m ago', text: 'Wind speeds exceeding 24 knots. Gantry cranes 4-7 on high-wind safety hold.', severity: 'critical' },
    { icon: 'wrench', title: 'Pier 400 Crane Service', port: 'Port of Los Angeles', time: '1h ago', text: 'Super-post-panamax crane 3 undergoing scheduled hydraulic seal servicing.', severity: 'medium' },
    { icon: 'users', title: 'Stevedore Shift Change', port: 'Port of Santos', time: '2h ago', text: 'Dock labor shift rotation in progress. Turnaround throughput expected to normalize.', severity: 'medium' },
    { icon: 'check-circle-2', title: 'Channel Cleared', port: 'Port of Singapore', time: '3h ago', text: 'Eastern fairway pilotage queue normalized. Direct berthing window confirmed.', severity: 'low' }
];

const PORT_COUNTRIES = {
    'Port of Shanghai': 'China',
    'Port of Singapore': 'Singapore',
    'Port of Rotterdam': 'Netherlands',
    'Port of Los Angeles': 'United States',
    'Port of Dubai': 'United Arab Emirates',
    'Port of Santos': 'Brazil',
    'Port of Mumbai': 'India',
    'Port of Hamburg': 'Germany'
};

let currentRegionFilter = 'all';
let currentPortSearch = '';
let currentPortViewMode = 'cards';
let selectedMiniPreset = 'normal';

// ─── Render Port Grids & Real Operations Table ─────────────────────────────

function renderPortGrid(ports) {
    if (!ports) return;
    const grid = document.getElementById('portGrid');
    const tableBody = document.getElementById('portTableBody');
    const landingGrid = document.getElementById('landingPortGrid');
    
    // Filter ports based on active region and search query
    let filteredPorts = ports;
    if (currentRegionFilter && currentRegionFilter !== 'all') {
        filteredPorts = filteredPorts.filter(p => p.region.toLowerCase().includes(currentRegionFilter.toLowerCase()));
    }
    if (currentPortSearch && currentPortSearch.trim() !== '') {
        const query = currentPortSearch.toLowerCase().trim();
        filteredPorts = filteredPorts.filter(p => {
            const country = PORT_COUNTRIES[p.name] || '';
            return p.name.toLowerCase().includes(query) || p.region.toLowerCase().includes(query) || country.toLowerCase().includes(query);
        });
    }

    // Generate Port Card HTML with Lucide Icons
    const generatePortCardHtml = (port) => {
        const congRate = port.congestion_rate;
        const country = PORT_COUNTRIES[port.name] || port.country || 'International Hub';
        let riskClass = 'low';
        let riskText = 'Optimal Flow';
        let riskIcon = 'check-circle-2';
        let riskColor = 'var(--risk-low)';

        if (congRate > 0.5) {
            riskClass = 'critical'; riskText = 'Critical Congestion'; riskIcon = 'alert-octagon'; riskColor = 'var(--risk-critical)';
        } else if (congRate > 0.35) {
            riskClass = 'high'; riskText = 'High Risk'; riskIcon = 'alert-triangle'; riskColor = 'var(--risk-high)';
        } else if (congRate > 0.2) {
            riskClass = 'medium'; riskText = 'Moderate Queue'; riskIcon = 'clock'; riskColor = 'var(--risk-medium)';
        }

        return `
            <div class="port-card">
                <div class="port-card-top">
                    <div class="port-name-wrap">
                        <h3>${port.name}</h3>
                        <span class="port-geo"><i data-lucide="map-pin" class="icon-xs"></i> ${country} • ${port.region}</span>
                    </div>
                    <span class="port-risk-badge ${riskClass}">
                        <i data-lucide="${riskIcon}" class="icon-xs"></i> ${riskText}
                    </span>
                </div>

                <div class="port-stats-row">
                    <div class="port-stat-box">
                        <div class="port-stat-head">
                            <i data-lucide="gauge" class="icon-xs"></i> Congestion Index
                        </div>
                        <div class="port-stat-val" style="color: ${riskColor}">
                            ${(congRate * 100).toFixed(1)}%
                        </div>
                    </div>
                    <div class="port-stat-box">
                        <div class="port-stat-head">
                            <i data-lucide="clock" class="icon-xs"></i> Average Delay
                        </div>
                        <div class="port-stat-val">
                            ${port.avg_delay.toFixed(1)}h
                        </div>
                    </div>
                    <div class="port-stat-box">
                        <div class="port-stat-head">
                            <i data-lucide="anchor" class="icon-xs"></i> Active Berths
                        </div>
                        <div class="port-stat-val">
                            ${port.berths}
                        </div>
                    </div>
                    <div class="port-stat-box">
                        <div class="port-stat-head">
                            <i data-lucide="layers" class="icon-xs"></i> Max Capacity
                        </div>
                        <div class="port-stat-val">
                            ${port.capacity}
                        </div>
                    </div>
                </div>

                <div class="port-congestion-bar">
                    <div class="port-congestion-fill" style="width: ${congRate * 100}%; background: ${riskColor};"></div>
                </div>

                <div class="port-card-footer">
                    <span class="port-weather-pill">
                        <i data-lucide="wind" class="icon-xs"></i> 14 kts • Steady
                    </span>
                    <button type="button" class="port-quick-sim-btn" onclick="quickSimulatePort('${port.name}')" title="Configure AI scenario for this port">
                        <i data-lucide="sliders" class="icon-xs"></i> Simulate
                    </button>
                </div>
            </div>
        `;
    };

    // Generate Dense Table Row HTML
    const generatePortTableRowHtml = (port) => {
        const congRate = port.congestion_rate;
        let riskClass = 'low';
        let riskText = 'Optimal';
        let riskIcon = 'check-circle-2';
        let riskColor = 'var(--risk-low)';

        if (congRate > 0.5) {
            riskClass = 'critical'; riskText = 'Critical'; riskIcon = 'alert-octagon'; riskColor = 'var(--risk-critical)';
        } else if (congRate > 0.35) {
            riskClass = 'high'; riskText = 'High Risk'; riskIcon = 'alert-triangle'; riskColor = 'var(--risk-high)';
        } else if (congRate > 0.2) {
            riskClass = 'medium'; riskText = 'Moderate'; riskIcon = 'clock'; riskColor = 'var(--risk-medium)';
        }

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="anchor" class="icon-sm" style="color:var(--text-muted);"></i>
                        <strong>${port.name}</strong>
                    </div>
                </td>
                <td><span style="font-size:0.75rem; color:var(--text-muted);">${port.region}</span></td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-weight:750; font-family:var(--font-mono); color:${riskColor};">${(congRate * 100).toFixed(1)}%</span>
                        <div style="width:50px; height:4px; background:var(--bg-subtle); border-radius:99px; overflow:hidden;">
                            <div style="width:${congRate * 100}%; height:100%; background:${riskColor};"></div>
                        </div>
                    </div>
                </td>
                <td><span style="font-family:var(--font-mono); font-weight:600;">${port.avg_delay.toFixed(1)}h</span></td>
                <td>${port.berths} Berths</td>
                <td>${port.capacity} Vessels</td>
                <td>
                    <span class="port-risk-badge ${riskClass}">
                        <i data-lucide="${riskIcon}" class="icon-xs"></i> ${riskText}
                    </span>
                </td>
                <td>
                    <button type="button" class="port-quick-sim-btn" onclick="quickSimulatePort('${port.name}')">
                        <i data-lucide="play" class="icon-xs"></i> Analyze
                    </button>
                </td>
            </tr>
        `;
    };

    if (grid) {
        if (filteredPorts.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color);"><i data-lucide="search" class="icon-lg" style="margin-bottom: 8px;"></i><p>No ports match your current filter.</p></div>`;
        } else {
            grid.innerHTML = filteredPorts.map(generatePortCardHtml).join('');
        }
    }

    if (tableBody) {
        if (filteredPorts.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">No ports found</td></tr>`;
        } else {
            tableBody.innerHTML = filteredPorts.map(generatePortTableRowHtml).join('');
        }
    }

    if (landingGrid) {
        landingGrid.innerHTML = ports.map(generatePortCardHtml).join('');
    }

    renderVesselRadar(ports);
    renderIncidents();
    renderLucideIcons();
}

// ─── Filter & View Mode Controls ───────────────────────────────────────────

function filterByRegion(region, btn) {
    currentRegionFilter = region;
    if (btn) {
        document.querySelectorAll('.filter-chips-group .filter-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
    }
    if (portsData) {
        renderPortGrid(portsData);
    }
}

function handlePortFilter(query) {
    currentPortSearch = query;
    if (portsData) {
        renderPortGrid(portsData);
    }
}

function setPortViewMode(mode) {
    currentPortViewMode = mode;
    const grid = document.getElementById('portGrid');
    const tableWrap = document.getElementById('portTableView');
    const btnCards = document.getElementById('btnViewCards');
    const btnTable = document.getElementById('btnViewTable');

    if (mode === 'cards') {
        if (grid) grid.style.display = 'grid';
        if (tableWrap) tableWrap.style.display = 'none';
        if (btnCards) btnCards.classList.add('active');
        if (btnTable) btnTable.classList.remove('active');
    } else {
        if (grid) grid.style.display = 'none';
        if (tableWrap) tableWrap.style.display = 'block';
        if (btnCards) btnCards.classList.remove('active');
        if (btnTable) btnTable.classList.add('active');
    }
    renderLucideIcons();
}

// ─── Live Inbound Vessel Radar Table ───────────────────────────────────────

function renderVesselRadar(ports) {
    const tbody = document.getElementById('vesselRadarBody');
    if (!tbody) return;

    tbody.innerHTML = LIVE_VESSELS.map(v => {
        let riskClass = 'low';
        let riskIcon = 'check-circle-2';
        if (v.risk === 'critical') { riskClass = 'critical'; riskIcon = 'alert-octagon'; }
        else if (v.risk === 'high') { riskClass = 'high'; riskIcon = 'alert-triangle'; }
        else if (v.risk === 'medium') { riskClass = 'medium'; riskIcon = 'clock'; }

        return `
            <tr>
                <td>
                    <div class="vessel-name-cell">
                        <span class="v-name"><i data-lucide="ship" class="icon-xs" style="color:var(--text-muted);"></i> ${v.name}</span>
                        <span class="v-imo">${v.imo} • Flag: ${v.flag}</span>
                    </div>
                </td>
                <td><span style="font-size:0.75rem; font-weight:600; color:var(--text-secondary);">${v.type}</span></td>
                <td>
                    <div style="font-weight:600; font-size:0.8rem;">${v.port}</div>
                    <div style="font-size:0.7rem; color:var(--text-muted);">${v.cargo}</div>
                </td>
                <td><span style="font-size:0.75rem; font-weight:700;">${v.eta}</span></td>
                <td>
                    <span class="port-risk-badge ${riskClass}">
                        <i data-lucide="${riskIcon}" class="icon-xs"></i> ${v.status} (${v.delay})
                    </span>
                </td>
                <td>
                    <span class="dispatch-advisory-pill">
                        <i data-lucide="sparkles" class="icon-xs"></i> ${v.action}
                    </span>
                </td>
                <td>
                    <button type="button" class="port-quick-sim-btn" onclick="quickSimulatePort('${v.port}')" title="Simulate arrival queue">
                        <i data-lucide="sliders" class="icon-xs"></i> Dispatch
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ─── Live Terminal Advisories Feed ─────────────────────────────────────────

function renderIncidents() {
    const list = document.getElementById('incidentList');
    if (!list) return;

    list.innerHTML = LIVE_INCIDENTS.map(inc => `
        <div class="incident-item">
            <div class="incident-icon-wrap ${inc.severity}">
                <i data-lucide="${inc.icon}"></i>
            </div>
            <div class="incident-body">
                <div class="incident-top">
                    <span class="incident-title">${inc.title}</span>
                    <span class="incident-time">${inc.time}</span>
                </div>
                <div class="incident-desc">${inc.text}</div>
            </div>
        </div>
    `).join('');
}

// ─── Quick AI Congestion Evaluator Widget ──────────────────────────────────

function selectMiniPreset(preset, btn) {
    selectedMiniPreset = preset;
    if (btn) {
        document.querySelectorAll('.mini-preset-row .mini-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
}

async function runMiniEvaluator() {
    const btn = document.getElementById('btnRunMiniEval');
    const resultBox = document.getElementById('miniEvalResult');
    const portEl = document.getElementById('miniPortSelect');
    const vesselEl = document.getElementById('miniVesselSelect');
    const pctEl = document.getElementById('miniEvalPct');
    const badgeEl = document.getElementById('miniEvalBadge');
    const adviceEl = document.getElementById('miniEvalAdvice');

    if (!portEl || !vesselEl || !btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader" class="spin"></i> Evaluating...`;
    renderLucideIcons();

    // Prepare evaluation payload
    let util = 75;
    let weather = 'Clear';
    let wind = 12;
    let queue = 4;
    let vessels = 18;

    if (selectedMiniPreset === 'normal') {
        util = 45; weather = 'Clear'; wind = 8; queue = 1; vessels = 10;
    } else if (selectedMiniPreset === 'storm') {
        util = 85; weather = 'Storm'; wind = 35; queue = 8; vessels = 26;
    } else if (selectedMiniPreset === 'peak') {
        util = 95; weather = 'Fog'; wind = 15; queue = 12; vessels = 30;
    } else if (selectedMiniPreset === 'labor') {
        util = 88; weather = 'Rain'; wind = 18; queue = 7; vessels = 22;
    }

    try {
        const payload = {
            port_name: portEl.value,
            vessel_type: vesselEl.value,
            vessel_size_dwt: 65000,
            cargo_volume_teu: 4000,
            vessels_in_port: vessels,
            queue_length: queue,
            port_utilization_pct: util,
            labor_availability_pct: selectedMiniPreset === 'labor' ? 40 : 80,
            weather_condition: weather,
            wind_speed_knots: wind,
            month: 6,
            hour_of_day: 10,
            upcoming_arrivals_6h: 4,
            historical_delay_rate: 0.25
        };

        const res = await fetch(`${API_BASE}/api/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            const pct = Math.round(data.probability * 100);
            if (pctEl) pctEl.textContent = `${pct}%`;
            
            if (badgeEl) {
                badgeEl.className = `port-risk-badge ${data.risk_level.toLowerCase()}`;
                badgeEl.innerHTML = `<i data-lucide="${data.is_congested ? 'alert-triangle' : 'check-circle-2'}" class="icon-xs"></i> ${data.risk_level} Risk`;
            }

            if (adviceEl) {
                const delay = data.delay_estimate_hours ? data.delay_estimate_hours.toFixed(1) : (pct * 0.2).toFixed(1);
                adviceEl.innerHTML = `Predicted dwell: <strong>${delay}h</strong>. ${data.is_congested ? 'AI Advisory: Recommend staggered arrival slot or alternate anchorage.' : 'AI Advisory: Terminal clear for on-schedule berthing.'}`;
            }

            if (resultBox) resultBox.style.display = 'block';
            showToast(`Evaluated ${portEl.value}: ${pct}% Congestion Risk`, data.is_congested ? 'warning' : 'success');
        }
    } catch (e) {
        console.error('Mini evaluator error:', e);
    } finally {
        btn.innerHTML = originalText;
        renderLucideIcons();
    }
}

function quickSimulatePort(portName) {
    switchSection('predict');
    const portSelect = document.getElementById('portSelect');
    if (portSelect) {
        portSelect.value = portName;
    }
    const formCard = document.querySelector('.predict-form-card');
    if (formCard) {
        formCard.scrollIntoView({ behavior: 'smooth' });
    }
    showToast(`Loaded ${portName} into Congestion Engine`, 'info');
}

// ─── Live UTC Clock Ticker ─────────────────────────────────────────────────

function updateLiveUtcClock() {
    const clockEls = document.querySelectorAll('.dash-live-clock, #dashLiveClock');
    if (!clockEls.length) return;
    const now = new Date();
    const utcHours = String(now.getUTCHours()).padStart(2, '0');
    const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
    const utcSecs = String(now.getUTCSeconds()).padStart(2, '0');
    const formatted = `UTC ${utcHours}:${utcMins}:${utcSecs}`;
    clockEls.forEach(el => {
        el.textContent = formatted;
    });
}

setInterval(updateLiveUtcClock, 1000);
updateLiveUtcClock();

// ─── Telemetry Refresh Action ──────────────────────────────────────────────

async function refreshDashboardTelemetry(btn) {
    if (btn) {
        btn.classList.add('loading');
        btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Refreshing...`;
        renderLucideIcons();
    }
    try {
        await Promise.all([loadStats(), loadPorts()]);
        showToast('Live telemetry refreshed (8 international nodes synced)', 'success');
    } catch (e) {
        showToast('Telemetry refresh failed', 'error');
    } finally {
        if (btn) {
            btn.classList.remove('loading');
            btn.innerHTML = `<i data-lucide="refresh-cw"></i> Refresh`;
            renderLucideIcons();
        }
    }
}

function renderLandingRadar(ports) {
    const list = document.getElementById('landingRadarList');
    if (!list || !ports || ports.length === 0) return;

    list.innerHTML = ports.slice(0, 5).map(port => {
        const congRate = port.congestion_rate;
        let riskClass = 'low';
        let riskText = 'Normal Flow';
        let riskIcon = 'check-circle-2';
        if (congRate > 0.5) { riskClass = 'critical'; riskText = 'Critical'; riskIcon = 'alert-octagon'; }
        else if (congRate > 0.35) { riskClass = 'high'; riskText = 'High Risk'; riskIcon = 'alert-triangle'; }
        else if (congRate > 0.2) { riskClass = 'medium'; riskText = 'Moderate'; riskIcon = 'clock'; }

        return `
            <div class="radar-item">
                <div>
                    <div class="radar-port-name">${port.name}</div>
                    <div class="radar-port-meta">Capacity ${port.capacity} vessels • ${port.berths} berths • ${(congRate * 100).toFixed(0)}% historical congestion</div>
                </div>
                <span class="radar-risk-tag ${riskClass}"><i data-lucide="${riskIcon}" class="icon-xs"></i> ${riskText}</span>
            </div>
        `;
    }).join('');
    renderLucideIcons();
}

// ─── Model Performance Cards ───────────────────────────────────────────────

function updateModelCards(stats) {
    const grid = document.getElementById('modelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const modelNames = {
        'random_forest': 'Random Forest',
        'xgboost': 'XGBoost',
        'gradient_boosting': 'Gradient Boosting',
        'ensemble': 'Ensemble (Voting)'
    };
    
    Object.entries(stats.model_performance).forEach(([key, metrics]) => {
        const isEnsemble = key === 'ensemble';
        const card = document.createElement('div');
        card.className = 'model-card';
        if (isEnsemble) card.style.borderColor = 'var(--black-solid)';
        
        card.innerHTML = `
            <div class="model-card-header">
                <span class="model-card-name"><i data-lucide="${isEnsemble ? 'award' : 'cpu'}" class="icon-sm"></i> ${modelNames[key] || key}</span>
                <span class="model-card-badge">${isEnsemble ? 'Selected Model' : 'Base Learner'}</span>
            </div>
            <div class="model-metrics">
                <div class="model-metric">
                    <span class="model-metric-value">${(metrics.accuracy * 100).toFixed(1)}%</span>
                    <span class="model-metric-label">Accuracy</span>
                </div>
                <div class="model-metric">
                    <span class="model-metric-value">${(metrics.precision * 100).toFixed(1)}%</span>
                    <span class="model-metric-label">Precision</span>
                </div>
                <div class="model-metric">
                    <span class="model-metric-value">${(metrics.recall * 100).toFixed(1)}%</span>
                    <span class="model-metric-label">Recall</span>
                </div>
                <div class="model-metric">
                    <span class="model-metric-value">${(metrics.f1 * 100).toFixed(1)}%</span>
                    <span class="model-metric-label">F1-Score</span>
                </div>
                <div class="model-metric">
                    <span class="model-metric-value">${(metrics.roc_auc * 100).toFixed(1)}%</span>
                    <span class="model-metric-label">ROC-AUC</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
    renderLucideIcons();
}

// ─── Chart.js Analytics ────────────────────────────────────────────────────

let chartInstances = {};

function destroyCharts() {
    Object.keys(chartInstances).forEach(id => {
        if (chartInstances[id]) {
            try {
                chartInstances[id].destroy();
            } catch (e) {}
            delete chartInstances[id];
        }
    });
}

function getChartColors() {
    const isDark = currentTheme === 'dark';
    return {
        isDark,
        fontColor: isDark ? '#a1a1aa' : '#52525b',
        gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        tooltipBg: isDark ? 'rgba(24, 24, 27, 0.96)' : 'rgba(9, 9, 11, 0.95)',
        tooltipTitle: '#ffffff',
        tooltipBody: isDark ? '#d4d4d8' : '#e4e4e7',
        // Monthly chart
        monthlyLine: isDark ? '#38bdf8' : '#0284c7',
        monthlyArea: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.08)',
        delayLine: isDark ? '#94a3b8' : '#64748b',
        // Port Comparison bars (high-contrast vibrant cyan in dark mode, deep cobalt in light mode)
        portBar: isDark ? '#38bdf8' : '#0284c7',
        portBarBorder: isDark ? '#7dd3fc' : '#0369a1',
        // Feature Importance bars (high-contrast indigo/violet in dark mode, deep slate in light mode)
        featureBar: isDark ? '#818cf8' : '#4f46e5',
        featureBarBorder: isDark ? '#a5b4fc' : '#4338ca',
        // Delay Distribution bars (crisp bright blue in dark mode, royal blue in light mode)
        delayBar: isDark ? '#60a5fa' : '#2563eb',
        delayBarBorder: isDark ? '#93c5fd' : '#1d4ed8',
        // Vessel Donut (vibrant palette with contrast against dark background)
        vesselColors: isDark 
            ? ['#38bdf8', '#34d399', '#fbbf24', '#a78bfa', '#f472b6']
            : ['#0284c7', '#059669', '#d97706', '#6366f1', '#db2777'],
        doughnutBorder: isDark ? '#18181b' : '#ffffff',
    };
}

function getChartDefaults() {
    const colors = getChartColors();
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: colors.fontColor,
                    font: { family: "'Inter', sans-serif", size: 12 }
                }
            },
            tooltip: {
                backgroundColor: colors.tooltipBg,
                titleColor: colors.tooltipTitle,
                bodyColor: colors.tooltipBody,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                titleFont: { family: "'Inter', sans-serif", weight: '600' },
                bodyFont: { family: "'Inter', sans-serif" }
            }
        },
        scales: {
            x: {
                ticks: { color: colors.fontColor, font: { family: "'Inter', sans-serif", size: 11 } },
                grid: { color: colors.gridColor }
            },
            y: {
                ticks: { color: colors.fontColor, font: { family: "'Inter', sans-serif", size: 11 } },
                grid: { color: colors.gridColor }
            }
        }
    };
}

function initCharts(stats) {
    destroyCharts();
    const colors = getChartColors();
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Monthly Trends
    const monthlyData = stats.monthly_trends;
    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx) {
        chartInstances['monthly'] = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: monthlyData.map(d => monthLabels[d.month - 1]),
                datasets: [
                    {
                        label: 'Congestion Rate (%)',
                        data: monthlyData.map(d => (d.is_congested * 100).toFixed(1)),
                        borderColor: colors.monthlyLine,
                        backgroundColor: colors.monthlyArea,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointBackgroundColor: colors.monthlyLine,
                        pointRadius: 4,
                    },
                    {
                        label: 'Avg Delay (hrs)',
                        data: monthlyData.map(d => d.delay_hours.toFixed(1)),
                        borderColor: colors.delayLine,
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        tension: 0.35,
                        borderWidth: 2,
                        pointBackgroundColor: colors.delayLine,
                        pointRadius: 3,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                ...getChartDefaults(),
                scales: {
                    x: {
                        ticks: { color: colors.fontColor },
                        grid: { color: colors.gridColor },
                    },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Congestion Rate (%)', color: colors.fontColor, font: { size: 11 } },
                        ticks: { color: colors.fontColor },
                        grid: { color: colors.gridColor },
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Avg Delay (hrs)', color: colors.delayLine, font: { size: 11 } },
                        ticks: { color: colors.fontColor },
                        grid: { drawOnChartArea: false },
                    }
                }
            }
        });
    }
    
    // Weather Impact
    const weatherData = stats.weather_impact;
    const weatherCtx = document.getElementById('weatherChart');
    if (weatherCtx) {
        chartInstances['weather'] = new Chart(weatherCtx, {
            type: 'bar',
            data: {
                labels: weatherData.map(d => d.weather_condition),
                datasets: [{
                    label: 'Congestion Rate (%)',
                    data: weatherData.map(d => (d.is_congested * 100).toFixed(1)),
                    backgroundColor: weatherData.map(d => {
                        const rate = d.is_congested;
                        if (rate > 0.5) return colors.isDark ? '#f87171' : '#dc2626';
                        if (rate > 0.35) return colors.isDark ? '#fb923c' : '#ea580c';
                        if (rate > 0.2) return colors.isDark ? '#fbbf24' : '#d97706';
                        return colors.isDark ? '#34d399' : '#059669';
                    }),
                    borderRadius: 4,
                }]
            },
            options: {
                ...getChartDefaults(),
                plugins: {
                    ...getChartDefaults().plugins,
                    legend: { display: false }
                },
                indexAxis: 'y',
            }
        });
    }
    
    // Port Comparison (High contrast, clearly visible in dark mode!)
    const portAnalytics = stats.port_analytics;
    const portNames = Object.keys(portAnalytics).map(n => n.replace('Port of ', ''));
    const portCongestion = Object.values(portAnalytics).map(p => (p.congestion_rate * 100).toFixed(1));
    const portCtx = document.getElementById('portChart');
    if (portCtx) {
        chartInstances['port'] = new Chart(portCtx, {
            type: 'bar',
            data: {
                labels: portNames,
                datasets: [{
                    label: 'Congestion Rate (%)',
                    data: portCongestion,
                    backgroundColor: colors.portBar,
                    borderColor: colors.portBarBorder,
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                ...getChartDefaults(),
                plugins: {
                    ...getChartDefaults().plugins,
                    legend: { display: false }
                },
            }
        });
    }
    
    // Feature Importance (High contrast, clearly visible in dark mode!)
    const features = stats.feature_importance.slice(0, 10);
    const featureCtx = document.getElementById('featureChart');
    if (featureCtx) {
        chartInstances['feature'] = new Chart(featureCtx, {
            type: 'bar',
            data: {
                labels: features.map(f => f.feature.replace(/_/g, ' ')),
                datasets: [{
                    label: 'SHAP Importance',
                    data: features.map(f => f.importance.toFixed(4)),
                    backgroundColor: colors.featureBar,
                    borderColor: colors.featureBarBorder,
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                ...getChartDefaults(),
                indexAxis: 'y',
                plugins: {
                    ...getChartDefaults().plugins,
                    legend: { display: false }
                },
            }
        });
    }
    
    // Vessel Type Analysis
    const vesselData = stats.vessel_analysis;
    const vesselCtx = document.getElementById('vesselChart');
    if (vesselCtx) {
        chartInstances['vessel'] = new Chart(vesselCtx, {
            type: 'doughnut',
            data: {
                labels: vesselData.map(d => d.vessel_type),
                datasets: [{
                    data: vesselData.map(d => (d.is_congested * 100).toFixed(1)),
                    backgroundColor: colors.vesselColors,
                    borderWidth: 2,
                    borderColor: colors.doughnutBorder,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: colors.fontColor,
                            font: { size: 11 },
                            padding: 16,
                            boxWidth: 12,
                        }
                    },
                    tooltip: getChartDefaults().plugins.tooltip,
                }
            }
        });
    }
    
    // Delay Distribution (High contrast, clearly visible in dark mode!)
    const delayBins = ['0-2h', '2-5h', '5-10h', '10-20h', '20-40h', '40h+'];
    const delayCounts = [35, 22, 18, 14, 8, 3];
    const delayDistCtx = document.getElementById('delayDistChart');
    if (delayDistCtx) {
        chartInstances['delay'] = new Chart(delayDistCtx, {
            type: 'bar',
            data: {
                labels: delayBins,
                datasets: [{
                    label: 'Percentage of Shipments',
                    data: delayCounts,
                    backgroundColor: colors.delayBar,
                    borderColor: colors.delayBarBorder,
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                ...getChartDefaults(),
                plugins: {
                    ...getChartDefaults().plugins,
                    legend: { display: false },
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Delay Duration', color: colors.fontColor, font: { size: 11 } },
                        ticks: { color: colors.fontColor },
                        grid: { color: colors.gridColor },
                    },
                    y: {
                        title: { display: true, text: '% of Shipments', color: colors.fontColor, font: { size: 11 } },
                        ticks: { color: colors.fontColor },
                        grid: { color: colors.gridColor },
                    }
                }
            }
        });
    }
}

// ─── Dashboard Prediction Form ─────────────────────────────────────────────

const predictionFormEl = document.getElementById('predictionForm');
if (predictionFormEl) {
    predictionFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = document.getElementById('predictBtn');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Predicting...';
        btn.disabled = true;
        
        const form = e.target;
        const data = {
            port_name: form.port_name.value || 'Port of Shanghai',
            vessel_type: form.vessel_type.value || 'Container',
            vessel_size_dwt: parseInt(form.vessel_size_dwt.value) || 50000,
            cargo_volume_teu: parseInt(form.cargo_volume_teu.value) || 3000,
            vessels_in_port: parseInt(form.vessels_in_port.value) || 15,
            queue_length: parseInt(form.queue_length.value) || 3,
            port_utilization_pct: parseFloat(form.port_utilization_pct.value) || 70,
            labor_availability_pct: parseFloat(form.labor_availability_pct.value) || 80,
            weather_condition: form.weather_condition.value || 'Clear',
            wind_speed_knots: parseFloat(form.wind_speed_knots.value) || 12,
            month: parseInt(form.month.value) || 6,
            hour_of_day: parseInt(form.hour_of_day.value) || 10,
            upcoming_arrivals_6h: parseInt(form.upcoming_arrivals_6h.value) || 4,
            historical_delay_rate: parseFloat(form.historical_delay_rate.value) || 0.25,
            day_of_week: new Date().getDay(),
            is_weekend: [0, 6].includes(new Date().getDay()) ? 1 : 0,
            tide_height_m: 2.5,
        };
        
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

            const response = await fetch(`${API_BASE}/api/predict`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });
            
            if (!response.ok) throw new Error('Prediction failed');
            
            const result = await response.json();
            displayResults(result);
            showToast(`Prediction complete: ${result.risk_level} risk (${(result.congestion_probability * 100).toFixed(1)}%)`, 
                      result.risk_level === 'Low' ? 'success' : 'info');
        } catch (error) {
            console.error('Prediction error:', error);
            showToast('Prediction failed. Check API connection.', 'error');
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    });
}

function displayResults(result) {
    const placeholder = document.getElementById('resultsPlaceholder');
    const content = document.getElementById('resultsContent');
    if (placeholder) placeholder.style.display = 'none';
    if (content) {
        content.style.display = 'block';
        content.style.animation = 'none';
        content.offsetHeight;
        content.style.animation = 'slideUp 0.4s ease';
    }
    
    // Update gauge
    const prob = result.congestion_probability;
    const arcLength = 251; // Full arc path length
    const offset = arcLength - (prob * arcLength);
    const arc = document.getElementById('gaugeArc');
    if (arc) arc.style.strokeDashoffset = offset;
    
    // Needle rotation: -90 (left) to +90 (right)
    const angle = -90 + (prob * 180);
    const needle = document.getElementById('gaugeNeedle');
    if (needle) needle.setAttribute('transform', `rotate(${angle}, 100, 100)`);
    
    // Gauge value
    const gaugeValueEl = document.getElementById('gaugeValue');
    if (gaugeValueEl) animateNumber(gaugeValueEl, Math.round(prob * 100), '%', 700);
    
    // Risk badge
    const badgeContainer = document.getElementById('riskBadgeContainer');
    const riskLevel = result.risk_level;
    const riskClass = riskLevel.toLowerCase();
    
    if (badgeContainer) {
        badgeContainer.innerHTML = `
            <span class="risk-badge ${riskClass}">
                <span class="risk-badge-dot"></span>
                ${riskLevel} Risk
            </span>
            <span class="confidence-chip">
                Confidence: <strong>${(result.confidence_score * 100).toFixed(1)}%</strong>
            </span>
        `;
    }
    
    // Estimated delay
    const delayEl = document.getElementById('delayValue');
    if (delayEl) delayEl.textContent = `${result.estimated_delay_hours} hours`;
    
    // Explanations
    renderExplanations(result.explanations);
}

function renderExplanations(explanations) {
    const list = document.getElementById('explanationsList');
    if (!list || !explanations) return;
    list.innerHTML = '';
    
    explanations.forEach((exp, i) => {
        const card = document.createElement('div');
        card.className = 'explanation-card';
        card.innerHTML = `
            <div class="explanation-rank ${exp.direction}">
                ${i + 1}
            </div>
            <div class="explanation-body">
                <div class="explanation-factor">${exp.factor}</div>
                <div class="explanation-detail">${exp.detail}</div>
            </div>
            <span class="explanation-impact ${exp.impact}">${exp.impact}</span>
        `;
        list.appendChild(card);
    });
}

function fillSampleScenario() {
    const presets = ['normal', 'storm', 'peak', 'labor'];
    const randomPreset = presets[Math.floor(Math.random() * presets.length)];
    applyPreset(randomPreset);
    const chip = document.querySelector(`.preset-chip[onclick*="${randomPreset}"]`);
    if (chip) {
        document.querySelectorAll('#predict .preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
    }
}

function applyPreset(presetType, btn) {
    if (btn) {
        document.querySelectorAll('#predict .preset-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
    }

    if (presetType === 'normal') {
        document.getElementById('portSelect').value = 'Port of Shanghai';
        document.getElementById('vesselType').value = 'Container';
        document.getElementById('vesselSize').value = 50000;
        document.getElementById('cargoVolume').value = 3000;
        document.getElementById('vesselsInPort').value = 12;
        document.getElementById('queueLength').value = 1;
        document.getElementById('portUtilization').value = 45;
        document.getElementById('laborAvailability').value = 95;
        document.getElementById('weatherCondition').value = 'Clear';
        document.getElementById('windSpeed').value = 8;
        document.getElementById('monthSelect').value = 4;
        document.getElementById('hourSelect').value = 14;
        document.getElementById('upcomingArrivals').value = 2;
        document.getElementById('historicalDelay').value = 0.15;
        document.getElementById('portUtilizationVal').textContent = '45%';
        document.getElementById('laborAvailabilityVal').textContent = '95%';
        showToast('Low traffic scenario loaded', 'info');
    } else if (presetType === 'storm') {
        document.getElementById('portSelect').value = 'Port of Rotterdam';
        document.getElementById('vesselType').value = 'Container';
        document.getElementById('vesselSize').value = 95000;
        document.getElementById('cargoVolume').value = 6500;
        document.getElementById('vesselsInPort').value = 28;
        document.getElementById('queueLength').value = 8;
        document.getElementById('portUtilization').value = 85;
        document.getElementById('laborAvailability').value = 75;
        document.getElementById('weatherCondition').value = 'Storm';
        document.getElementById('windSpeed').value = 48;
        document.getElementById('monthSelect').value = 11;
        document.getElementById('hourSelect').value = 8;
        document.getElementById('upcomingArrivals').value = 6;
        document.getElementById('historicalDelay').value = 0.35;
        document.getElementById('portUtilizationVal').textContent = '85%';
        document.getElementById('laborAvailabilityVal').textContent = '75%';
        showToast('Severe storm scenario loaded', 'info');
    } else if (presetType === 'peak') {
        document.getElementById('portSelect').value = 'Port of Los Angeles';
        document.getElementById('vesselType').value = 'Bulk Carrier';
        document.getElementById('vesselSize').value = 140000;
        document.getElementById('cargoVolume').value = 9500;
        document.getElementById('vesselsInPort').value = 29;
        document.getElementById('queueLength').value = 12;
        document.getElementById('portUtilization').value = 95;
        document.getElementById('laborAvailability').value = 70;
        document.getElementById('weatherCondition').value = 'Fog';
        document.getElementById('windSpeed').value = 18;
        document.getElementById('monthSelect').value = 10;
        document.getElementById('hourSelect').value = 8;
        document.getElementById('upcomingArrivals').value = 8;
        document.getElementById('historicalDelay').value = 0.45;
        document.getElementById('portUtilizationVal').textContent = '95%';
        document.getElementById('laborAvailabilityVal').textContent = '70%';
        showToast('Peak bottleneck scenario loaded', 'info');
    } else if (presetType === 'labor') {
        document.getElementById('portSelect').value = 'Port of Santos';
        document.getElementById('vesselType').value = 'Tanker';
        document.getElementById('vesselSize').value = 80000;
        document.getElementById('cargoVolume').value = 5000;
        document.getElementById('vesselsInPort').value = 20;
        document.getElementById('queueLength').value = 7;
        document.getElementById('portUtilization').value = 88;
        document.getElementById('laborAvailability').value = 40;
        document.getElementById('weatherCondition').value = 'Rain';
        document.getElementById('windSpeed').value = 25;
        document.getElementById('monthSelect').value = 9;
        document.getElementById('hourSelect').value = 8;
        document.getElementById('upcomingArrivals').value = 5;
        document.getElementById('historicalDelay').value = 0.38;
        document.getElementById('portUtilizationVal').textContent = '88%';
        document.getElementById('laborAvailabilityVal').textContent = '40%';
        showToast('Labor shortage scenario loaded', 'info');
    }
}

// ─── Landing Page Detection Sandbox ────────────────────────────────────────

async function handleLandingDetection(e) {
    e.preventDefault();
    const btn = document.getElementById('landingDetectBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Running Model...';
    btn.disabled = true;

    const form = e.target;
    const data = {
        port_name: form.port_name.value || 'Port of Shanghai',
        vessel_type: form.vessel_type.value || 'Container',
        vessel_size_dwt: 65000,
        cargo_volume_teu: 4000,
        vessels_in_port: parseInt(form.vessels_in_port.value) || 18,
        queue_length: parseInt(form.queue_length.value) || 5,
        port_utilization_pct: parseFloat(form.port_utilization_pct.value) || 75,
        labor_availability_pct: 80,
        weather_condition: form.weather_condition.value || 'Clear',
        wind_speed_knots: 12,
        month: 6,
        hour_of_day: 10,
        upcoming_arrivals_6h: 4,
        historical_delay_rate: 0.25,
        day_of_week: new Date().getDay(),
        is_weekend: [0, 6].includes(new Date().getDay()) ? 1 : 0,
        tide_height_m: 2.5
    };

    try {
        const response = await fetch(`${API_BASE}/api/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) throw new Error('Detection API failed');
        const result = await response.json();
        displayLandingResults(result);
        showToast(`Detection: ${result.risk_level} Risk (${(result.congestion_probability * 100).toFixed(1)}%)`,
                  result.risk_level === 'Low' ? 'success' : 'info');
    } catch (err) {
        console.error('Landing detection error:', err);
        showToast('Congestion detection error. Check API server.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function displayLandingResults(result) {
    const placeholder = document.getElementById('landingPlaceholder');
    const content = document.getElementById('landingResultsContent');
    if (placeholder) placeholder.style.display = 'none';
    if (content) {
        content.style.display = 'block';
        content.style.animation = 'none';
        content.offsetHeight;
        content.style.animation = 'slideUp 0.4s ease';
    }

    const prob = result.congestion_probability;
    const arcLength = 251;
    const offset = arcLength - (prob * arcLength);
    const arc = document.getElementById('landingGaugeArc');
    if (arc) arc.style.strokeDashoffset = offset;

    const angle = -90 + (prob * 180);
    const needle = document.getElementById('landingGaugeNeedle');
    if (needle) needle.setAttribute('transform', `rotate(${angle}, 100, 100)`);

    const gaugeVal = document.getElementById('landingGaugeVal');
    if (gaugeVal) animateNumber(gaugeVal, Math.round(prob * 100), '%', 700);

    const badgeContainer = document.getElementById('landingRiskBadgeContainer');
    if (badgeContainer) {
        const riskClass = result.risk_level.toLowerCase();
        badgeContainer.innerHTML = `
            <span class="risk-badge ${riskClass}">
                <span class="risk-badge-dot"></span>
                ${result.risk_level} Risk
            </span>
            <span class="confidence-chip">
                Confidence: <strong>${(result.confidence_score * 100).toFixed(1)}%</strong>
            </span>
        `;
    }

    const delayVal = document.getElementById('landingDelayVal');
    if (delayVal) delayVal.textContent = `${result.estimated_delay_hours} hours`;

    const explanationsList = document.getElementById('landingExplanationsList');
    if (explanationsList && result.explanations) {
        explanationsList.innerHTML = '';
        result.explanations.forEach((exp, i) => {
            const card = document.createElement('div');
            card.className = 'explanation-card';
            card.innerHTML = `
                <div class="explanation-rank ${exp.direction}">${i + 1}</div>
                <div class="explanation-body">
                    <div class="explanation-factor">${exp.factor}</div>
                    <div class="explanation-detail">${exp.detail}</div>
                </div>
                <span class="explanation-impact ${exp.impact}">${exp.impact}</span>
            `;
            explanationsList.appendChild(card);
        });
    }
}

function applyLandingPreset(presetType, btn) {
    if (btn) {
        document.querySelectorAll('#landingDetect .preset-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
    }
    const port = document.getElementById('landingPortSelect');
    const vessel = document.getElementById('landingVesselType');
    const util = document.getElementById('landingUtilization');
    const utilVal = document.getElementById('landingUtilVal');
    const weather = document.getElementById('landingWeather');
    const queue = document.getElementById('landingQueue');
    const vessels = document.getElementById('landingVesselsInPort');

    if (presetType === 'normal') {
        if (port) port.value = 'Port of Shanghai';
        if (vessel) vessel.value = 'Container';
        if (util) util.value = 45;
        if (utilVal) utilVal.textContent = '45%';
        if (weather) weather.value = 'Clear';
        if (queue) queue.value = 1;
        if (vessels) vessels.value = 12;
        showToast('Preset: Normal traffic loaded', 'info');
    } else if (presetType === 'storm') {
        if (port) port.value = 'Port of Rotterdam';
        if (vessel) vessel.value = 'Container';
        if (util) util.value = 85;
        if (utilVal) utilVal.textContent = '85%';
        if (weather) weather.value = 'Storm';
        if (queue) queue.value = 8;
        if (vessels) vessels.value = 28;
        showToast('Preset: Severe storm scenario loaded', 'info');
    } else if (presetType === 'peak') {
        if (port) port.value = 'Port of Los Angeles';
        if (vessel) vessel.value = 'Bulk Carrier';
        if (util) util.value = 95;
        if (utilVal) utilVal.textContent = '95%';
        if (weather) weather.value = 'Fog';
        if (queue) queue.value = 12;
        if (vessels) vessels.value = 29;
        showToast('Preset: Peak bottleneck loaded', 'info');
    } else if (presetType === 'labor') {
        if (port) port.value = 'Port of Santos';
        if (vessel) vessel.value = 'Tanker';
        if (util) util.value = 88;
        if (utilVal) utilVal.textContent = '88%';
        if (weather) weather.value = 'Rain';
        if (queue) queue.value = 7;
        if (vessels) vessels.value = 20;
        showToast('Preset: Labor shortage loaded', 'info');
    }
}

// ─── Initialization ────────────────────────────────────────────────────────

async function init() {
    applyTheme(currentTheme);
    checkAuthSession();
    renderLucideIcons();
    try {
        await Promise.all([loadStats(), loadPorts()]);
    } catch (error) {
        console.error('Initialization error:', error);
    }
    renderLucideIcons();
}

// Start
init();
