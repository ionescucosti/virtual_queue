from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from app.models.user import User, UserRole
from app.services.auth_service import require_role, get_current_user_business

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("", response_class=HTMLResponse)
def dashboard():
    """Role-based dashboard - loads user data via JavaScript."""

    dashboard_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Dashboard - Virtual Queue</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
            .header { background-color: #333; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; }
            .header h1 { margin: 0; font-size: 20px; }
            .user-info { display: flex; align-items: center; gap: 15px; }
            .role-badge { padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .role-ADMIN { background-color: #f44336; }
            .role-MANAGER { background-color: #2196F3; }
            .role-STAFF { background-color: #4CAF50; }
            .container { padding: 20px; max-width: 1200px; margin: 0 auto; }
            .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }
            .card h3 { margin-top: 0; color: #333; }
            .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 14px; }
            .btn-logout { background-color: #f44336; color: white; }
            .btn-primary { background-color: #2196F3; color: white; }
            .btn-secondary { background-color: #6c757d; color: white; }
            .btn:hover { opacity: 0.9; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .stats { display: flex; gap: 20px; flex-wrap: wrap; }
            .stat-item { background: #f9f9f9; padding: 15px; border-radius: 4px; text-align: center; min-width: 100px; }
            .stat-value { font-size: 24px; font-weight: bold; color: #333; }
            .stat-label { font-size: 12px; color: #666; }
            .loading { text-align: center; padding: 50px; }
            .hidden { display: none; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .form-group input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div id="loading" class="loading">
            <h2>Loading...</h2>
        </div>
        
        <div id="dashboard" class="hidden">
            <div class="header">
                <h1>Virtual Queue Dashboard</h1>
                <div class="user-info">
                    <span id="userName"></span>
                    <span id="roleBadge" class="role-badge"></span>
                    <button class="btn btn-logout" onclick="logout()">Logout</button>
                </div>
            </div>
            <div class="container">
                <div id="content"></div>
            </div>
        </div>
        
        <script>
            function logout() {
                localStorage.removeItem('access_token');
                window.location.href = '/auth/login-page';
            }
            
            // Business Management Functions
            async function loadBusinesses() {
                const token = localStorage.getItem('access_token');
                try {
                    const response = await fetch('/api/businesses', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (response.ok) {
                        const businesses = await response.json();
                        renderBusinessList(businesses);
                    }
                } catch (err) {
                    console.error('Error loading businesses:', err);
                }
            }
            
            function renderBusinessList(businesses) {
                const container = document.getElementById('businessList');
                if (!container) return;
                
                if (businesses.length === 0) {
                    container.innerHTML = '<p style="color: #666;">No businesses yet. Click "Create Business" to add one.</p>';
                    return;
                }
                
                let html = '<table style="width: 100%; border-collapse: collapse;">';
                html += '<thead><tr style="background: #f0f0f0;"><th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Name</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Address</th><th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Phone</th><th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Actions</th></tr></thead>';
                html += '<tbody>';
                businesses.forEach(b => {
                    html += `<tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 10px;">${escapeHtml(b.name)}</td>
                        <td style="padding: 10px;">${escapeHtml(b.address)}</td>
                        <td style="padding: 10px;">${escapeHtml(b.phone)}</td>
                        <td style="padding: 10px; text-align: center;">
                            <button class="btn btn-primary" onclick="editBusiness(${b.id}, '${escapeHtml(b.name)}', '${escapeHtml(b.address)}', '${escapeHtml(b.phone)}')" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">Edit</button>
                            <button class="btn btn-logout" onclick="deleteBusiness(${b.id})" style="padding: 5px 10px; font-size: 12px;">Delete</button>
                        </td>
                    </tr>`;
                });
                html += '</tbody></table>';
                container.innerHTML = html;
            }
            
            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }
            
            function showCreateBusinessForm() {
                document.getElementById('businessFormTitle').textContent = 'Create New Business';
                document.getElementById('editBusinessId').value = '';
                document.getElementById('businessName').value = '';
                document.getElementById('businessAddress').value = '';
                document.getElementById('businessPhone').value = '';
                document.getElementById('businessFormContainer').classList.remove('hidden');
            }
            
            function editBusiness(id, name, address, phone) {
                document.getElementById('businessFormTitle').textContent = 'Edit Business';
                document.getElementById('editBusinessId').value = id;
                document.getElementById('businessName').value = name;
                document.getElementById('businessAddress').value = address;
                document.getElementById('businessPhone').value = phone;
                document.getElementById('businessFormContainer').classList.remove('hidden');
            }
            
            function hideBusinessForm() {
                document.getElementById('businessFormContainer').classList.add('hidden');
            }
            
            async function saveBusiness() {
                const token = localStorage.getItem('access_token');
                const id = document.getElementById('editBusinessId').value;
                const name = document.getElementById('businessName').value.trim();
                const address = document.getElementById('businessAddress').value.trim();
                const phone = document.getElementById('businessPhone').value.trim();
                
                if (!name || !address || !phone) {
                    alert('Please fill in all fields');
                    return;
                }
                
                const data = { name, address, phone };
                
                try {
                    let response;
                    if (id) {
                        // Update existing business
                        response = await fetch('/api/businesses/' + id, {
                            method: 'PUT',
                            headers: {
                                'Authorization': 'Bearer ' + token,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(data)
                        });
                    } else {
                        // Create new business
                        response = await fetch('/api/businesses', {
                            method: 'POST',
                            headers: {
                                'Authorization': 'Bearer ' + token,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(data)
                        });
                    }
                    
                    if (response.ok) {
                        hideBusinessForm();
                        loadBusinesses(); // Refresh list instantly
                    } else {
                        const error = await response.json();
                        alert('Error: ' + (error.detail || 'Failed to save business'));
                    }
                } catch (err) {
                    console.error('Error saving business:', err);
                    alert('Error saving business');
                }
            }
            
            async function deleteBusiness(id) {
                if (!confirm('Are you sure you want to delete this business?')) return;
                
                const token = localStorage.getItem('access_token');
                try {
                    const response = await fetch('/api/businesses/' + id, {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    
                    if (response.ok || response.status === 204) {
                        loadBusinesses(); // Refresh list instantly
                    } else {
                        const error = await response.json();
                        alert('Error: ' + (error.detail || 'Failed to delete business'));
                    }
                } catch (err) {
                    console.error('Error deleting business:', err);
                    alert('Error deleting business');
                }
            }
            
            function getAdminContent() {
                return `
                    <div class="card">
                        <h3>🔧 Admin Panel</h3>
                        <p>As an administrator, you have full access to all system features.</p>
                    </div>
                    <div class="grid">
                        <div class="card" style="grid-column: 1 / -1;">
                            <h3>🏢 Business Management</h3>
                            <p>Create and manage businesses.</p>
                            <button class="btn btn-primary" onclick="showCreateBusinessForm()" style="margin-bottom: 15px;">+ Create Business</button>
                            <div id="businessFormContainer" class="hidden" style="margin-bottom: 15px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
                                <h4 id="businessFormTitle">Create New Business</h4>
                                <input type="hidden" id="editBusinessId" value="">
                                <div style="margin-bottom: 10px;">
                                    <label>Name:</label><br>
                                    <input type="text" id="businessName" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <label>Address:</label><br>
                                    <input type="text" id="businessAddress" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                </div>
                                <div style="margin-bottom: 10px;">
                                    <label>Phone:</label><br>
                                    <input type="text" id="businessPhone" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                </div>
                                <button class="btn btn-primary" onclick="saveBusiness()">Save</button>
                                <button class="btn" onclick="hideBusinessForm()" style="background: #ccc;">Cancel</button>
                            </div>
                            <div id="businessList">
                                <p>Loading businesses...</p>
                            </div>
                        </div>
                        <div class="card">
                            <h3>👥 User Management</h3>
                            <p>Create, edit, and manage user accounts.</p>
                            <div class="stats">
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Total Users</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Active</div>
                                </div>
                            </div>
                            <br>
                            <a href="/auth/register" class="btn btn-primary">Register New User</a>
                        </div>
                        <div class="card">
                            <h3>📊 System Statistics</h3>
                            <p>View system-wide statistics and reports.</p>
                            <div class="stats">
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Total Queues</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Active Sessions</div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <h3>⚙️ System Settings</h3>
                            <p>Configure system-wide settings and preferences.</p>
                        </div>
                        <div class="card">
                            <h3>📋 Audit Logs</h3>
                            <p>View system audit logs and user activities.</p>
                        </div>
                    </div>
                `;
            }
            
            function getOwnerContent() {
                return `
                    <div class="card">
                        <h3>🏢 Owner Dashboard</h3>
                        <p>Manage your business queues and staff.</p>
                    </div>
                    <div class="grid">
                        <div class="card">
                            <h3>📋 My Queues</h3>
                            <p>View and manage your business queues.</p>
                            <div class="stats">
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Active Queues</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">People Waiting</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">-- min</div>
                                    <div class="stat-label">Avg Wait Time</div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <h3>👥 Staff Management</h3>
                            <p>Manage your staff members and their permissions.</p>
                            <div class="stats">
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Total Staff</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Online Now</div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <h3>📊 Business Analytics</h3>
                            <p>View reports and analytics for your business.</p>
                        </div>
                    </div>
                `;
            }
            
            function getStaffContent() {
                return `
                    <div class="card">
                        <h3>💼 Staff Dashboard</h3>
                        <p>Manage your assigned queues and serve customers.</p>
                    </div>
                    <div class="grid">
                        <div class="card">
                            <h3>📋 My Queue</h3>
                            <p>View and serve customers in your assigned queue.</p>
                            <div class="stats">
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Next in Queue</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">People Waiting</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">--</div>
                                    <div class="stat-label">Served Today</div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <h3>📞 Call Next Customer</h3>
                            <p>Call the next customer from the queue.</p>
                            <br>
                            <button class="btn btn-primary" onclick="alert('Feature coming soon!')">Call Next Customer</button>
                        </div>
                    </div>
                `;
            }
            
            // Load user data on page load
            (async function() {
                const token = localStorage.getItem('access_token');
                if (!token) {
                    window.location.href = '/auth/login-page';
                    return;
                }
                
                try {
                    const response = await fetch('/auth/me', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    
                    if (!response.ok) {
                        localStorage.removeItem('access_token');
                        window.location.href = '/auth/login-page';
                        return;
                    }
                    
                    const user = await response.json();
                    
                    // Update UI with user data
                    document.getElementById('userName').textContent = user.name + ' ' + user.lastname;
                    document.getElementById('roleBadge').textContent = user.role;
                    document.getElementById('roleBadge').className = 'role-badge role-' + user.role;
                    
                    // Redirect MANAGER users to their business dashboard
                    if (user.role === 'MANAGER') {
                        window.location.href = '/dashboard/my-business';
                        return;
                    }
                    
                    // Load role-specific content
                    let content = '';
                    if (user.role === 'ADMIN') {
                        content = getAdminContent();
                    } else if (user.role === 'STAFF') {
                        content = getStaffContent();
                    }
                    document.getElementById('content').innerHTML = content;
                    
                    // Load businesses if admin
                    if (user.role === 'ADMIN') {
                        loadBusinesses();
                    }
                    
                    // Show dashboard, hide loading
                    document.getElementById('loading').classList.add('hidden');
                    document.getElementById('dashboard').classList.remove('hidden');
                    
                } catch (err) {
                    console.error('Error loading user data:', err);
                    localStorage.removeItem('access_token');
                    window.location.href = '/auth/login-page';
                }
            })();
        </script>
    </body>
    </html>
    """

    return HTMLResponse(content=dashboard_html)

@router.get("/my-business", response_class=HTMLResponse)
def manager_business_dashboard(current_user: User = Depends(get_current_user_business)):
    """Manager business dashboard - allows business editing and queue management."""

    # Ensure only MANAGER and STAFF can access this endpoint
    if current_user.role == UserRole.ADMIN:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin users should use the main dashboard"
        )

    business_dashboard_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>My Business Dashboard - Virtual Queue</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
            .header { background-color: #333; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; }
            .header h1 { margin: 0; font-size: 20px; }
            .user-info { display: flex; align-items: center; gap: 15px; }
            .role-badge { padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .role-MANAGER { background-color: #2196F3; }
            .role-STAFF { background-color: #4CAF50; }
            .container { padding: 20px; max-width: 1200px; margin: 0 auto; }
            .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }
            .card h3 { margin-top: 0; color: #333; }
            .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 14px; }
            .btn-logout { background-color: #f44336; color: white; }
            .btn-primary { background-color: #2196F3; color: white; }
            .btn-secondary { background-color: #6c757d; color: white; }
            .btn:hover { opacity: 0.9; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .stats { display: flex; gap: 20px; flex-wrap: wrap; }
            .stat-item { background: #f9f9f9; padding: 15px; border-radius: 4px; text-align: center; min-width: 100px; }
            .stat-value { font-size: 24px; font-weight: bold; color: #333; }
            .stat-label { font-size: 12px; color: #666; }
            .loading { text-align: center; padding: 50px; }
            .hidden { display: none; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .form-group input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div id="loading" class="loading">
            <h2>Loading...</h2>
        </div>
        
        <div id="dashboard" class="hidden">
            <div class="header">
                <h1>My Business Dashboard</h1>
                <div class="user-info">
                    <span id="userName"></span>
                    <span id="roleBadge" class="role-badge"></span>
                    <button class="btn btn-logout" onclick="logout()">Logout</button>
                </div>
            </div>
            <div class="container">
                <div id="content"></div>
            </div>
        </div>
        
        <script>
            let currentBusiness = null;
            
            function logout() {
                localStorage.removeItem('access_token');
                window.location.href = '/auth/login-page';
            }
            
            async function loadMyBusiness() {
                const token = localStorage.getItem('access_token');
                try {
                    const response = await fetch('/api/businesses/my-business', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (response.ok) {
                        currentBusiness = await response.json();
                        renderBusinessDashboard();
                    } else {
                        const error = await response.json();
                        alert('Error loading business: ' + (error.detail || 'Unknown error'));
                    }
                } catch (err) {
                    console.error('Error loading business:', err);
                    alert('Error loading business data');
                }
            }
            
            function renderBusinessDashboard() {
                if (!currentBusiness) return;
                
                let content = `
                    <div class="card">
                        <h3>🏢 ${escapeHtml(currentBusiness.name)}</h3>
                        <p><strong>Address:</strong> ${escapeHtml(currentBusiness.address)}</p>
                        <p><strong>Phone:</strong> ${escapeHtml(currentBusiness.phone)}</p>
                        <button class="btn btn-primary" onclick="showEditBusinessForm()">Edit Business Details</button>
                    </div>
                    
                    <div id="editBusinessForm" class="card hidden">
                        <h3>Edit Business Details</h3>
                        <div class="form-group">
                            <label>Business Name:</label>
                            <input type="text" id="editName" value="${escapeHtml(currentBusiness.name)}">
                        </div>
                        <div class="form-group">
                            <label>Address:</label>
                            <input type="text" id="editAddress" value="${escapeHtml(currentBusiness.address)}">
                        </div>
                        <div class="form-group">
                            <label>Phone:</label>
                            <input type="text" id="editPhone" value="${escapeHtml(currentBusiness.phone)}">
                        </div>
                        <button class="btn btn-primary" onclick="saveBusinessChanges()">Save Changes</button>
                        <button class="btn btn-secondary" onclick="hideEditBusinessForm()" style="margin-left: 10px;">Cancel</button>
                    </div>
                    
                    <!-- Business Statistics Overview -->
                    <div class="card">
                        <h3>📊 Business Overview</h3>
                        <div class="stats">
                            <div class="stat-item">
                                <div class="stat-value" id="activeQueues">0</div>
                                <div class="stat-label">Active Queues</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value" id="totalWaiting">0</div>
                                <div class="stat-label">People Waiting</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value" id="avgWaitTime">0 min</div>
                                <div class="stat-label">Avg Wait Time</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value" id="servedToday">0</div>
                                <div class="stat-label">Served Today</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="grid">
                        <div class="card">
                            <h3>📋 Queue Management</h3>
                            <p>Create and manage your business queues.</p>
                            <div id="queuesList">
                                <p>Loading queues...</p>
                            </div>
                            <button class="btn btn-primary" onclick="showCreateQueueForm()" style="margin-top: 15px;">+ Create New Queue</button>
                            
                            <div id="createQueueForm" class="hidden" style="margin-top: 15px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
                                <h4>Create New Queue</h4>
                                <div class="form-group">
                                    <label>Queue Name:</label>
                                    <input type="text" id="newQueueName" placeholder="e.g., Main Bar, VIP Section">
                                </div>
                                <div class="form-group">
                                    <label>Max Capacity:</label>
                                    <input type="number" id="newQueueCapacity" value="5" min="1" max="100">
                                </div>
                                <button class="btn btn-primary" onclick="createNewQueue()">Create Queue</button>
                                <button class="btn btn-secondary" onclick="hideCreateQueueForm()" style="margin-left: 10px;">Cancel</button>
                            </div>
                        </div>
                        
                        <div class="card">
                            <h3>📊 Business Analytics</h3>
                            <p>View reports and analytics for your business.</p>
                            <div class="stats">
                                <div class="stat-item">
                                    <div class="stat-value" id="todayCustomers">0</div>
                                    <div class="stat-label">Today's Customers</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value" id="conversionRate">0%</div>
                                    <div class="stat-label">Conversion Rate</div>
                                </div>
                            </div>
                            <br>
                            <button class="btn btn-primary" onclick="viewDetailedAnalytics()">View Detailed Analytics</button>
                        </div>
                    </div>
                `;
                
                document.getElementById('content').innerHTML = content;
                loadQueues();
            }
            
            async function loadQueues() {
                if (!currentBusiness) return;
                
                const token = localStorage.getItem('access_token');
                try {
                    const response = await fetch(`/api/businesses/${currentBusiness.id}/queues`, {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (response.ok) {
                        const queues = await response.json();
                        renderQueuesList(queues);
                        updateStatistics(queues);
                    } else {
                        document.getElementById('queuesList').innerHTML = '<p style="color: #f44336;">Error loading queues</p>';
                    }
                } catch (err) {
                    console.error('Error loading queues:', err);
                    document.getElementById('queuesList').innerHTML = '<p style="color: #f44336;">Error loading queues</p>';
                }
            }
            
            function renderQueuesList(queues) {
                const container = document.getElementById('queuesList');
                if (!container) return;
                
                if (queues.length === 0) {
                    container.innerHTML = '<p style="color: #666;">No queues yet. Create your first queue below.</p>';
                    return;
                }
                
                let html = '<div style="margin-top: 10px;">';
                queues.forEach(queue => {
                    const statusColor = queue.is_active ? '#4CAF50' : '#f44336';
                    const statusText = queue.is_active ? 'Active' : 'Inactive';
                    
                    html += `
                        <div style="border: 1px solid #e0e0e0; border-radius: 4px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h4 style="margin: 0; color: #333;">${escapeHtml(queue.name)}</h4>
                                <p style="margin: 5px 0; color: #666;">
                                    <span style="color: ${statusColor}; font-weight: bold;">● ${statusText}</span> | 
                                    ${queue.current_waiting} waiting | 
                                    Capacity: ${queue.max_bar_capacity}
                                </p>
                            </div>
                            <div>
                                <button class="btn btn-primary" onclick="toggleQueueStatus(${queue.id}, ${queue.is_active})" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">
                                    ${queue.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                                <button class="btn btn-secondary" onclick="editQueue(${queue.id}, '${escapeHtml(queue.name)}', ${queue.max_bar_capacity})" style="padding: 5px 10px; font-size: 12px;">
                                    Edit
                                </button>
                            </div>
                        </div>
                    `;
                });
                html += '</div>';
                container.innerHTML = html;
            }
            
            function updateStatistics(queues) {
                const activeQueues = queues.filter(q => q.is_active).length;
                const totalWaiting = queues.reduce((sum, q) => sum + q.current_waiting, 0);
                const avgWaitTime = totalWaiting > 0 ? Math.round(totalWaiting * 5) : 0; // Rough estimate: 5 min per person
                
                document.getElementById('activeQueues').textContent = activeQueues;
                document.getElementById('totalWaiting').textContent = totalWaiting;
                document.getElementById('avgWaitTime').textContent = avgWaitTime + ' min';
                
                // For now, set served today to a placeholder since we need analytics API
                document.getElementById('servedToday').textContent = '--';
                document.getElementById('todayCustomers').textContent = '--';
                document.getElementById('conversionRate').textContent = '--';
            }
            
            async function toggleQueueStatus(queueId, isActive) {
                if (!currentBusiness) return;
                
                const token = localStorage.getItem('access_token');
                try {
                    const response = await fetch(`/api/businesses/${currentBusiness.id}/queues/${queueId}/status`, {
                        method: 'PATCH',
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    
                    if (response.ok) {
                        loadQueues(); // Refresh the list
                    } else {
                        const error = await response.json();
                        alert('Error: ' + (error.detail || 'Failed to toggle queue status'));
                    }
                } catch (err) {
                    console.error('Error toggling queue status:', err);
                    alert('Error toggling queue status');
                }
            }
            
            function showCreateQueueForm() {
                document.getElementById('createQueueForm').classList.remove('hidden');
            }
            
            function hideCreateQueueForm() {
                document.getElementById('createQueueForm').classList.add('hidden');
                document.getElementById('newQueueName').value = '';
                document.getElementById('newQueueCapacity').value = '5';
            }
            
            async function createNewQueue() {
                if (!currentBusiness) return;
                
                const name = document.getElementById('newQueueName').value.trim();
                const capacity = parseInt(document.getElementById('newQueueCapacity').value);
                
                if (!name) {
                    alert('Please enter a queue name');
                    return;
                }
                
                if (!capacity || capacity < 1) {
                    alert('Please enter a valid capacity (minimum 1)');
                    return;
                }
                
                const token = localStorage.getItem('access_token');
                const data = { name, max_bar_capacity: capacity };
                
                try {
                    const response = await fetch(`/api/businesses/${currentBusiness.id}/queues`, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    if (response.ok) {
                        hideCreateQueueForm();
                        loadQueues(); // Refresh the list
                        alert('Queue created successfully!');
                    } else {
                        const error = await response.json();
                        alert('Error: ' + (error.detail || 'Failed to create queue'));
                    }
                } catch (err) {
                    console.error('Error creating queue:', err);
                    alert('Error creating queue');
                }
            }
            
            function editQueue(queueId, name, capacity) {
                // For now, just show the current values - could be enhanced with a proper edit form
                const newName = prompt('Queue Name:', name);
                if (newName && newName.trim() !== name) {
                    updateQueue(queueId, { name: newName.trim() });
                }
            }
            
            async function updateQueue(queueId, data) {
                if (!currentBusiness) return;
                
                const token = localStorage.getItem('access_token');
                try {
                    const response = await fetch(`/api/businesses/${currentBusiness.id}/queues/${queueId}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    if (response.ok) {
                        loadQueues(); // Refresh the list
                        alert('Queue updated successfully!');
                    } else {
                        const error = await response.json();
                        alert('Error: ' + (error.detail || 'Failed to update queue'));
                    }
                } catch (err) {
                    console.error('Error updating queue:', err);
                    alert('Error updating queue');
                }
            }
            
            
            function showEditBusinessForm() {
                document.getElementById('editBusinessForm').classList.remove('hidden');
            }
            
            function hideEditBusinessForm() {
                document.getElementById('editBusinessForm').classList.add('hidden');
            }
            
            async function saveBusinessChanges() {
                const token = localStorage.getItem('access_token');
                const name = document.getElementById('editName').value.trim();
                const address = document.getElementById('editAddress').value.trim();
                const phone = document.getElementById('editPhone').value.trim();
                
                if (!name || !address || !phone) {
                    alert('Please fill in all fields');
                    return;
                }
                
                const data = { name, address, phone };
                
                try {
                    const response = await fetch('/api/businesses/my-business', {
                        method: 'PUT',
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(data)
                    });
                    
                    if (response.ok) {
                        currentBusiness = await response.json();
                        hideEditBusinessForm();
                        renderBusinessDashboard();
                        alert('Business details updated successfully!');
                    } else {
                        const error = await response.json();
                        alert('Error: ' + (error.detail || 'Failed to update business'));
                    }
                } catch (err) {
                    console.error('Error updating business:', err);
                    alert('Error updating business');
                }
            }
            
            function viewDetailedAnalytics() {
                if (!currentBusiness) return;
                alert('Detailed analytics feature coming soon! This will show comprehensive reports for your business.');
            }
            
            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }
            
            // Load user and business data on page load
            (async function() {
                const token = localStorage.getItem('access_token');
                if (!token) {
                    window.location.href = '/auth/login-page';
                    return;
                }
                
                try {
                    const response = await fetch('/auth/me', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    
                    if (!response.ok) {
                        localStorage.removeItem('access_token');
                        window.location.href = '/auth/login-page';
                        return;
                    }
                    
                    const user = await response.json();
                    
                    // Update UI with user data
                    document.getElementById('userName').textContent = user.name + ' ' + user.lastname;
                    document.getElementById('roleBadge').textContent = user.role;
                    document.getElementById('roleBadge').className = 'role-badge role-' + user.role;
                    
                    // Only MANAGER and STAFF should access this page
                    if (user.role === 'ADMIN') {
                        window.location.href = '/dashboard';
                        return;
                    }
                    
                    // Load business data
                    await loadMyBusiness();
                    
                    // Show dashboard, hide loading
                    document.getElementById('loading').classList.add('hidden');
                    document.getElementById('dashboard').classList.remove('hidden');
                    
                } catch (err) {
                    console.error('Error loading user data:', err);
                    localStorage.removeItem('access_token');
                    window.location.href = '/auth/login-page';
                }
            })();
        </script>
    </body>
    </html>
    """

    return HTMLResponse(content=business_dashboard_html)

@router.get("/admin-only")
def admin_only_endpoint(current_user: User = Depends(require_role(UserRole.ADMIN))):
    """Admin-only endpoint example."""
    return {"message": "Admin Dashboard", "user": current_user.username}

@router.get("/owner-staff")
def manager_staff_endpoint(current_user: User = Depends(require_role(UserRole.MANAGER, UserRole.STAFF))):
    """Endpoint accessible by MANAGER and STAFF."""
    return {"message": f"{current_user.role.value} Dashboard", "user": current_user.username}
