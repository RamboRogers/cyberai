// Simulated terminal typing effect
document.addEventListener('DOMContentLoaded', function() {
    const terminalText = document.getElementById('terminal-text');
    if (!terminalText) return;

    const text = "> INITIATING RECOVERY PROTOCOL...\n> SEARCHING FOR ALTERNATE PATHS...\n> REDIRECTING TO MAIN TERMINAL...";
    let i = 0;

    function typeWriter() {
        if (i < text.length) {
            terminalText.innerHTML += text.charAt(i);
            i++;

            // Add line break if newline character
            if (text.charAt(i-1) === '\n') {
                terminalText.innerHTML += '<br>';
            }

            setTimeout(typeWriter, 30);
        }
    }

    setTimeout(typeWriter, 500);
});