# WhatsApp Bot API

A simple WhatsApp Bot API built with Baileys library.

## Setup

1. Clone this repository
2. Install dependencies:
```
npm install
```
3. Set up your environment variables by copying the example file:
```
cp .env.example .env
```
4. Edit the `.env` file with your webhook URLs and other configurations:
```
NODE_ENV=test
WEBHOOK_URL_TEST=http://localhost:5678/webhook-test/your-webhook-id
WEBHOOK_URL_PROD=http://localhost:5678/webhook/your-webhook-id
PORT=3000
```
5. Start the application:
```
node index.js
```

## Usage

### Endpoints

- `GET /` - API information
- `POST /send` - Send a WhatsApp message
  ```json
  {
    "to": "1234567890@s.whatsapp.net",
    "text": "Hello from the bot!"
  }
  ```
- `POST /delete-all` - Delete all recent messages from a chat
  ```json
  {
    "chatId": "1234567890@s.whatsapp.net",
    "limit": 50
  }
  ```

## Environment

The application can run in two environments:
- `test` - Uses the test webhook URL
- `prod` - Uses the production webhook URL

Set the `NODE_ENV` variable in your .env file to switch between environments.
