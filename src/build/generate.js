const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DIST_DIR = path.join(__dirname, '../../dist');
const TEMPLATE_PATH = path.join(__dirname, '../client/templates/index.html');

const readJSON = (filePath) => {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) { console.error(`Error reading ${filePath}:`, e); }
    return null;
};

// Copy function
const copyDir = (src, dest) => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
};

const render = (tpl, data) => {
    let html = tpl.replace('{{DATA_INJECTION}}', JSON.stringify(data.clientPayload));
    html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
    return html;
};

async function build() {
    console.log('🏗️  Starting Build...');

    // 1. Load Config
    const config = readJSON(path.join(DATA_DIR, 'config.json'));
    if (!config) { console.error("❌ config.json missing!"); return; }

    const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
    if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR);

    // 2. Copy Assets
    console.log('📂 Copying Assets...');
    const clientDir = path.join(__dirname, '../client');
    const assetsDir = path.join(DIST_DIR, 'assets');
    
    if (fs.existsSync(path.join(clientDir, 'styles'))) copyDir(path.join(clientDir, 'styles'), path.join(assetsDir, 'styles'));
    if (fs.existsSync(path.join(clientDir, 'scripts'))) copyDir(path.join(clientDir, 'scripts'), path.join(assetsDir, 'scripts'));
    
    // Copy Data for runtime fetch (backgrounds, dynamic budgets)
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
        const countryId = cConf.id;
        const countryPath = path.join(countriesDir, countryId);
        const meta = readJSON(path.join(countryPath, 'meta.json'));
        
        if (!meta) continue;
        console.log(`🌍 Processing ${meta.name}...`);

        // Load Default Budget
        const budgetData = readJSON(path.join(countryPath, 'budgets', `${meta.defaultBudget}.json`));
        const achievements = readJSON(path.join(countryPath, 'achievements.json'));

        for (const lang of meta.availableLanguages) {
            const langData = readJSON(path.join(DATA_DIR, 'languages', `${lang}.json`));
            
            // MERGE Logic: Attach Labels to Budget Categories
            // Clone budget data to avoid reference issues
            const localizedBudget = JSON.parse(JSON.stringify(budgetData));
            
            if (localizedBudget.expenditure && localizedBudget.expenditure.categories) {
                localizedBudget.expenditure.categories = localizedBudget.expenditure.categories.map(cat => {
                    return {
                        ...cat,
                        // Look up label in lang file, fallback to ID if missing
                        label: langData.categories[cat.id] || cat.id 
                    };
                });
            }

            const clientPayload = {
                meta,
                budget: localizedBudget, // Use the localized version
                achievements,
                globalCountries: globalCountryList,
                strings: langData,
                currentLanguage: lang
            };

            const renderData = {
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
                clientPayload
            };

            const html = render(template, renderData);

            let outputDir = path.join(DIST_DIR, countryId);
            if (lang !== meta.defaultLanguage) outputDir = path.join(outputDir, lang);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            
            fs.writeFileSync(path.join(outputDir, 'index.html'), html);
            console.log(`   ✅ Generated: ${countryId}/${lang === meta.defaultLanguage ? '' : lang + '/'}index.html`);
        }
    }
    
    // Root Redirect
    const defaultC = enabledCountries.find(c => c.default) || enabledCountries[0];
    if (defaultC) {
        const rootHtml = `<meta http-equiv="refresh" content="0; url=/${defaultC.id}/" />`;
        fs.writeFileSync(path.join(DIST_DIR, 'index.html'), rootHtml);
    }

    console.log('🎉 Build Complete!');
}

build();