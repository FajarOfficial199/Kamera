// Global utility functions
class Utils {
    static showLoading(element) {
        if (element) {
            const originalHTML = element.innerHTML;
            element.innerHTML = '<div class="loading"></div>';
            element.dataset.originalHTML = originalHTML;
            element.disabled = true;
        }
    }
    
    static hideLoading(element) {
        if (element && element.dataset.originalHTML) {
            element.innerHTML = element.dataset.originalHTML;
            element.disabled = false;
            delete element.dataset.originalHTML;
        }
    }
    
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Page specific initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(element => {
        element.addEventListener('mouseenter', function(e) {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = this.dataset.tooltip;
            document.body.appendChild(tooltip);
            
            const rect = this.getBoundingClientRect();
            tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10}px`;
            tooltip.style.left = `${rect.left + (rect.width - tooltip.offsetWidth) / 2}px`;
            
            this.dataset.tooltipId = tooltip.id = `tooltip-${Date.now()}`;
        });
        
        element.addEventListener('mouseleave', function() {
            const tooltip = document.getElementById(this.dataset.tooltipId);
            if (tooltip) {
                tooltip.remove();
            }
        });
    });
    
    // Add tooltip styles
    const style = document.createElement('style');
    style.textContent = `
        .tooltip {
            position: fixed;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 0.9rem;
            z-index: 1000;
            pointer-events: none;
            max-width: 200px;
            text-align: center;
        }
        
        .tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: rgba(0, 0, 0, 0.8) transparent transparent transparent;
        }
    `;
    document.head.appendChild(style);
});
