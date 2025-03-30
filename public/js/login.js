document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const formData = new FormData(e.target);
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = data.redirectUrl;
        } else {
            throw new Error(data.error || 'Login failed');
        }
    } catch (error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'bg-red-500/20 text-red-400 p-4 rounded-lg mb-4';
        errorDiv.textContent = error.message;
        e.target.insertBefore(errorDiv, e.target.firstChild);
    }
});
