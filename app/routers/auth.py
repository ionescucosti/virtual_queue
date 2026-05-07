import logging
from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.schemas.auth import (
    UserRegisterRequest, TokenResponse, UserResponse
)
from app.services.auth_service import (
    get_db, create_access_token, get_current_user, require_role
)
from app.services.email_service import send_activation_email

logger = logging.getLogger("virtual_queue")

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.get("/register", response_class=HTMLResponse)
def register_page():
    """Show public registration form."""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Register - Virtual Queue</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input, select { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
            button { width: 100%; padding: 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
            button:hover { background-color: #45a049; }
            h2 { text-align: center; color: #333; }
            .logo { text-align: center; margin-bottom: 20px; font-size: 24px; }
            .error { color: #f44336; margin-bottom: 15px; text-align: center; }
            .success { color: #4CAF50; margin-bottom: 15px; text-align: center; }
            .login-link { text-align: center; margin-top: 15px; }
            .login-link a { color: #2196F3; }
        </style>
    </head>
    <body>
        <div class="logo">🎫 Virtual Queue</div>
        <h2>Create Account</h2>
        <div id="error" class="error"></div>
        <div id="success" class="success"></div>
        <form id="registerForm">
            <div class="form-group">
                <label for="name">First Name:</label>
                <input type="text" id="name" name="name" required>
            </div>
            <div class="form-group">
                <label for="lastname">Last Name:</label>
                <input type="text" id="lastname" name="lastname" required>
            </div>
            <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
            </div>
            <div class="form-group">
                <label for="email">Email:</label>
                <input type="email" id="email" name="email" required>
            </div>
            <button type="submit">Register</button>
        </form>
        <div class="login-link">
            Already have an account? <a href="/auth/login-page">Login here</a>
        </div>
        <script>
            document.getElementById('registerForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                document.getElementById('error').textContent = '';
                document.getElementById('success').textContent = '';
                
                const formData = new URLSearchParams();
                formData.append('name', document.getElementById('name').value);
                formData.append('lastname', document.getElementById('lastname').value);
                formData.append('username', document.getElementById('username').value);
                formData.append('email', document.getElementById('email').value);
                
                try {
                    const response = await fetch('/auth/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData
                    });
                    
                    if (response.ok) {
                        document.getElementById('registerForm').style.display = 'none';
                        document.getElementById('success').innerHTML = 
                            '<strong>Registration successful!</strong><br><br>' +
                            'We have sent an activation email to your address.<br>' +
                            'Please check your inbox and click the activation link to set your password.';
                    } else {
                        const error = await response.json();
                        document.getElementById('error').textContent = error.detail || 'Registration failed';
                    }
                } catch (err) {
                    document.getElementById('error').textContent = 'Connection error. Please try again.';
                }
            });
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@router.post("/register", response_model=UserResponse)
def register_user(
    name: str = Form(...),
    lastname: str = Form(...),
    username: str = Form(...),
    email: str = Form(...),
    db: Session = Depends(get_db)
):
    """Public registration endpoint. Creates a STAFF user and sends activation email."""
    # Check if username already exists
    existing_user = db.query(User).filter(User.username == username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if email already exists
    existing_email = db.query(User).filter(User.email == email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user with activation token (default role: STAFF)
    activation_token = User.generate_activation_token()
    new_user = User(
        name=name,
        lastname=lastname,
        username=username,
        email=email,
        role=UserRole.STAFF,  # Default role for self-registration
        is_active=False,
        activation_token=activation_token,
        password=None
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Send activation email
    try:
        send_activation_email(email, activation_token, name)
        logger.info(f"Activation email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send activation email: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send activation email. Please try again later."
        )

    return new_user

@router.post("/register-admin", response_model=UserResponse)
def register_user_by_admin(
    request: UserRegisterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    """Register a new user with any role. Only ADMIN can use this endpoint."""
    # Check if username already exists
    existing_user = db.query(User).filter(User.username == request.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if email already exists
    existing_email = db.query(User).filter(User.email == request.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user with activation token
    activation_token = User.generate_activation_token()
    new_user = User(
        name=request.name,
        lastname=request.lastname,
        username=request.username,
        email=request.email,
        role=request.role,
        is_active=False,
        activation_token=activation_token,
        password=None
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Send activation email
    try:
        send_activation_email(request.email, activation_token, request.name)
        logger.info(f"Activation email sent to {request.email}")
    except Exception as e:
        logger.error(f"Failed to send activation email: {e}")

    return new_user

@router.get("/activate", response_class=HTMLResponse)
def activate_form(token: str, db: Session = Depends(get_db)):
    """Show activation form to set password."""
    # Verify token exists
    user = db.query(User).filter(User.activation_token == token).first()
    if not user:
        return HTMLResponse(content="""
            <!DOCTYPE html>
            <html>
            <head><title>Invalid Token</title></head>
            <body style="font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px;">
                <h2 style="color: #f44336;">Invalid Token</h2>
                <p>This activation link is invalid or has expired.</p>
            </body>
            </html>
        """, status_code=400)

    if user.is_active:
        return HTMLResponse(content="""
            <!DOCTYPE html>
            <html>
            <head><title>Already Activated</title></head>
            <body style="font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px;">
                <h2>Already Activated</h2>
                <p>This account is already activated. <a href="/auth/login-page">Go to Login</a></p>
            </body>
            </html>
        """)

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Activate Account</title>
        <style>
            body {{ font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }}
            .form-group {{ margin-bottom: 15px; }}
            label {{ display: block; margin-bottom: 5px; font-weight: bold; }}
            input {{ width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }}
            button {{ width: 100%; padding: 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }}
            button:hover {{ background-color: #45a049; }}
            h2 {{ text-align: center; color: #333; }}
            .welcome {{ text-align: center; color: #666; margin-bottom: 20px; }}
        </style>
    </head>
    <body>
        <h2>Set Your Password</h2>
        <p class="welcome">Welcome, {user.name}! Please set your password to activate your account.</p>
        <form action="/auth/activate" method="post">
            <input type="hidden" name="token" value="{token}">
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required minlength="8">
            </div>
            <div class="form-group">
                <label for="confirm_password">Confirm Password:</label>
                <input type="password" id="confirm_password" name="confirm_password" required minlength="8">
            </div>
            <button type="submit">Activate Account</button>
        </form>
        <script>
            document.querySelector('form').addEventListener('submit', function(e) {{
                var pwd = document.getElementById('password').value;
                var confirm = document.getElementById('confirm_password').value;
                if (pwd !== confirm) {{
                    e.preventDefault();
                    alert('Passwords do not match!');
                }}
            }});
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@router.post("/activate", response_class=HTMLResponse)
def activate_account(
    token: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """Activate account and set password (form submission)."""
    user = db.query(User).filter(User.activation_token == token).first()

    if not user:
        return HTMLResponse(content="""
            <!DOCTYPE html>
            <html>
            <head><title>Activation Failed</title></head>
            <body style="font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px;">
                <h2 style="color: #f44336;">Activation Failed</h2>
                <p>Invalid or expired activation token.</p>
            </body>
            </html>
        """, status_code=400)

    if user.is_active:
        return HTMLResponse(content="""
            <!DOCTYPE html>
            <html>
            <head><title>Already Activated</title></head>
            <body style="font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px;">
                <h2>Already Activated</h2>
                <p>This account is already activated. <a href="/auth/login-page">Go to Login</a></p>
            </body>
            </html>
        """)

    # Set password and activate
    user.password = User.hash_password(password)
    user.is_active = True
    user.activation_token = None
    db.commit()

    logger.info(f"User {user.username} activated successfully")

    return HTMLResponse(content="""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Account Activated</title>
            <meta http-equiv="refresh" content="2;url=/auth/login-page">
        </head>
        <body style="font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px; text-align: center;">
            <h2 style="color: #4CAF50;">Account Activated!</h2>
            <p>Your account has been activated successfully. Redirecting to login...</p>
            <p><a href="/auth/login-page">Click here if not redirected</a></p>
        </body>
        </html>
    """)

@router.post("/activate-api")
def activate_account_api(
    token: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """Activate account and set password (JSON API for frontend)."""
    user = db.query(User).filter(User.activation_token == token).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired activation token")
    if user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account is already activated")
    user.password = User.hash_password(password)
    user.is_active = True
    user.activation_token = None
    db.commit()
    logger.info(f"User {user.username} activated via frontend")
    return {"message": "Account activated successfully"}


@router.get("/login-page", response_class=HTMLResponse)
def login_page():
    """Show login form."""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Login - Virtual Queue</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
            .form-group { margin-bottom: 15px; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
            button { width: 100%; padding: 12px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
            button:hover { background-color: #1976D2; }
            h2 { text-align: center; color: #333; }
            .error { color: #f44336; margin-bottom: 15px; text-align: center; }
            .logo { text-align: center; margin-bottom: 20px; font-size: 24px; }
            .register-link { text-align: center; margin-top: 15px; }
            .register-link a { color: #4CAF50; }
        </style>
    </head>
    <body>
        <div class="logo">🎫 Virtual Queue</div>
        <h2>Login</h2>
        <div id="error" class="error"></div>
        <form id="loginForm">
            <div class="form-group">
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
            </div>
            <div class="form-group">
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit">Login</button>
        </form>
        <div class="register-link">
            Don't have an account? <a href="/auth/register">Register here</a>
        </div>
        <script>
            document.getElementById('loginForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                document.getElementById('error').textContent = '';
                
                const formData = new URLSearchParams();
                formData.append('username', document.getElementById('username').value);
                formData.append('password', document.getElementById('password').value);
                
                try {
                    const response = await fetch('/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        localStorage.setItem('access_token', data.access_token);
                        window.location.href = '/dashboard';
                    } else {
                        const error = await response.json();
                        document.getElementById('error').textContent = error.detail || 'Login failed';
                    }
                } catch (err) {
                    document.getElementById('error').textContent = 'Connection error. Please try again.';
                }
            });
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@router.post("/login", response_model=TokenResponse)
def login(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """Login and get access token."""
    user = db.query(User).filter(User.username == username).first()

    if not user or not user.verify_password(password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not activated. Please check your email."
        )

    access_token = create_access_token(data={"sub": user.username, "role": user.role.value})
    logger.info(f"User {user.username} logged in successfully")
    return TokenResponse(access_token=access_token)

@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return current_user

