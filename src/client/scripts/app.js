import { calculateTax, splitTax } from './calculator.js';

// --- GLOBAL STATE & DOM ELEMENTS ---
const DATA = window.TAX_DATA;
const CURTAIN = document.getElementById('transition-curtain');
const HERO = document.getElementById('hero-section');
const RESULTS = document.getElementById('results');
const CONTAINER = document.getElementById('breakdown-container');
const INPUT = document.getElementById('salary-input');
const BTN = document.getElementById('calculate-btn');

// --- INITIALIZATION ---

// 1. Set Background Layer (Low Z-Index)
const bgUrl = `/data/countries/${DATA.meta.id}/${DATA.meta.background}`;
document.getElementById('bg-layer').style.backgroundImage = `url('${bgUrl}')`;

// 2. Setup Input Formatting (Commas)
setupInputFormatting();

// 3. Setup UI Components
setupCustomDropdowns();
setupCountrySwitcher();

// 4. Check URL Params (Auto-Start)
const urlParams = new URLSearchParams(window.location.search);
const savedSalary = urlParams.get('salary');

if (savedSalary) {
    // Format it visually for the input
    const locale = DATA.meta.locale || 'en-US';
    INPUT.value = new Intl.NumberFormat(locale).format(savedSalary);
    
    // Skip animation for instant load
    HERO.classList.add('hidden');
    RESULTS.classList.remove('hidden');
    document.getElementById('hero-nav').classList.add('hidden'); // Hide Top Nav
    runCalculation(parseFloat(savedSalary));
}

// --- EVENT LISTENERS ---

BTN.addEventListener('click', startGame);

INPUT.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
});

document.getElementById('back-btn').addEventListener('click', () => {
    // Clear URL param
    const url = new URL(window.location);
    url.searchParams.delete('salary');
    window.history.replaceState({}, '', url);
    
    transitionToState('hero');
});

// --- CORE LOGIC ---

function startGame() {
    // 1. Strip commas before parsing
    const rawValue = INPUT.value.replace(/[^0-9.]/g, '');
    const salary = parseFloat(rawValue);

    if (!salary || salary <= 0) {
        // Visual shake/error
        INPUT.parentElement.style.borderColor = '#ff4444';
        setTimeout(() => INPUT.parentElement.style.borderColor = '', 500);
        return;
    }
    
    // 2. Hide Keyboard
    INPUT.blur();
    
    // 3. Update URL (without reload)
    const url = new URL(window.location);
    url.searchParams.set('salary', salary);
    window.history.replaceState({}, '', url);

    // 4. Go
    transitionToState('results', () => {
        runCalculation(salary);
    });
}

function runCalculation(salary) {
    const tax = calculateTax(salary, DATA.budget.taxRules);
    const split = splitTax(tax, DATA.budget.expenditure.categories);
    renderGameUI(salary, tax, split);
}

// --- RENDER UI (The Game Screen) ---

function renderGameUI(salary, totalTax, breakdown) {
    // A. Calculate Citizen Level (Logarithmic)
    let level = 1;
    if (totalTax > 0) {
        level = Math.floor(Math.log10(totalTax) * 10) - 30; 
        if (level < 1) level = 1;
        if (level > 99) level = 99;
    }

    // B. Header HTML
    let html = `
    <div class="character-sheet">
        <div class="sheet-header">
            <div class="level-badge">
                <div class="level-title">${DATA.strings.citizen_rank || 'Citizen Rank'}</div>
                <span>LVL ${level}</span>
            </div>
            <div class="total-tax-display">
                <div class="level-title">${DATA.strings.total_contribution || 'Total Contribution'}</div>
                <div class="total-val">${formatMoney(totalTax)}</div>
            </div>
        </div>
        
        <div class="stats-grid">`;

    // C. Stats Grid with Trends
    const maxPercent = breakdown[0]?.percent || 1; 

    breakdown.forEach(item => {
        const visualWidth = (item.percent / maxPercent) * 100;
        
        // Trend Logic (Green/Red Arrows) from Build System
        let trendHTML = '';
        if (item.change !== undefined && item.change !== 0) {
            const isPos = item.change > 0;
            const color = isPos ? 'var(--neon-green)' : '#ff4444';
            const arrow = isPos ? '↑' : '↓';
            trendHTML = `<span style="color:${color}; font-size:0.75rem; margin-left:6px; opacity:0.9;">${arrow}${Math.abs(item.change)}%</span>`;
        }

        html += `
            <div class="stat-row">
                <div class="stat-header">
                    <span class="stat-name">
                        ${item.icon} ${item.label} 
                        ${trendHTML}
                    </span>
                    <span class="stat-num">${formatCompact(item.amount)}</span>
                </div>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill" style="width: ${visualWidth}%"></div>
                </div>
            </div>`;
    });

    html += `</div>`; // Close grid

    // D. Impact & Achievements (Dynamic)
    // Approximate costs for fun comparison
    const costs = {
        meal: 25,       // School lunch
        book: 150,      // Textbook
        road_km: 5000000 // 1km rural road
    };

    let impactsHTML = '';
    
    if (totalTax > 0) {
        impactsHTML += `<div style="margin-top:2rem; border-top:1px dashed rgba(255,255,255,0.2); padding-top:1rem;">
            <div class="level-title" style="margin-bottom:1rem; color:var(--neon-blue);">${DATA.strings.achievements || 'Impact & Achievements'}</div>
            <div class="achievements-grid">`;

        // 1. Meals (Welfare approx 12%)
        const welfareShare = totalTax * 0.12;
        const meals = Math.floor(welfareShare / costs.meal);
        if (meals > 10) {
            impactsHTML += createImpactCard("🥣", "No One Goes Hungry", `Your contribution funded <b>${meals.toLocaleString()}</b> mid-day meals for school children.`);
        }

        // 2. Education (Approx 3%)
        const eduShare = totalTax * 0.03;
        const books = Math.floor(eduShare / costs.book);
        if (books > 5) {
            impactsHTML += createImpactCard("📚", "Knowledge Patron", `You provided <b>${books.toLocaleString()}</b> textbooks for students.`);
        }

        // 3. Infrastructure (Transport approx 10%)
        const infraShare = totalTax * 0.10;
        if (infraShare > 1000) {
            impactsHTML += createImpactCard("🛣️", "Nation Builder", `You contributed <b>${formatMoney(infraShare)}</b> directly towards building new infrastructure.`);
        }

        // 4. Percentile (Mock Logic based on progressive tax)
        let percentile = "Top 50%";
        if (totalTax > 1500000) percentile = "Top 1%";
        else if (totalTax > 500000) percentile = "Top 5%";
        else if (totalTax > 100000) percentile = "Top 10%";
        
        impactsHTML += createImpactCard("🏆", "Taxpayer Rank", `You are likely in the <b>${percentile}</b> of contributors.`);

        impactsHTML += `</div></div>`;
    }

    html += impactsHTML;
    html += `</div>`; // Close sheet

    CONTAINER.innerHTML = html;

    // E. Animation Tick
    setTimeout(() => {
        document.querySelectorAll('.stat-bar-fill').forEach(bar => {
             const target = bar.style.width;
             bar.style.width = '0%';
             requestAnimationFrame(() => bar.style.width = target);
        });
    }, 50);
}

// --- DROPDOWNS & NAVIGATION ---

function setupCustomDropdowns() {
    // 1. Language Switcher (Standard)
    if (DATA.meta.availableLanguages.length > 1) {
        const langOptions = DATA.meta.availableLanguages.map(lang => ({
            value: lang,
            text: lang.toUpperCase(),
            selected: lang === DATA.currentLanguage
        }));

        createDropdown('lang-switcher', DATA.currentLanguage.toUpperCase(), langOptions, (newLang) => {
            if (newLang === DATA.currentLanguage) return;
            const salaryParam = INPUT.value ? `?salary=${INPUT.value.replace(/,/g, '')}` : '';
            let url = `/${DATA.meta.id}/`;
            if (newLang !== DATA.meta.defaultLanguage) url += `${newLang}/`;
            triggerPageTransition(url + salaryParam);
        });
    }

    // 2. Budget Year Switcher (With Transition & UI Refresh)
    // We wrap this in a render function so we can call it again to update the "Selected" checkmark
    renderYearDropdown();

    function renderYearDropdown() {
        const budgets = DATA.meta.availableBudgets || [DATA.budget.year];
        const budgetOptions = budgets.map(y => ({
            value: y,
            text: y,
            selected: y === DATA.budget.year // This ensures the correct year is highlighted
        }));

        createDropdown('year-switcher', `YEAR: ${DATA.budget.year}`, budgetOptions, (year) => {
            // If clicking the same year, do nothing
            if (year === DATA.budget.year) return;

            // 1. FADE OUT
            CURTAIN.classList.add('active');

            // 2. WAIT FOR FADE, THEN FETCH
            setTimeout(async () => {
                try {
                    const res = await fetch(`/data/countries/${DATA.meta.id}/budgets/${year}.json`);
                    if (res.ok) {
                        const rawBudget = await res.json();

                        // Re-apply localization labels
                        if (rawBudget.expenditure && rawBudget.expenditure.categories) {
                            rawBudget.expenditure.categories = rawBudget.expenditure.categories.map(cat => ({
                                ...cat,
                                label: DATA.strings.categories[cat.id] || cat.id
                            }));
                        }

                        // Update Global State
                        DATA.budget = rawBudget;

                        // Update Links & UI
                        updateSourceLink();

                        // Re-calculate if salary exists
                        const rawVal = INPUT.value.replace(/[^0-9.]/g, '');
                        if (rawVal) {
                            runCalculation(parseFloat(rawVal));
                        }

                        // CRITICAL: Re-render this dropdown to update the "Selected" class
                        renderYearDropdown();
                    }
                } catch (e) {
                    console.error("Budget fetch failed", e);
                } finally {
                    // 3. FADE BACK IN
                    setTimeout(() => {
                        CURTAIN.classList.remove('active');
                    }, 200);
                }
            }, 500); // Wait 500ms for curtain to cover screen
        });
    }
}

function setupCountrySwitcher() {
    if (!DATA.globalCountries || DATA.globalCountries.length <= 1) return;

    const options = DATA.globalCountries.map(c => ({
        value: c.id,
        text: `${c.flag} ${c.name.toUpperCase()}`,
        selected: c.id === DATA.meta.id
    }));

    const current = DATA.globalCountries.find(c => c.id === DATA.meta.id);
    const label = current ? `${current.flag} ${current.name}` : DATA.meta.name;

    createDropdown('country-switcher', label.toUpperCase(), options, (countryId) => {
        triggerPageTransition(`/${countryId}/`);
    });
}

function createDropdown(containerId, label, options, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="dd-trigger">
            <span>${label}</span>
            <span style="font-size:0.7rem; margin-left:6px;">▼</span>
        </div>
        <div class="dd-menu"></div>
    `;

    const menu = container.querySelector('.dd-menu');
    const trigger = container.querySelector('.dd-trigger');

    options.forEach(opt => {
        const div = document.createElement('div');
        div.className = `dd-item ${opt.selected ? 'selected' : ''}`;
        div.innerHTML = `<span>${opt.text}</span>`;
        div.addEventListener('click', () => {
            container.classList.remove('active');
            onSelect(opt.value);
        });
        menu.appendChild(div);
    });

    // Toggle logic
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close others
        document.querySelectorAll('.custom-dropdown').forEach(el => {
            if (el !== container) el.classList.remove('active');
        });
        container.classList.toggle('active');
    });
}

// Close dropdowns when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown').forEach(el => el.classList.remove('active'));
});

// --- HELPER FUNCTIONS ---

function setupInputFormatting() {
    const locale = DATA.meta.locale || 'en-US';
    
    INPUT.addEventListener('input', () => {
        const raw = INPUT.value.replace(/[^0-9]/g, '');
        if (!raw) {
            INPUT.value = '';
            return;
        }
        INPUT.value = new Intl.NumberFormat(locale).format(raw);
    });
}

function updateSourceLink() {
    const subtextEl = document.querySelector('.subtext');
    if(subtextEl && DATA.budget.sourceUrl) {
        subtextEl.innerHTML = `<a href="${DATA.budget.sourceUrl}" target="_blank" style="color:inherit; text-decoration:none; border-bottom:1px dotted rgba(255,255,255,0.4);">
            ${DATA.strings.subtext} • ${DATA.budget.year} ↗
        </a>`;
    }
}

function createImpactCard(icon, title, desc) {
    return `
    <div class="ach-card">
        <div class="ach-header"><span>${icon}</span> ${title}</div>
        <span class="quote-text">${desc}</span>
    </div>`;
}

function transitionToState(state, callback) {
    CURTAIN.classList.add('active');
    setTimeout(() => {
        if (state === 'results') {
            HERO.classList.add('hidden');
            RESULTS.classList.remove('hidden');
            document.getElementById('hero-nav').classList.add('hidden');
            window.scrollTo(0,0);
            if (callback) callback();
        } else if (state === 'hero') {
            RESULTS.classList.add('hidden');
            HERO.classList.remove('hidden');
            document.getElementById('hero-nav').classList.remove('hidden');
        }
        setTimeout(() => CURTAIN.classList.remove('active'), 300);
    }, 500);
}

function triggerPageTransition(url) {
    CURTAIN.classList.add('active');
    setTimeout(() => window.location.href = url, 500);
}

function formatMoney(amount) {
    const locale = DATA.meta.locale || 'en-US';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: DATA.meta.currency,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatCompact(amount) {
    const format = DATA.meta.numberFormat || { system: "international" };
    
    if (format.system === "indian") {
        if (amount >= 10000000) return (amount / 10000000).toFixed(1) + 'Cr';
        if (amount >= 100000) return (amount / 100000).toFixed(1) + 'L';
        if (amount >= 1000) return (amount / 1000).toFixed(0) + 'k';
    } else {
        if (amount >= 1000000000) return (amount / 1000000000).toFixed(1) + 'B';
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 1000) return (amount / 1000).toFixed(0) + 'k';
    }
    return amount.toString();
}