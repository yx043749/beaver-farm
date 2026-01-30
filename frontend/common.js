// common.js - 通用函数
// 动态获取后端地址
function getApiBase() {
    const currentUrl = window.location.origin;
    if (currentUrl === 'file://' || currentUrl.startsWith('file://')) {
        return 'http://localhost:3000/api';
    }
    return `${currentUrl}/api`;
}

// 显示通知
function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notificationContainer');
    if (!container) {
        const newContainer = document.createElement('div');
        newContainer.id = 'notificationContainer';
        document.body.appendChild(newContainer);
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                              type === 'error' ? 'exclamation-circle' : 
                              type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <div>${message}</div>
        </div>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
    }, duration);
}

// 显示确认对话框
function showConfirm(title, message, confirmCallback, cancelCallback) {
    const modalHtml = `
        <div class="modal-overlay active">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    ${message}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="handleCancel()">取消</button>
                    <button class="btn btn-primary" onclick="handleConfirm()">确定</button>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.id = 'confirmModal';
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    function handleConfirm() {
        if (confirmCallback) confirmCallback();
        closeModal();
    }
    
    function handleCancel() {
        if (cancelCallback) cancelCallback();
        closeModal();
    }
    
    window.handleConfirm = handleConfirm;
    window.handleCancel = handleCancel;
}

// 通用关闭模态框
function closeModal() {
    const modal = document.getElementById('customModal') || document.getElementById('confirmModal');
    if (modal) {
        const overlay = modal.querySelector('.modal-overlay');
        if (overlay) overlay.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
}

// 网络状态检测
function setupNetworkStatus() {
    const networkStatus = document.createElement('div');
    networkStatus.className = 'network-status';
    document.body.appendChild(networkStatus);
    
    function checkNetworkStatus() {
        if (navigator.onLine) {
            networkStatus.textContent = '在线';
            networkStatus.className = 'network-status online';
            setTimeout(() => {
                networkStatus.style.display = 'none';
            }, 2000);
        } else {
            networkStatus.textContent = '离线 - 检查网络连接';
            networkStatus.className = 'network-status offline';
        }
    }
    
    window.addEventListener('online', checkNetworkStatus);
    window.addEventListener('offline', checkNetworkStatus);
    checkNetworkStatus();
}

// 页面加载动画
function setupLoadingAnimation() {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.innerHTML = `
        <div class="loading-spinner"></div>
        <p>加载中...</p>
    `;
    document.body.appendChild(loadingOverlay);
    
    // 页面加载完成后隐藏
    window.addEventListener('load', () => {
        setTimeout(() => {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 300);
        }, 500);
    });
}

// 初始化通用功能
document.addEventListener('DOMContentLoaded', () => {
    setupNetworkStatus();
    setupLoadingAnimation();
});