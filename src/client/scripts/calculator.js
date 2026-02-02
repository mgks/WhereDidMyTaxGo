/**
 * Calculates tax based on progressive brackets.
 * Supports standard deduction and cess.
 */
export function calculateTax(salary, rules) {
    let taxableIncome = salary - (rules.standardDeduction || 0);
    if (taxableIncome <= 0) return 0;

    let tax = 0;
    let previousLimit = 0;

    // 1. Calculate Slab Tax
    for (const bracket of rules.brackets) {
        if (taxableIncome <= previousLimit) break;

        const currentLimit = bracket.limit === null ? Infinity : bracket.limit;
        const taxableAtThisRate = Math.min(taxableIncome, currentLimit) - previousLimit;
        
        if (taxableAtThisRate > 0) {
            tax += taxableAtThisRate * bracket.rate;
        }

        previousLimit = currentLimit;
    }

    // 2. Apply Cess (Percentage of the tax amount)
    if (rules.cess) {
        tax += tax * rules.cess;
    }

    // 3. Round off
    return Math.round(tax);
}

/**
 * Splits the total tax into categories based on budget percentages
 */
export function splitTax(totalTax, categories) {
    return categories.map(cat => ({
        ...cat,
        amount: Math.round(totalTax * cat.percent)
    })).sort((a, b) => b.amount - a.amount); // Sort highest spend first
}