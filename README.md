# WhatsApp Bot API 🤖

A robust WhatsApp Bot API built with the Baileys library that enables sending/receiving messages and integrates with webhooks for automation workflows like n8n.

## ✨ Features

- 📱 **WhatsApp Integration**: Connect to WhatsApp using QR code authentication
- 🔄 **Webhook Support**: Forward incoming messages to external webhooks (n8n, Zapier, etc.)
- 📤 **Send Messages**: Programmatically send messages to WhatsApp numbers
- 🗑️ **Bulk Delete**: Delete multiple messages from chats
- 🌍 **Environment Support**: Separate test and production configurations
- 🔐 **Secure Configuration**: Environment variables for sensitive data

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- A WhatsApp account
- Webhook endpoint (optional, for message forwarding)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ErrayDineri/whatsappBot
   cd whatsappBot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   ```

4. **Configure your environment variables**
   
   Edit the `.env` file with your settings:
   ```env
   # Environment (test or prod)
   NODE_ENV=test
   
   # Webhook URLs for message forwarding
   WEBHOOK_URL_TEST=http://localhost:5678/webhook-test/your-webhook-id
   WEBHOOK_URL_PROD=https://your-production-domain.com/webhook/your-webhook-id
   
   # Server configuration
   PORT=3000
   ```

5. **Start the application**
   ```bash
   node index.js
   ```

6. **Authenticate with WhatsApp**
   - Scan the QR code that appears in your terminal with WhatsApp
   - Or visit the generated QR code URL for a visual QR code

## 📡 API Endpoints

### `GET /`
Get API information and available endpoints
```bash
curl http://localhost:3000/
```

### `POST /send`
Send a WhatsApp message
```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "1234567890@s.whatsapp.net",
    "text": "Hello from the bot!"
  }'
```

**Request Body:**
```json
{
  "to": "1234567890@s.whatsapp.net",
  "text": "Your message here"
}
```

**Response:**
```json
{
  "sent": true
}
```

### `POST /delete-all`
Delete recent messages from a chat
```bash
curl -X POST http://localhost:3000/delete-all \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "1234567890@s.whatsapp.net",
    "limit": 50
  }'
```

**Request Body:**
```json
{
  "chatId": "1234567890@s.whatsapp.net",
  "limit": 50
}
```

**Response:**
```json
{
  "deleted": true,
  "count": 45,
  "total": 50
}
```

## 🌍 Environment Configuration

The application supports two environments:

| Environment | Description | Webhook Variable |
|-------------|-------------|------------------|
| `test` | Development/testing | `WEBHOOK_URL_TEST` |
| `prod` | Production | `WEBHOOK_URL_PROD` |

### Switching Environments

Change the `NODE_ENV` value in your `.env` file:
- `NODE_ENV=test` - Uses test webhook URL
- `NODE_ENV=prod` - Uses production webhook URL

⚠️ **Important**: If you have system-level environment variables set, they will override your `.env` file values. Clear them with:
```bash
# Windows
set NODE_ENV=

# Linux/Mac
unset NODE_ENV
```

## 🔧 Troubleshooting

### QR Code Issues
- Make sure WhatsApp is installed on your phone
- Ensure you're scanning with the correct WhatsApp account
- Try refreshing the QR code if it expires

### Connection Problems
- Check your internet connection
- Verify firewall settings aren't blocking the application
- Review the console logs for specific error messages

### Environment Variable Issues
- Ensure `.env` file is in the root directory
- Check for typos in variable names
- Restart the application after changing `.env` values
- Clear system-level environment variables if needed

## 📁 Project Structure

```
whatsappBot/
├── index.js              # Main application file
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables (create from .env.example)
├── .env.example          # Environment template
├── .gitignore           # Git ignore rules
├── README.md            # This file
└── auth_info_baileys/   # WhatsApp authentication data (auto-generated)
```

## 🔒 Security Notes

- Never commit your `.env` file to version control
- Keep your webhook URLs private
- The `auth_info_baileys/` folder contains sensitive WhatsApp session data
- Use HTTPS URLs for production webhook endpoints

## 🤝 Integration Examples

### n8n Integration
This bot works perfectly with n8n workflows. Set your n8n webhook URL in the environment variables, and incoming WhatsApp messages will automatically trigger your workflows.

### Custom Webhook Handler
Your webhook endpoint will receive POST requests with this structure:
```json
{
  "from": "1234567890@s.whatsapp.net",
  "text": "Received message content"
}
```

## 📄 License

This project is licensed under the ISC License.
