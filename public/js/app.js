// Main Application Initialization

// Global error handler — catches any unhandled Promise rejections across all modules
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
    // Prevent the default "uncaught" browser message
    event.preventDefault();
});

// Initialize Lucide icons
lucide.createIcons();

// Initialize Staff Directory
window.staffDirectory.initialize();
