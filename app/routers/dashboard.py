from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from app.models.user import User, UserRole
from app.services.auth_service import get_current_user, require_role

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
            .role-OWNER { background-color: #2196F3; }
            .role-STAFF { background-color: #4CAF50; }
            .container { padding: 20px; max-width: 1200px; margin: 0 auto; }
            .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }
            .card h3 { margin-top: 0; color: #333; }
            .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 14px; }
            .btn-logout { background-color: #f44336; color: white; }
            .btn-primary { background-color: #2196F3; color: white; }
            .btn:hover { opacity: 0.9; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .stats { display: flex; gap: 20px; flex-wrap: wrap; }
            .stat-item { background: #f9f9f9; padding: 15px; border-radius: 4px; text-align: center; min-width: 100px; }
            .stat-value { font-size: 24px; font-weight: bold; color: #333; }
            .stat-label { font-size: 12px; color: #666; }
            .loading { text-align: center; padding: 50px; }
            .hidden { display: none; }
        </style>
    </head>
    <body>
        <div id="loading" class="loading">
            <h2>Loading...</h2>
        </div>
        
        <div id="dashboard" class="hidden">
            <div class="header">
                <h1>🎫 Virtual Queue Dashboard</h1>
                <div class="user-info">
                    <span>Welcome, <span id="userName"></span></span>
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
            
            function getAdminContent() {
                return `
                    <div class="card">
                        <h3>🔧 Admin Panel</h3>
                        <p>As an administrator, you have full access to all system features.</p>
                    </div>
                    <div class="grid">
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
                    
                    // Load role-specific content
                    let content = '';
                    if (user.role === 'ADMIN') {
                        content = getAdminContent();
                    } else if (user.role === 'OWNER') {
                        content = getOwnerContent();
                    } else if (user.role === 'STAFF') {
                        content = getStaffContent();
                    }
                    document.getElementById('content').innerHTML = content;
                    
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

@router.get("/admin-only")
def admin_only_endpoint(current_user: User = Depends(require_role(UserRole.ADMIN))):
    """Admin-only endpoint example."""
    return {"message": "Welcome, Admin!", "user": current_user.username}

@router.get("/owner-staff")
def owner_staff_endpoint(current_user: User = Depends(require_role(UserRole.OWNER, UserRole.STAFF))):
    """Endpoint accessible by OWNER and STAFF."""
    return {"message": f"Welcome, {current_user.role.value}!", "user": current_user.username}

