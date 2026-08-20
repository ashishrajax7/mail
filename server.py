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

# --- Diagnostic Healthcheck API ---
@app.route('/api/diagnose', methods=['GET'])
def diagnose():
    load_env()
    report = {
        'status': 'OK',
        'env_keys_present': {
            'AJIO_EMAIL': bool(os.getenv('AJIO_EMAIL')),
            'AJIO_PASS_SET': bool(os.getenv('AJIO_PASS')),
            'MYNTRA_EMAIL': bool(os.getenv('MYNTRA_EMAIL')),
            'MYNTRA_PASS_SET': bool(os.getenv('MYNTRA_PASS')),
            'FLIPKART_EMAIL': bool(os.getenv('FLIPKART_EMAIL')),
            'SMTP_PORT': os.getenv('SMTP_PORT', '465'),
            'SMTP_SERVICE': os.getenv('SMTP_SERVICE', 'smtp.gmail.com'),
            'GOOGLE_SHEET_URL_SET': bool(os.getenv('GOOGLE_SHEET_URL')),
            'GOOGLE_SHEET_WEBHOOK_SET': bool(os.getenv('GOOGLE_SHEET_WEBHOOK_URL'))
        }
    }
    # Test SMTP port 465 connection
    try:
        s = smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=10)
        s.quit()
        report['smtp_port_465_reachable'] = True
    except Exception as e:
        report['smtp_port_465_reachable'] = False
        report['smtp_port_465_error'] = str(e)
    
    return jsonify(report), 200

import base64

def send_via_google_webhook(from_name, to, cc, bcc, subject, body, attachments_files):
    url = get_sheet_webhook_url()
    if not url:
        return False, "Google Sheet Webhook URL is not configured."
    try:
        encoded_attachments = []
        for file in attachments_files:
            if not file or file.filename == '':
                continue
            file.seek(0)
            content = file.read()
            encoded_attachments.append({
                'filename': file.filename,
                'contentType': file.content_type or 'application/octet-stream',
                'base64': base64.b64encode(content).decode('utf-8')
            })
        
        payload = {
            'type': 'send_email',
            'from_name': from_name,
            'to': to,
            'cc': cc,
            'bcc': bcc,
            'subject': subject,
            'body': body,
            'attachments': encoded_attachments
        }
        
        import urllib.request
        req_data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=req_data,
            headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': 'Mozilla/5.0'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode('utf-8')
            res_json = json.loads(raw)
            if res_json.get('status') == 'success':
                return True, "Email sent successfully via Google Engine!"
            else:
                return False, res_json.get('message', 'Webhook dispatch failed')
    except Exception as e:
        return False, str(e)

# --- Send Email Endpoint ---
@app.route('/send-email', methods=['POST'])
def send_email():
    try:
        sender_id = request.form.get('sender_id', 'ajio')
        sender_config = get_sender_config(sender_id)
        if not sender_config:
            return jsonify({'error': f'Invalid sender account "{sender_id}" selected.'}), 400

        login_user = sender_config.get('login_user', '').strip()
        login_pass = sender_config.get('login_pass', '').strip()
        from_header = sender_config.get('from_header', '')
        envelope_sender = sender_config.get('envelope_sender', login_user)
        display_name = sender_config.get('display_name', from_header)

        smtp_service = os.getenv('SMTP_SERVICE', 'smtp.gmail.com').strip()
        smtp_port = os.getenv('SMTP_PORT', '465').strip()

        recipient = request.form.get('to')
        cc = request.form.get('cc', '')
        bcc = request.form.get('bcc', '')
        subject = request.form.get('subject', '(No Subject)')
        body = request.form.get('body', '')

        if not recipient:
            return jsonify({'error': 'Recipient email ("To") is required.'}), 400

        attachments = request.files.getlist('attachments')

        # Try SMTP first (works locally / on paid cloud)
        smtp_success = False
        smtp_error_msg = ""
        server = None

        if login_user and login_pass:
            try:
                port = int(smtp_port) if smtp_port.isdigit() else 465
                to_list = [r.strip() for r in recipient.split(',') if r.strip()]
                cc_list = [r.strip() for r in cc.split(',') if r.strip()] if cc else []
                bcc_list = [r.strip() for r in bcc.split(',') if r.strip()] if bcc else []
                all_recipients = to_list + cc_list + bcc_list

                msg = MIMEMultipart()
                msg['From'] = from_header
                msg['To'] = recipient
                if cc:
                    msg['Cc'] = cc
                msg['Subject'] = subject
                msg.attach(MIMEText(body, 'plain', 'utf-8'))

                for file in attachments:
                    if not file or file.filename == '':
                        continue
                    file.seek(0)
                    file_content = file.read()
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(file_content)
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{file.filename}"')
                    msg.attach(part)

                # Connect SMTP with 5-second short timeout on cloud
                if port == 465:
                    server = smtplib.SMTP_SSL(smtp_service, 465, timeout=6)
                else:
                    server = smtplib.SMTP(smtp_service, port, timeout=6)
                    server.ehlo()
                    server.starttls()
                    server.ehlo()

                # Login
                auth_pwds = [login_pass]
                if ' ' in login_pass:
                    auth_pwds.append(login_pass.replace(' ', ''))
                
                for pwd in auth_pwds:
                    try:
                        server.login(login_user, pwd)
                        break
                    except Exception:
                        pass

                try:
                    server.sendmail(envelope_sender, all_recipients, msg.as_string())
                except Exception:
                    server.sendmail(login_user, all_recipients, msg.as_string())
                
                try:
                    server.quit()
                except Exception:
                    pass
                smtp_success = True
                print("Email dispatched via Direct SMTP successfully!")
                return jsonify({'message': f'Email sent successfully from {from_header}!'}), 200
            except Exception as smtp_err:
                smtp_error_msg = str(smtp_err)
                print(f"Direct SMTP unavailable ({smtp_err}). Switching to Google Webhook HTTPS Engine...")
            finally:
                if server:
                    try:
                        server.close()
                    except Exception:
                        pass

        # Fallback to Google Webhook HTTPS Engine (100% bypasses Render SMTP port blocks!)
        from_name = f"Easysell-Surat Billing.{sender_id}"
        if sender_id == 'flipkart':
            from_name = "Billing.Flipkart"

        hook_ok, hook_msg = send_via_google_webhook(from_name, recipient, cc, bcc, subject, body, attachments)
        if hook_ok:
            return jsonify({'message': f'Email sent successfully from {from_header} (via Google Engine)!'}), 200
        else:
            return jsonify({
                'error': f'Failed to dispatch email. SMTP Error: {smtp_error_msg} | Webhook Error: {hook_msg}'
            }), 500

@app.errorhandler(500)
def internal_server_error(e):
    import traceback
    return jsonify({
        'error': 'Internal Server Error (500)',
        'details': str(e)
    }), 500

@app.errorhandler(Exception)
def handle_all_exceptions(e):
    import traceback
    return jsonify({
        'error': f'Unhandled Server Error: {str(e)}',
        'details': traceback.format_exc()
    }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("---------------------------------------------")
    print(f"Email Sender App is starting on port {port}...")
    print(f"Please open http://127.0.0.1:{port} in your browser.")
    print("---------------------------------------------")
    app.run(host='0.0.0.0', port=port, debug=False)
