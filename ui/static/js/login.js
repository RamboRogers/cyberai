document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitButton = loginForm.querySelector('button[type="submit"]');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Prevent default form submission
            errorMessage.style.display = 'none'; // Hide previous errors
            submitButton.disabled = true;
            submitButton.textContent = 'Authenticating...';

            const username = usernameInput.value;
            const password = passwordInput.value;

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                if (response.ok) {
                    // Login successful, redirect to the main application page
                    console.log('Login successful, redirecting...');
                    window.location.href = '/'; // Redirect to root
                } else {
                    // Login failed
                    let errorText = 'Login failed. Please check your credentials.';
                    if (response.status === 401) {
                        // Try to get more specific error from response body if available
                        try {
                            const data = await response.json();
                            errorText = data.error || errorText; // Use server error if provided
                        } catch (jsonError) {
                            // Use default error if response body is not JSON or empty
                            console.warn('Could not parse error response:', jsonError);
                        }
                    } else {
                         errorText = `Login failed (Status: ${response.status})`;
                    }

                    errorMessage.textContent = errorText;
                    errorMessage.style.display = 'block';
                    // Add shake animation class again if needed
                    errorMessage.style.animation = 'none'; // Reset animation
                    void errorMessage.offsetWidth; // Trigger reflow
                    errorMessage.style.animation = 'shake 0.5s';

                    submitButton.disabled = false;
                    submitButton.textContent = 'Login';
                    passwordInput.value = ''; // Clear password field
                    usernameInput.focus(); // Focus username again
                }
            } catch (error) {
                console.error('Login request error:', error);
                errorMessage.textContent = 'An error occurred during login. Please try again.';
                errorMessage.style.display = 'block';
                errorMessage.style.animation = 'none'; // Reset animation
                void errorMessage.offsetWidth; // Trigger reflow
                errorMessage.style.animation = 'shake 0.5s';
                submitButton.disabled = false;
                submitButton.textContent = 'Login';
            }
        });
    }
});