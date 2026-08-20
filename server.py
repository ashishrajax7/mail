import os
import json
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from flask import Flask, request, jsonify

app = Flask(__name__, static_folder='static', static_url_path='/static')

TEMPLATES_FILE = os.path.join(os.path.dirname(__file__), 'templates.json')
EMAILS_FILE = os.path.join(os.path.dirname(__file__), 'emails.json')
CONTACTS_FILE = os.path.join(os.path.dirname(__file__), 'contacts.json')

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    val = val.strip().strip('"').strip("'")
                    os.environ[key.strip()] = val

load_env()

from email.utils import formataddr

def get_sender_config(sender_id):
    load_env()
    
    ajio_email = os.getenv('AJIO_EMAIL', os.getenv('SMTP_USER', 'billing.ajio@brandcentral.in'))
    ajio_pass = os.getenv('AJIO_PASS', os.getenv('SMTP_PASS', ''))
    
    myntra_email = os.getenv('MYNTRA_EMAIL', 'billing.myntra@brandcentral.in')
    myntra_pass = os.getenv('MYNTRA_PASS', '')
    
    flipkart_email = os.getenv('FLIPKART_EMAIL', 'billing.flipkart@brandcentral.in')
    
    accounts = {
        'ajio': {
            'login_user': ajio_email,
            'login_pass': ajio_pass,
            'from_header': formataddr(('Easysell-Surat Billing.ajio (Brand Central)', ajio_email)),
            'envelope_sender': ajio_email,
            'display_name': f'Ajio ({ajio_email})'
        },
        'myntra': {
            'login_user': myntra_email,
            'login_pass': myntra_pass,
            'from_header': formataddr(('Easysell-Surat Billing.myntra (Brand Central)', myntra_email)),
            'envelope_sender': myntra_email,
            'display_name': f'Myntra ({myntra_email})'
        },
        'flipkart': {
            'login_user': myntra_email,
            'login_pass': myntra_pass,
            'from_header': formataddr(('Billing.Flipkart', flipkart_email)),
            'envelope_sender': flipkart_email,
            'display_name': f'Flipkart ({flipkart_email})'
        }
    }
    return accounts.get(sender_id)

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/manage')
def manage_page():
    return app.send_static_file('manage.html')

# --- Google Sheet Sync Helpers ---
def get_sheet_webhook_url():
    load_env()
    return os.getenv('GOOGLE_SHEET_WEBHOOK_URL', '').strip()

def sync_from_google_sheet():
    url = get_sheet_webhook_url()
    if not url:
        return None
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=6) as response:
            if response.getcode() == 200:
                raw = response.read().decode('utf-8')
                data = json.loads(raw)
                if 'emails' in data and data['emails']:
                    with open(EMAILS_FILE, 'w', encoding='utf-8') as f:
                        json.dump(data['emails'], f, indent=2, ensure_ascii=False)
                if 'templates' in data and data['templates']:
                    with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
                        json.dump(data['templates'], f, indent=2, ensure_ascii=False)
                return data
    except Exception as e:
        print(f"Warning: Failed to sync from Google Sheet: {e}")
    return None

def sync_to_google_sheet(payload):
    url = get_sheet_webhook_url()
    if not url:
        return
    import threading
    def _post():
        try:
            import urllib.request
            req_data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                print(f"Google Sheet sync POST status: {resp.getcode()}")
        except Exception as e:
            print(f"Warning: Failed to push to Google Sheet: {e}")
    
    threading.Thread(target=_post, daemon=True).start()

# --- Emails Directory APIs ---
@app.route('/api/emails', methods=['GET'])
def get_emails():
    # If Google Sheet webhook is active, try sync first
    sync_from_google_sheet()
    if os.path.exists(EMAILS_FILE):
        try:
            with open(EMAILS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return jsonify(data), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify([]), 200

@app.route('/api/emails', methods=['POST'])
def save_emails():
    try:
        data = request.get_json(force=True)
        with open(EMAILS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        # Push update to Google Sheet in background
        sync_to_google_sheet({'type': 'save_emails', 'emails': data})
        return jsonify({'message': 'Emails directory saved successfully!'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Templates APIs ---
@app.route('/api/templates', methods=['GET'])
def get_templates():
    if os.path.exists(TEMPLATES_FILE):
        try:
            with open(TEMPLATES_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return jsonify(data), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify([]), 200

@app.route('/api/templates', methods=['POST'])
def save_templates():
    try:
        data = request.get_json(force=True)
        with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        # Push update to Google Sheet in background
        sync_to_google_sheet({'type': 'save_templates', 'templates': data})
        return jsonify({'message': 'Templates saved successfully!'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Backup & Restore APIs ---
@app.route('/api/backup', methods=['GET'])
def get_backup():
    try:
        emails = []
        templates = []
        if os.path.exists(EMAILS_FILE):
            with open(EMAILS_FILE, 'r', encoding='utf-8') as f:
                emails = json.load(f)
        if os.path.exists(TEMPLATES_FILE):
            with open(TEMPLATES_FILE, 'r', encoding='utf-8') as f:
                templates = json.load(f)
        return jsonify({
            'version': '1.0',
            'emails': emails,
            'templates': templates
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/restore', methods=['POST'])
def restore_backup():
    try:
        data = request.get_json(force=True)
        if 'emails' in data:
            with open(EMAILS_FILE, 'w', encoding='utf-8') as f:
                json.dump(data['emails'], f, indent=2, ensure_ascii=False)
        if 'templates' in data:
            with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
                json.dump(data['templates'], f, indent=2, ensure_ascii=False)
        return jsonify({'message': 'Backup restored successfully!'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- Send Email Endpoint ---
@app.route('/send-email', methods=['POST'])
def send_email():
    try:
        sender_id = request.form.get('sender_id', 'ajio')
        sender_config = get_sender_config(sender_id)
        
        if not sender_config:
            return jsonify({'error': f'Invalid sender account "{sender_id}" selected.'}), 400

        login_user = sender_config['login_user']
        login_pass = sender_config['login_pass']
        from_header = sender_config['from_header']
        envelope_sender = sender_config['envelope_sender']

        if not login_user or not login_pass:
            return jsonify({
                'error': f'Credentials for account "{sender_id}" are not configured in the .env file.'
            }), 400

        smtp_service = os.getenv('SMTP_SERVICE', 'smtp.gmail.com')
        smtp_port = os.getenv('SMTP_PORT', '587')

        recipient = request.form.get('to')
        cc = request.form.get('cc', '')
        bcc = request.form.get('bcc', '')
        subject = request.form.get('subject', '(No Subject)')
        body = request.form.get('body', '')

        if not recipient:
            return jsonify({'error': 'Recipient email ("To") is required.'}), 400

        msg = MIMEMultipart()
        msg['From'] = from_header
        msg['To'] = recipient
        if cc:
            msg['Cc'] = cc
        msg['Subject'] = subject

        # Attach text body
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        # Attachments
        attachments = request.files.getlist('attachments')
        for file in attachments:
            if not file or file.filename == '':
                continue
            
            try:
                file_content = file.read()
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(file_content)
                encoders.encode_base64(part)
                
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename="{file.filename}"'
                )
                msg.attach(part)
            except Exception as upload_err:
                return jsonify({
                    'error': f'Failed to process attachment "{file.filename}": {str(upload_err)}'
                }), 500

        try:
            port = int(smtp_port)
        except ValueError:
            port = 587

        to_list = [r.strip() for r in recipient.split(',') if r.strip()]
        cc_list = [r.strip() for r in cc.split(',') if r.strip()] if cc else []
        bcc_list = [r.strip() for r in bcc.split(',') if r.strip()] if bcc else []
        all_recipients = to_list + cc_list + bcc_list

        server = None
        # Try primary port first, then fallback to SSL (465) if 587 fails
        try:
            print(f"Connecting to SMTP server {smtp_service}:{port}...")
            if port == 465:
                server = smtplib.SMTP_SSL(smtp_service, port, timeout=25)
            else:
                server = smtplib.SMTP(smtp_service, port, timeout=25)
                server.ehlo()
                print("Starting STARTTLS...")
                server.starttls()
                server.ehlo()
            
            print(f"Logging in as {login_user}...")
            server.login(login_user, login_pass)
        except Exception as conn_err:
            print(f"Primary connection on port {port} failed: {conn_err}. Trying SSL on port 465...")
            try:
                server = smtplib.SMTP_SSL(smtp_service, 465, timeout=25)
                server.login(login_user, login_pass)
            except Exception as fallback_err:
                print(f"Fallback connection failed: {fallback_err}")
                return jsonify({
                    'error': f'Failed to connect/authenticate to SMTP ({smtp_service}): {str(fallback_err)}. Please verify app password in Environment Variables.'
                }), 500

        try:
            print(f"Sending email from {from_header} (Envelope: {envelope_sender}) to {all_recipients}...")
            try:
                server.sendmail(envelope_sender, all_recipients, msg.as_string())
            except smtplib.SMTPResponseException:
                server.sendmail(login_user, all_recipients, msg.as_string())
            
            print("Closing SMTP connection...")
            server.quit()
            print("Email sent successfully!")
            return jsonify({'message': f'Email sent successfully from {from_header}!'}), 200
        except smtplib.SMTPAuthenticationError:
            return jsonify({
                'error': f'Authentication failed for {login_user}. Please check the app password in Render Environment Variables.'
            }), 401
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({
                'error': f'Failed to send email: {str(e)}'
            }), 500
        finally:
            if server:
                try:
                    server.close()
                except Exception:
                    pass
    except Exception as general_err:
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': f'Server error: {str(general_err)}'
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("---------------------------------------------")
    print(f"Email Sender App is starting on port {port}...")
    print(f"Please open http://127.0.0.1:{port} in your browser.")
    print("---------------------------------------------")
    app.run(host='0.0.0.0', port=port, debug=False)
