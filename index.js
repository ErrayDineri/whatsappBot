const express = require('express')
const axios = require('axios')
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const qrcode = require('qrcode-terminal')
const dotenv = require('dotenv')

// Load environment variables from .env file
dotenv.config()

// Init Express server
const app = express()
app.use(express.json())

// Environment configuration
const ENVIRONMENT = process.env.NODE_ENV || 'test'
const WEBHOOK_URLS = {
    test: process.env.WEBHOOK_URL_TEST,
    prod: process.env.WEBHOOK_URL_PROD
}

const currentWebhookUrl = WEBHOOK_URLS[ENVIRONMENT]
console.log(`🌐 Environment: ${ENVIRONMENT.toUpperCase()}`)
console.log(`📡 Webhook URL: ${currentWebhookUrl}`)

let sock

async function startSock() {
    // Auth State for Baileys v6.x
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys')
      sock = makeWASocket({
        auth: state
    })

    // Save auth when it updates
    sock.ev.on('creds.update', saveCreds)

    // On incoming message
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        const from = msg.key.remoteJid
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text

        if (!text || !from) return        console.log(`[RECEIVED] ${from}: ${text}`)

        // Send to n8n (environment-specific webhook)
        await axios.post(currentWebhookUrl, {
            from,
            text
        }).catch(err => console.error('Failed to call n8n webhook:', err.message))
    })    // Handle connection updates and QR code
    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('\n🔲 QR Code received! Please scan with WhatsApp:')
            qrcode.generate(qr, { small: true })
            console.log('\nOr visit this link to generate a visual QR code:')
            console.log(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`)
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401
            console.log('🔴 Connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect)
            if (shouldReconnect) {
                startSock()
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp connected successfully!')
        }
    })
}

// GET endpoint for root path - API information
app.get('/', (req, res) => {
    res.json({
        name: 'WhatsApp Bot API',
        version: '1.0.0',
        status: 'running',
        environment: ENVIRONMENT,
        webhookUrl: currentWebhookUrl,
        endpoints: {
            'POST /send': {
                description: 'Send a WhatsApp message',
                body: {
                    to: 'Phone number with country code (e.g., 1234567890@s.whatsapp.net)',
                    text: 'Message to send'
                }
            },
            'POST /delete-all': {
                description: 'Delete all recent messages from a chat',
                body: {
                    chatId: 'Chat ID (e.g., 1234567890@s.whatsapp.net)',
                    limit: 'Number of messages to delete (optional, default: 50)'
                }
            }
        },
        example: {
            url: 'POST http://localhost:3000/send',
            body: {
                to: '1234567890@s.whatsapp.net',
                text: 'Hello from the bot!'
            }
        }
    })
})

// POST endpoint to send messages from n8n
app.post('/send', async (req, res) => {
    const { to, text } = req.body
    try {
        await sock.sendMessage(to, { text })
        res.json({ sent: true })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.post('/delete-all', async (req, res) => {
    const { chatId, limit = 50 } = req.body

    try {
        // Fetch recent messages from the chat
        const chatHistory = await sock.fetchMessagesFromWA(chatId, limit)
        
        if (!chatHistory || chatHistory.length === 0) {
            return res.json({ deleted: false, message: 'No messages found to delete', count: 0 })
        }

        let deletedCount = 0
        const errors = []

        for (const msg of chatHistory) {
            if (!msg.key || !msg.key.id) continue
            
            try {
                // Delete each message individually
                await sock.sendMessage(chatId, {
                    delete: msg.key
                })
                deletedCount++
                
                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200))
            } catch (err) {
                errors.push(`Failed to delete message ${msg.key.id}: ${err.message}`)
                console.warn(`Failed to delete message ${msg.key.id}:`, err.message)
            }
        }

        res.json({ 
            deleted: true, 
            count: deletedCount,
            total: chatHistory.length,
            errors: errors.length > 0 ? errors : undefined
        })
    } catch (e) {
        // If fetchMessagesFromWA doesn't work, try alternative approach
        console.error('Delete-all error:', e.message)
        res.status(500).json({ 
            error: 'Cannot fetch or delete messages',
            details: e.message,
            suggestion: 'Try deleting messages manually or use a smaller limit'
        })
    }
})


// Start express and Baileys
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🟢 WhatsApp API running on http://localhost:${PORT}`))

startSock()
