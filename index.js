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

// Store sent message keys for potential deletion
const sentMessages = new Map() // chatId -> [messageKeys]

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
            },
            'POST /delete-message': {
                description: 'Delete a specific message by its ID',
                body: {
                    chatId: 'Chat ID (e.g., 1234567890@s.whatsapp.net)',
                    messageId: 'Message ID to delete'
                }
            },
            'GET /sent-messages/:chatId': {
                description: 'List all sent messages for a chat',
                params: {
                    chatId: 'Chat ID (e.g., 1234567890@s.whatsapp.net)'
                }
            },
            'POST /delete-all-sent': {
                description: 'Delete ALL messages sent by bot to a specific chat during current session',
                body: {
                    chatId: 'Chat ID (e.g., 1234567890@s.whatsapp.net)'
                },
                warning: 'This will delete all tracked messages for the specified chat'
            },
            'POST /delete-all-sent-everywhere': {
                description: 'Delete ALL messages sent by bot to ALL chats during current session (NUCLEAR OPTION)',
                body: {},
                warning: '⚠️ DANGER: This will delete all tracked messages from ALL chats!'
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
        const message = await sock.sendMessage(to, { text })
        
        // Track the sent message by storing its key
        if (!sentMessages.has(to)) {
            sentMessages.set(to, [])
        }
        const messages = sentMessages.get(to)
        messages.push({ 
            id: message.key.id, 
            text,
            timestamp: Date.now(),
            chatId: to
        })
        sentMessages.set(to, messages)

        res.json({ 
            sent: true,
            messageId: message.key.id,
            chatId: to,
            timestamp: Date.now()
        })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.post('/delete-all', async (req, res) => {
    const { chatId, limit = 50 } = req.body

    if (!sock || !sock.user) {
        return res.status(500).json({ 
            error: 'WhatsApp not connected',
            message: 'Please ensure WhatsApp is connected before trying to delete messages'
        })
    }

    try {
        // Since we can't reliably fetch message history in Baileys v6.x,
        // we'll provide a simple message deletion endpoint that requires message keys
        // This is a limitation of WhatsApp's API - you can only delete specific messages by their keys
        
        res.status(501).json({
            error: 'Bulk message deletion not supported',
            reason: 'WhatsApp API limitations in Baileys v6.x',
            message: 'Cannot fetch message history to delete messages in bulk',
            alternative: {
                description: 'Use specific message deletion instead',
                endpoint: 'POST /delete-message',
                usage: 'Delete individual messages by providing their message keys',
                note: 'You can only delete messages sent by this bot'
            },
            suggestion: 'Consider implementing message tracking to store message keys for later deletion'
        })
    } catch (e) {
        console.error('Delete-all error:', e.message)
        res.status(500).json({ 
            error: 'Cannot access chat messages',
            details: e.message,
            note: 'WhatsApp bots can only delete their own messages with known message keys'
        })
    }
})

// POST endpoint to delete a specific message
app.post('/delete-message', async (req, res) => {
    const { chatId, messageId } = req.body

    if (!sock || !sock.user) {
        return res.status(500).json({ 
            error: 'WhatsApp not connected',
            message: 'Please ensure WhatsApp is connected before trying to delete messages'
        })
    }

    if (!chatId || !messageId) {
        return res.status(400).json({
            error: 'Missing required parameters',
            required: ['chatId', 'messageId'],
            example: {
                chatId: '1234567890@s.whatsapp.net',
                messageId: 'message_id_from_send_response'
            }
        })
    }

    try {
        // Create message key for deletion
        const messageKey = {
            remoteJid: chatId,
            fromMe: true,
            id: messageId
        }

        await sock.sendMessage(chatId, {
            delete: messageKey
        })

        // Remove from our tracking
        if (sentMessages.has(chatId)) {
            const messages = sentMessages.get(chatId)
            const filtered = messages.filter(msg => msg.id !== messageId)
            sentMessages.set(chatId, filtered)
        }

        res.json({ 
            deleted: true,
            messageId,
            chatId
        })
    } catch (e) {
        console.error('Delete message error:', e.message)
        res.status(500).json({ 
            error: 'Failed to delete message',
            details: e.message,
            messageId,
            chatId
        })
    }
})

// GET endpoint to list sent messages for a chat
app.get('/sent-messages/:chatId', (req, res) => {
    const { chatId } = req.params
    const messages = sentMessages.get(chatId) || []
    
    res.json({
        chatId,
        sentMessages: messages,
        count: messages.length
    })
})

// POST endpoint to delete all messages sent by bot in current session
app.post('/delete-all-sent', async (req, res) => {
    const { chatId } = req.body

    if (!sock || !sock.user) {
        return res.status(500).json({ 
            error: 'WhatsApp not connected',
            message: 'Please ensure WhatsApp is connected before trying to delete messages'
        })
    }

    if (!chatId) {
        return res.status(400).json({
            error: 'Missing required parameter: chatId',
            example: {
                chatId: '1234567890@s.whatsapp.net'
            }
        })
    }

    const messagesToDelete = sentMessages.get(chatId) || []
    
    if (messagesToDelete.length === 0) {
        return res.json({
            deleted: false,
            message: 'No messages found to delete for this chat',
            chatId,
            count: 0
        })
    }

    let deletedCount = 0
    const errors = []
    const deleteResults = []

    console.log(`🗑️ Attempting to delete ${messagesToDelete.length} messages from ${chatId}`)

    for (const msg of messagesToDelete) {
        try {
            // Create message key for deletion
            const messageKey = {
                remoteJid: chatId,
                fromMe: true,
                id: msg.id
            }

            await sock.sendMessage(chatId, {
                delete: messageKey
            })

            deletedCount++
            deleteResults.push({
                messageId: msg.id,
                text: msg.text,
                status: 'deleted'
            })

            console.log(`✅ Deleted message: ${msg.id}`)
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300))
            
        } catch (err) {
            const errorMsg = `Failed to delete message ${msg.id}: ${err.message}`
            errors.push(errorMsg)
            deleteResults.push({
                messageId: msg.id,
                text: msg.text,
                status: 'failed',
                error: err.message
            })
            console.warn(`❌ ${errorMsg}`)
        }
    }

    // Clear the tracking for this chat after deletion attempt
    if (deletedCount > 0) {
        sentMessages.delete(chatId)
        console.log(`🧹 Cleared message tracking for ${chatId}`)
    }

    res.json({
        deleted: deletedCount > 0,
        chatId,
        totalMessages: messagesToDelete.length,
        deletedCount,
        failedCount: errors.length,
        results: deleteResults,
        errors: errors.length > 0 ? errors : undefined,
        note: 'Only messages sent by this bot during current session can be deleted'
    })
})

// POST endpoint to delete all messages from ALL chats (nuclear option)
app.post('/delete-all-sent-everywhere', async (req, res) => {
    if (!sock || !sock.user) {
        return res.status(500).json({ 
            error: 'WhatsApp not connected',
            message: 'Please ensure WhatsApp is connected before trying to delete messages'
        })
    }

    const allChats = Array.from(sentMessages.keys())
    
    if (allChats.length === 0) {
        return res.json({
            deleted: false,
            message: 'No tracked messages found in any chat',
            totalChats: 0,
            count: 0
        })
    }

    let totalDeleted = 0
    let totalFailed = 0
    const chatResults = []

    console.log(`🚨 NUCLEAR DELETION: Processing ${allChats.length} chats`)

    for (const chatId of allChats) {
        const messagesToDelete = sentMessages.get(chatId) || []
        let chatDeleted = 0
        let chatFailed = 0
        const chatErrors = []

        console.log(`🗑️ Processing chat: ${chatId} (${messagesToDelete.length} messages)`)

        for (const msg of messagesToDelete) {
            try {
                const messageKey = {
                    remoteJid: chatId,
                    fromMe: true,
                    id: msg.id
                }

                await sock.sendMessage(chatId, {
                    delete: messageKey
                })

                chatDeleted++
                totalDeleted++
                
                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 300))
                
            } catch (err) {
                chatFailed++
                totalFailed++
                chatErrors.push(`${msg.id}: ${err.message}`)
                console.warn(`❌ Failed to delete ${msg.id}: ${err.message}`)
            }
        }

        chatResults.push({
            chatId,
            totalMessages: messagesToDelete.length,
            deleted: chatDeleted,
            failed: chatFailed,
            errors: chatErrors.length > 0 ? chatErrors : undefined
        })

        // Clear tracking for this chat
        sentMessages.delete(chatId)
    }

    console.log(`🧹 Nuclear deletion complete: ${totalDeleted} deleted, ${totalFailed} failed`)

    res.json({
        deleted: totalDeleted > 0,
        operation: 'nuclear-delete-all',
        totalChats: allChats.length,
        totalDeleted,
        totalFailed,
        chatResults,
        note: 'All tracked messages from current session have been processed'
    })
})


// Start express and Baileys
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`🟢 WhatsApp API running on http://localhost:${PORT}`))

startSock()
