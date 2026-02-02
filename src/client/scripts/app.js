import { calculateTax, splitTax } from './calculator.js';

const DATA = window.TAX_DATA;
const CURTAIN = document.getElementById('transition-curtain');
const HERO = document.getElementById('hero-section');
const RESULTS = document.getElementById('results');
const CONTAINER = document.getElementById('breakdown-container');
const INPUT = document.getElementById('salary-input');

// --- INITIALIZATION ---

// 1. Set Background Layer (Not Body)
document.getElementById('bg-layer').style.backgroundImage = `url('/data/countries/${DATA.meta.id}/${DATA.meta.background}')`;

// 2. Setup Custom UI
setupCustomDropdowns();
setupCountrySwitcher();

// 3. Check URL Params for Auto-Start (Language Switch Persistence)
const urlParams = new URLSearchParams(window.location.search);
const savedSalary = urlParams.get('salary');

if (savedSalary) {
    INPUT.value = savedSalary;
    // Skip animation for instant load
    HERO.classList.add('hidden');
    RESULTS.classList.remove('hidden');
    runCalculation(parseFloat(savedSalary));
}

// --- EVENTS ---
document.getElementById('calculate-btn').addEventListener('click', startGame);
INPUT.addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(); });

document.getElementById('back-btn').addEventListener('click', () => {
    // Clear URL param so reload goes to hero
    const url = new URL(window.location);
    url.searchParams.delete('salary');
    window.history.replaceState({}, '', url);
    
    transitionToState('hero');
});

// --- CORE FUNCTIONS ---

function startGame() {
    const salary = parseFloat(INPUT.value);
    if (!salary || salary <= 0) {
        // Shake animation logic here if desired
        return;
    }
    
    // Add param to URL without reload (so if they switch lang, we know the salary)
    const url = new URL(window.location);
    url.searchParams.set('salary', salary);
    window.history.replaceState({}, '', url);

    transitionToState('results', () => {
        runCalculation(salary);
    });
}

function runCalculation(salary) {
    const tax = calculateTax(salary, DATA.budget.taxRules);
    const split = splitTax(tax, DATA.budget.expenditure.categories);
    renderGameUI(salary, tax, split);
}

// --- RENDER LOGIC ---

function renderGameUI(salary, totalTax, breakdown) {
    let level = 1;
    if (totalTax > 0) {
        level = Math.floor(Math.log10(totalTax) * 10) - 30; 
        if (level < 1) level = 1;
        if (level > 99) level = 99;
    }

    let html = `
    <div class="character-sheet">
        <div class="sheet-header">
            <div class="level-badge">
                <div class="level-title">Citizen Rank</div>
                <span>LVL ${level}</span>
            </div>
            <div class="total-tax-display">
                <div class="level-title">Total Contribution</div>
                <div class="total-val">${formatMoney(totalTax)}</div>
            </div>
        </div>
        
        <div class="stats-grid">`;

    const maxPercent = breakdown[0]?.percent || 1; 

    breakdown.forEach(item => {
        const visualWidth = (item.percent / maxPercent) * 100;
        html += `
            <div class="stat-row">
                <div class="stat-header">
                    <span class="stat-name">${item.icon} ${item.label}</span>
                    <span class="stat-num">${formatCompact(item.amount)}</span>
                </div>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill" style="width: ${visualWidth}%"></div>
                </div>
            </div>`;
    });

    html += `</div>`;

    // Achievements with Quotes
    const unlocked = DATA.achievements.filter(a => totalTax >= a.minAmount);
    if (unlocked.length > 0) {
        html += `<div style="margin-top:2rem; border-top:1px dashed #444; padding-top:1rem;">
            <div class="level-title" style="margin-bottom:1rem">Achievements</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">`;
            
        unlocked.forEach(ach => {
            html += `
            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; border:1px solid #333;">
                <div style="color:var(--neon-orange); font-weight:bold;">${ach.icon} ${ach.label}</div>
                <span class="quote-text">"${ach.description}"</span>
            </div>`;
        });
        html += `</div></div>`;
    }

    html += `</div>`; // Close sheet
    CONTAINER.innerHTML = html;

    // Animate
    setTimeout(() => {
        document.querySelectorAll('.stat-bar-fill').forEach(bar => {
             const t = bar.style.width;
             bar.style.width = '0%';
             requestAnimationFrame(() => bar.style.width = t);
        });
    }, 50);
}

// --- CUSTOM DROPDOWN HELPERS ---

function createDropdown(containerId, label, options, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="dd-trigger">
            <span>${label}</span>
            <span style="font-size:0.7rem">▼</span>
        </div>
        <div class="dd-menu"></div>
    `;

    const menu = container.querySelector('.dd-menu');
    const trigger = container.querySelector('.dd-trigger');

    // Populate
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

    // Toggle
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close others
        document.querySelectorAll('.custom-dropdown').forEach(el => {
            if (el !== container) el.classList.remove('active');
        });
        container.classList.toggle('active');
    });
}

// Close dropdowns on click outside
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-dropdown').forEach(el => el.classList.remove('active'));
});

// --- SETUPS ---

function setupCustomDropdowns() {
    // 1. Language (Only if > 1)
    if (DATA.meta.availableLanguages.length > 1) {
        const options = DATA.meta.availableLanguages.map(lang => ({
            value: lang,
            text: lang.toUpperCase(),
            selected: lang === DATA.currentLanguage
        }));

        createDropdown('lang-switcher', DATA.currentLanguage.toUpperCase(), options, (newLang) => {
            if (newLang === DATA.currentLanguage) return;
            
            // Build URL: /india/hi/?salary=...
            const salaryParam = INPUT.value ? `?salary=${INPUT.value}` : '';
            let url = `/${DATA.meta.id}/`;
            if (newLang !== DATA.meta.defaultLanguage) url += `${newLang}/`;
            
            triggerPageTransition(url + salaryParam);
        });
    }

    // 2. Budget Year (Only on Results page logic, but we setup structure here)
    const budgets = DATA.meta.availableBudgets || [DATA.budget.year];
    const budgetOptions = budgets.map(y => ({
        value: y,
        text: y,
        selected: y === DATA.budget.year
    }));

    createDropdown('year-switcher', `YEAR: ${DATA.budget.year}`, budgetOptions, async (year) => {
        CONTAINER.style.opacity = '0.5';
        try {
            const res = await fetch(`/data/countries/${DATA.meta.id}/budgets/${year}.json`);
            if(res.ok) {
                const rawBudget = await res.json();
                
                // MAPPING FIX: Map IDs to Labels using current language strings
                if (rawBudget.expenditure && rawBudget.expenditure.categories) {
                     rawBudget.expenditure.categories = rawBudget.expenditure.categories.map(cat => ({
                         ...cat,
                         // UI_STRINGS is not global, we access via DATA.strings
                         label: DATA.strings.categories[cat.id] || cat.id 
                     }));
                }

                DATA.budget = rawBudget;
                
                // Update subtext
                const subtextEl = document.querySelector('.subtext');
                if(subtextEl) subtextEl.textContent = `${DATA.strings.subtext} • ${DATA.budget.year}`;

                runCalculation(parseFloat(INPUT.value));
            }
        } catch(e) { console.error(e); }
        CONTAINER.style.opacity = '1';
    });
}

function setupCountrySwitcher() {
    // Uses globalCountries injected by build script
    if (!DATA.globalCountries || DATA.globalCountries.length <= 1) return;

    const options = DATA.globalCountries.map(c => ({
        value: c.id,
        text: `${c.flag} ${c.name}`,
        selected: c.id === DATA.meta.id
    }));

    createDropdown('country-switcher', DATA.meta.name, options, (countryId) => {
        triggerPageTransition(`/${countryId}/`);
    });
}

// ... Utils (transitionToState, formatMoney, formatCompact) same as before ...
function transitionToState(state, callback) {
    CURTAIN.classList.add('active');
    setTimeout(() => {
        if (state === 'results') {
            HERO.classList.add('hidden');
            RESULTS.classList.remove('hidden');
            document.getElementById('hero-nav').classList.add('hidden'); // Hide Hero Nav
            window.scrollTo(0,0);
            if (callback) callback();
        } else if (state === 'hero') {
            RESULTS.classList.add('hidden');
            HERO.classList.remove('hidden');
            document.getElementById('hero-nav').classList.remove('hidden'); // Show Hero Nav
        }
        setTimeout(() => CURTAIN.classList.remove('active'), 300);
    }, 500);
}

function triggerPageTransition(url) {
    CURTAIN.classList.add('active');
    setTimeout(() => window.location.href = url, 500);
}

function formatMoney(amount) {
    const locale = DATA.meta.id === 'india' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: DATA.meta.currency,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatCompact(amount) {
    if (amount >= 10000000) return (amount/10000000).toFixed(1) + 'Cr';
    if (amount >= 100000) return (amount/100000).toFixed(1) + 'L';
    if (amount >= 1000) return (amount/1000).toFixed(0) + 'k';
    return amount;
}