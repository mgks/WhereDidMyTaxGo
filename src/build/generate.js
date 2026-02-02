const fs = require('fs');
const path = require('path');

// Paths
const DATA_DIR = path.join(__dirname, '../../data');
const DIST_DIR = path.join(__dirname, '../../dist');
// Pointing to the new index.html
const TEMPLATE_PATH = path.join(__dirname, '../client/templates/index.html');

// --- HELPERS ---

const readJSON = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e);
    }
    return null;
};

const copyDir = (src, dest) => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

const render = (tpl, data) => {
    // Inject JSON payload first
    let html = tpl.replace('{{DATA_INJECTION}}', JSON.stringify(data.clientPayload));
    // Replace text placeholders
    html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
    return html;
};

// LOGIC: Calculate % change between two budget objects
const calculateTrends = (current, previous) => {
    if (!previous || !previous.expenditure || !previous.expenditure.categories) return current;

    const prevMap = new Map(previous.expenditure.categories.map(c => [c.id, c.percent]));
    
    // Deep copy current
    const newBudget = JSON.parse(JSON.stringify(current));
    
    newBudget.expenditure.categories = newBudget.expenditure.categories.map(cat => {
        if (prevMap.has(cat.id)) {
            const prevVal = prevMap.get(cat.id);
            const currVal = cat.percent;
            // Formula: ((Current - Prev) / Prev) * 100
            // Handle divide by zero safety
            if (prevVal === 0) return cat;
            
            const change = ((currVal - prevVal) / prevVal) * 100;
            return { ...cat, change: parseFloat(change.toFixed(1)) };
        }
        return cat;
    });
    
    return newBudget;
};

// --- MAIN BUILD FUNCTION ---

async function build() {
    console.log('🏗️  Starting Build...');

    // 1. Load Config
    const config = readJSON(path.join(DATA_DIR, 'config.json'));
    if (!config) {
        console.error("❌ config.json missing!");
        return;
    }

    const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

    // Ensure Dist Exists
    if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR);

    // 2. Copy Assets
    console.log('📂 Copying Assets...');
    const clientDir = path.join(__dirname, '../client');
    const assetsDir = path.join(DIST_DIR, 'assets');
    
    // Copy Styles & Scripts
    if (fs.existsSync(path.join(clientDir, 'styles'))) {
        copyDir(path.join(clientDir, 'styles'), path.join(assetsDir, 'styles'));
    }
    if (fs.existsSync(path.join(clientDir, 'scripts'))) {
        copyDir(path.join(clientDir, 'scripts'), path.join(assetsDir, 'scripts'));
    }
    // Copy Social Images
    if (fs.existsSync(path.join(clientDir, 'social'))) {
        copyDir(path.join(clientDir, 'social'), path.join(assetsDir, 'social'));
    }
    
    // Copy Raw Data (for runtime fetching of backgrounds/other years)
    copyDir(DATA_DIR, path.join(DIST_DIR, 'data'));

    // 3. Prepare Global Country List (Only Enabled ones)
    const countriesDir = path.join(DATA_DIR, 'countries');
    const enabledCountries = config.countries.filter(c => c.enabled);
    
    const globalCountryList = enabledCountries.map(cConf => {
        const meta = readJSON(path.join(countriesDir, cConf.id, 'meta.json'));
        return meta ? { id: cConf.id, name: meta.name, flag: meta.flag } : null;
    }).filter(x => x);

    // 4. Generate Pages
    for (const cConf of enabledCountries) {
        // --- FIX: DEFINE VARIABLES HERE FIRST ---
        const countryId = cConf.id;
        const countryPath = path.join(countriesDir, countryId);
        const meta = readJSON(path.join(countryPath, 'meta.json'));
        
        if (!meta) continue;
        console.log(`🌍 Processing ${meta.name}...`);

        // A. Load Default Budget
        let budgetData = readJSON(path.join(countryPath, 'budgets', `${meta.defaultBudget}.json`));
        if (!budgetData) {
            console.error(`❌ Budget missing: ${meta.defaultBudget}`);
            continue;
        }

        // B. Load Achievements
        const achievements = readJSON(path.join(countryPath, 'achievements.json'));

        // C. AUTO-COMPARE TRENDS
        // Logic: specific to naming convention "YYYY-YY"
        // If current is "2026-27", try "2025-26"
        try {
            const currentYearInt = parseInt(meta.defaultBudget.split('-')[0]);
            const prevBudgetYear = `${currentYearInt - 1}-${(currentYearInt).toString().slice(-2)}`;
            const prevBudgetData = readJSON(path.join(countryPath, 'budgets', `${prevBudgetYear}.json`));

            if (prevBudgetData) {
                console.log(`   📊 Trends: Comparing ${meta.defaultBudget} vs ${prevBudgetYear}`);
                budgetData = calculateTrends(budgetData, prevBudgetData);
            }
        } catch (e) {
            console.warn("   ⚠️ Could not calculate trends (Filename format issue?)");
        }

        // D. Loop Languages & Render
        for (const lang of meta.availableLanguages) {
            const langData = readJSON(path.join(DATA_DIR, 'languages', `${lang}.json`));
            
            // Localization: Merge Labels into Budget Data
            const localizedBudget = JSON.parse(JSON.stringify(budgetData));
            if (localizedBudget.expenditure && localizedBudget.expenditure.categories) {
                localizedBudget.expenditure.categories = localizedBudget.expenditure.categories.map(cat => ({
                    ...cat,
                    // Look up label in lang file, fallback to ID if missing
                    label: langData.categories[cat.id] || cat.id 
                }));
            }

            // Determine if this is the "Master" Homepage
            const isDefaultCountry = cConf.default;
            const isDefaultLang = lang === meta.defaultLanguage;
            const isRootCandidate = isDefaultCountry && isDefaultLang;

            const clientPayload = {
                meta,
                budget: localizedBudget, // Contains Trends + Localized Labels
                achievements,
                globalCountries: globalCountryList,
                strings: langData,
                currentLanguage: lang
            };

            const baseRenderData = {
                lang,
                countryId: meta.id,
                title: `${langData.headline} | ${meta.name}`,
                description: langData.subtext,
                headline: langData.headline,
                subtext: `${langData.subtext} • ${budgetData.year}`,
                salaryInputLabel: langData.salaryInputLabel,
                cta: langData.cta,
                currencySymbol: meta.currencySymbol,
                disclaimer: langData.disclaimer,
                subheadline_blink: langData.subheadline_blink,
                clientPayload,
                // Canonical Default (Will be overwritten below)
                canonicalUrl: `https://tax.mgks.dev/${countryId}/` 
            };

            // RENDER 1: Folder Version (e.g. /india/ or /india/hi/)
            let folderUrl = `https://tax.mgks.dev/${countryId}/`;
            if (!isDefaultLang) folderUrl += `${lang}/`;

            const folderCanonical = isRootCandidate ? `https://tax.mgks.dev/` : folderUrl;

            const folderHtml = render(template, { 
                ...baseRenderData, 
                canonicalUrl: folderCanonical 
            });

            let outputDir = path.join(DIST_DIR, countryId);
            if (!isDefaultLang) outputDir = path.join(outputDir, lang);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            
            fs.writeFileSync(path.join(outputDir, 'index.html'), folderHtml);
            console.log(`   ✅ Generated: ${countryId}/${!isDefaultLang ? lang + '/' : ''}index.html`);

            // RENDER 2: Root Homepage (Only if Default)
            if (isRootCandidate) {
                console.log(`   🌟 Generating ROOT Homepage`);
                const rootHtml = render(template, { 
                    ...baseRenderData, 
                    canonicalUrl: `https://tax.mgks.dev/` 
                });
                fs.writeFileSync(path.join(DIST_DIR, 'index.html'), rootHtml);
            }
        }
    }

    // 5. Generate Sitemap.xml
    console.log('🗺️  Generating Sitemap...');
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    sitemap += `\n    <url><loc>https://tax.mgks.dev/</loc><changefreq>weekly</changefreq></url>`;

    for (const cConf of enabledCountries) {
         const meta = readJSON(path.join(countriesDir, cConf.id, 'meta.json'));
         for (const lang of meta.availableLanguages) {
             let url = `https://tax.mgks.dev/${cConf.id}/`;
             if (lang !== meta.defaultLanguage) url += `${lang}/`;
             sitemap += `\n    <url><loc>${url}</loc><changefreq>weekly</changefreq></url>`;
         }
    }
    sitemap += `\n</urlset>`;
    
    fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap);
    
    // Copy robots.txt
    if(fs.existsSync(path.join(clientDir, 'robots.txt'))) {
        fs.copyFileSync(path.join(clientDir, 'robots.txt'), path.join(DIST_DIR, 'robots.txt'));
    }

    console.log('🎉 Build Complete!');
}

build();