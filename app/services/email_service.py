import os
import resend
from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv("RESENDER_API_KEY")

def send_activation_email(to_email: str, activation_token: str, name: str):
    """Send activation email with link to set password."""
    base_url = os.getenv("APP_BASE_URL", "http://localhost:8000")
    activation_link = f"{base_url}/auth/activate?token={activation_token}"

    html_content = f"""
    <h2>Welcome to Virtual Queue, {name}!</h2>
    <p>Your account has been created. Please click the link below to set your password and activate your account:</p>
    <p><a href="{activation_link}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Activate Account</a></p>
    <p>Or copy this link: {activation_link}</p>
    <p>This link will expire in 24 hours.</p>
    """

    r = resend.Emails.send({
        "from": "onboarding@resend.dev",
        "to": to_email,
        "subject": "Activate Your Virtual Queue Account",
        "html": html_content
    })

    return r

