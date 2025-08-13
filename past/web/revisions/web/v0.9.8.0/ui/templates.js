/**
 * UNUSED V0.9 
 * Creates a select dropdown element dynamically.
 * @param {string} id - The ID for the select element.
 * @param {Array<{value: string, text: string}>} options - Array of option objects with value and text.
 * @param {string} defaultValue - The default selected value.
 * @returns {HTMLSelectElement} The created select element.
 */
export function createSelect(id, options, defaultValue) {
    const select = document.createElement('select');
    select.id = id;
    options.forEach(({ value, text }) => {
        const option = document.createElement('option');
        option.value = value;
        option.text = text;
        if (value === defaultValue) option.selected = true;
        select.appendChild(option);
    });
    return select;
}
