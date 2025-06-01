/**
 * Event dispatcher for handling custom events and errors.
 */
export function setupEventDispatcher({ speak }) {
    const errorLog = [];
    let settings = {};

    function toggleDebug({ show }) {
        const debug = document.getElementById('debug');
        if (debug) {
            const preElement = debug.querySelector('pre');
            if (preElement) { // Añadimos verificación
                const debugText = `Settings: ${JSON.stringify(settings, null, 2)}\nStream: ${settings.stream ? 'Active' : 'Inactive'}\nErrors:\n${errorLog.length ? errorLog.join('\n') : 'None'}`;
                preElement.textContent = debugText;
            } else {
                console.error('Debug pre element not found');
            }
            debug.style.display = show ? 'block' : 'none';
        } else {
            console.error('Debug element not found');
        }
    }

    function logError({ message }) {
        errorLog.push(message);
        if (errorLog.length > 50) errorLog.shift();
        toggleDebug({ show: true });
        speak('error', { message });
    }

    window.onerror = (message, source, lineno, colno, error) => {
        logError({ message: `${message} at ${source}:${lineno}:${colno}` });
        return true;
    };

    function dispatchEvent(eventName, detail) {
        const event = new CustomEvent(eventName, { detail });
        document.dispatchEvent(event);
        if (eventName === 'logError') {
            logError(detail);
        } else if (eventName === 'toggleDebug') {
            toggleDebug(detail);
        }
    }

    document.addEventListener('updateSettings', (e) => {
        settings = e.detail;
    });

    return { dispatchEvent };
}