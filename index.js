const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// 1. Initialize Supabase Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 3. Express Setup for Webhooks
const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = `/bot-${process.env.TELEGRAM_BOT_TOKEN}`;

if (process.env.RENDER_EXTERNAL_URL) {
    bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}${WEBHOOK_PATH}`);
    app.use(bot.webhookCallback(WEBHOOK_PATH));
}

// Memory session state tracker
const userSessions = new Map();

// Helper function to validate and parse DD-MM-YYYY format safely
function parseDateString(dateStr) {
    const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) return null;
    
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // JS Months are 0-11
    const year = parseInt(match[3], 10);
    
    const date = new Date(year, month, day);
    // Double check it's a real date (prevents things like 31-02-2026)
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
        return date;
    }
    return null;
}

// --- TELEGRAM BOT LOGIC ---

// Command: /start
bot.command('start', (ctx) => {
    ctx.reply('សូមស្វាគមន៍មកកាន់ហាងកសិកម្ម ស្រែមាន! សូមចែករំលែកលេខទូរស័ព្ទរបស់អ្នកដើម្បីពិនិត្យរបាយការណ៍។', 
        Markup.keyboard([
            Markup.button.contactRequest('📲 ចែករំលែកលេខទូរស័ព្ទ (Share Contact)')
        ]).oneTime().resize()
    );
});

// Main selection menu view component
async function sendMainMenu(ctx, customerName, customerId) {
    const text = `👋 ជម្រាបសួរ ${customerName}!\nសូមជ្រើសរើសចន្លោះកាលបរិច្ឆេទដែលអ្នកចង់ពិនិត្យរបាយការណ៍៖`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📅 ប្រវត្តិ ៣ ខែចុងក្រោយ', 'range_3_months')],
        [Markup.button.callback('📅 ប្រវត្តិ ៦ ខែចុងក្រោយ', 'range_6_months')],
        [Markup.button.callback('🗓️ របាយការណ៍ប្រចាំឆ្នាំ (1 Year)', 'range_1_year')],
        [Markup.button.callback('✏️ ជ្រើសរើសថ្ងៃខែដោយខ្លួនឯង (Custom Range)', 'range_custom')]
    ]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(text, keyboard);
    } else {
        await ctx.reply(text, keyboard);
    }
}

// Handler: When user clicks "Share Contact"
bot.on('contact', async (ctx) => {
    try {
        let phone = ctx.message.contact.phone_number;
        phone = phone.replace(/[^0-9+]/g, ''); 
        if (!phone.startsWith('+')) phone = '+' + phone;

        // Extracts the ID string by dropping the country code variable prefix
        const customerId = phone.replace(/^\+?855/, ''); 

        // 🎯 DEBUG LOG LINK: Sends the calculated ID straight to the chat window for checking
        await ctx.reply(`🔍 ប្រព័ន្ធកំពុងស្វែងរកលេខសម្គាល់ ID: "${customerId}"...`);

        const { data: customer, error: custError } = await supabase
            .from('customers')
            .select('id, name')
            .eq('id', customerId)
            .single();

        if (custError || !customer) {
            return ctx.reply(`❌ រកមិនឃើញប្រវត្តិរបស់អ្នកក្នុងប្រព័ន្ធឡើយ។ (ប្រព័ន្ធស្វែងរកលេខសម្គាល់ ID: ${customerId} មិនឃើញក្នុងតារាង)`);
        }

        // Initialize state tracker fields
        userSessions.set(ctx.from.id, { 
            customerId: customer.id, 
            customerName: customer.name,
            step: 'idle' 
        });

        await sendMainMenu(ctx, customer.name, customer.id);

    } catch (err) {
        console.error(err);
        ctx.reply('❌ 有កំហុសបច្ចេកទេសក្នុងការតភ្ជាប់។');
    }
});

// --- DYNAMIC CORE ENGINE ---
async function generateReport(ctx, startDate, endDate) {
    const session = userSessions.get(ctx.from.id);
    if (!session) {
        return ctx.reply('⚠️ សេសសិនរបស់អ្នកបានផុតកំណត់។ សូមចែករំលែកលេខទូរស័ព្ទម្តងទៀត (/start)។');
    }

    try {
        // Fetch invoice items matching timeframe
        const { data: items, error: itemError } = await supabase
            .from('invoice_items')
            .select(`
                quantity, unit_price, category,
                invoices!inner(customer_id, invoice_date)
            `)
            .eq('invoices.customer_id', session.customerId)
            .gte('invoices.invoice_date', startDate.toISOString())
            .lte('invoices.invoice_date', endDate.toISOString());

        if (itemError || !items || items.length === 0) {
            const emptyMsg = `👋 ជម្រាបសួរ ${session.customerName}!\nមិនមានប្រវត្តិទិញទំនិញក្នុងចន្លោះកាលបរិច្ឆេទនេះឡើយ៖\n📍 ពី ${startDate.toLocaleDateString('km-KH')} ដល់ ${endDate.toLocaleDateString('km-KH')}`;
            const emptyKb = Markup.inlineKeyboard([[Markup.button.callback('⬅️ ត្រឡប់ក្រោយ (Go Back)', 'go_back_menu')]]);
            
            if (ctx.callbackQuery) {
                return ctx.editMessageText(emptyMsg, emptyKb);
            } else {
                return ctx.reply(emptyMsg, emptyKb);
            }
        }

        let totals = { 'Granular Fertilizer': 0, 'Liquid Fertilizer': 0, 'Powder Fertilizer': 0, 'Pesticide': 0, 'Fungicide': 0, 'Herbicide': 0 };

        items.forEach(item => {
            const itemTotalRiel = Number(item.quantity) * Number(item.unit_price);
            if (totals[item.category] !== undefined) totals[item.category] += itemTotalRiel;
        });

        const totalFertilizerRiel = totals['Granular Fertilizer'] + totals['Liquid Fertilizer'] + totals['Powder Fertilizer'];
        const totalMedicineRiel = totals['Pesticide'] + totals['Fungicide'] + totals['Herbicide'];
        const grandTotalRiel = totalFertilizerRiel + totalMedicineRiel;

        const EXCHANGE_RATE = 4000;
        const toUSD = (riel) => riel / EXCHANGE_RATE;
        const grandTotalUSD = toUSD(grandTotalRiel);
        const getPct = (usdValue) => grandTotalUSD > 0 ? ((usdValue / grandTotalUSD) * 100).toFixed(0) : 0;

        let report = `\n`.repeat(25); // Pushes content up to clear display interface
        report += `🌾 *សូមជូនរបាយការណ៍ទិន្នន័យទិញទំនិញ*\n`;
        report += `ឈ្មោះ: *${session.customerName}* (ID: ${session.customerId})\n`;
        report += `ចន្លោះកាលបរិច្ឆេទ: ${startDate.toLocaleDateString('km-KH')} ដល់ ${endDate.toLocaleDateString('km-KH')}\n`;
        report += `----------------------------------\n`;
        report += `ជីគ្រាប់ (Granular): $${toUSD(totals['Granular Fertilizer']).toLocaleString()} (${getPct(toUSD(totals['Granular Fertilizer']))}%)\n`;
        report += `ជីទឹក (Liquid): $${toUSD(totals['Liquid Fertilizer']).toLocaleString()} (${getPct(toUSD(totals['Liquid Fertilizer']))}%)\n`;
        report += `ជីម្សៅ (Powder): $${toUSD(totals['Powder Fertilizer']).toLocaleString()} (${getPct(toUSD(totals['Powder Fertilizer']))}%)\n\n`;
        report += `*សរុបជី (Subtotal): $${toUSD(totalFertilizerRiel).toLocaleString()} (${getPct(toUSD(totalFertilizerRiel))}%)*\n`;
        report += `----------------------------------\n`;
        report += `ថ្នាំស្មៅ (Herbicide): $${toUSD(totals['Herbicide']).toLocaleString()} (${getPct(toUSD(totals['Herbicide']))}%)\n`;
        report += `ថ្នាំសត្វល្អិត (Pesticide): $${toUSD(totals['Pesticide']).toLocaleString()} (${getPct(toUSD(totals['Pesticide']))}%)\n`;
        report += `ថ្នាំជំងឺ (Fungicide): $${toUSD(totals['Fungicide']).toLocaleString()} (${getPct(toUSD(totals['Fungicide']))}%)\n\n`;
        report += `*សរុបថ្នាំ (Subtotal): $${toUSD(totalMedicineRiel).toLocaleString()} (${getPct(toUSD(totalMedicineRiel))}%)*\n`;
        report += `----------------------------------\n`;
        report += `💰 *សរុបរួម (Grand Total): $${grandTotalUSD.toLocaleString()}*`;

        const finalKb = Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ ផ្លាស់ប្តូរថ្ងៃខែ (Change Date)', 'go_back_menu')],
            [Markup.button.callback('❌ បិទចោល (Close)', 'close_report')]
        ]);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(report, { parse_mode: 'Markdown', ...finalKb });
        } else {
            await ctx.reply(report, { parse_mode: 'Markdown', ...finalKb });
        }

    } catch (err) {
        console.error(err);
        ctx.reply('❌ មានបញ្ហាបច្ចេកទេសក្នុងការគណនាទិន្នន័យ។');
    }
}

// --- BUTTON CALLBACK ACTIONS ---
bot.action('range_3_months', (ctx) => {
    const end = new Date(); const start = new Date(); start.setMonth(end.getMonth() - 3);
    generateReport(ctx, start, end);
});

bot.action('range_6_months', (ctx) => {
    const end = new Date(); const start = new Date(); start.setMonth(end.getMonth() - 6);
    generateReport(ctx, start, end);
});

bot.action('range_1_year', (ctx) => {
    const end = new Date(); const start = new Date(); start.setFullYear(end.getFullYear() - 1);
    generateReport(ctx, start, end);
});

bot.action('range_custom', async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    if (!session) return ctx.reply('Please run /start first.');
    
    session.step = 'awaiting_start_date';
    await ctx.editMessageText('📅 សូមវាយបញ្ចូល *ថ្ងៃខែឆ្នាំចាប់ផ្តើម* តាមទម្រង់គំរូខាងក្រោម៖\n\n👉 ទម្រង់គំរូ៖ `DD-MM-YYYY` (ឧទាហរណ៍៖ `01-01-2026`)', { parse_mode: 'Markdown' });
    await ctx.answerCbQuery();
});

bot.action('go_back_menu', async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    if (session) session.step = 'idle';
    await sendMainMenu(ctx, session ? session.customerName : 'អតិថិជន', session ? session.customerId : '');
    await ctx.answerCbQuery();
});

bot.action('close_report', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) { await ctx.editMessageText('🗑️ របាយការណ៍ត្រូវបានលុប។'); }
    await ctx.answerCbQuery();
});

// --- TEXT CHAT WIZARD FLOW INTERCEPTOR ---
bot.on('text', async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    if (!session || session.step === 'idle') return;

    const textInput = ctx.message.text.trim();

    if (session.step === 'awaiting_start_date') {
        const parsedStart = parseDateString(textInput);
        if (!parsedStart) {
            return ctx.reply('❌ ទម្រង់ថ្ងៃខែមិនត្រឹមត្រូវឡើយ។ សូមព្យាយាមម្តងទៀតដោយវាយបញ្ចូលតាមទម្រង់ `DD-MM-YYYY` (ឧទាហរណ៍៖ `01-01-2026`)៖');
        }
        session.customStartDate = parsedStart;
        session.step = 'awaiting_end_date';
        return ctx.reply(`✅ ទទួលបានថ្ងៃចាប់ផ្តើម៖ ${parsedStart.toLocaleDateString('km-KH')}\n\n📅 បន្ទាប់មកទៀត សូមវាយបញ្ចូល *ថ្ងៃខែឆ្នាំបញ្ចប់* (\`DD-MM-YYYY\`)៖`, { parse_mode: 'Markdown' });
    }

    if (session.step === 'awaiting_end_date') {
        const parsedEnd = parseDateString(textInput);
        if (!parsedEnd) {
            return ctx.reply('❌ ទម្រង់ថ្ងៃខែមិនត្រឹមត្រូវឡើយ។ សូមព្យាយាមម្តងទៀតដោយវាយបញ្ចូលតាមទម្រង់ `DD-MM-YYYY` (ឧទាហរណ៍៖ `30-06-2026`)៖');
        }
        
        if (parsedEnd < session.customStartDate) {
            return ctx.reply('❌ ថ្ងៃខែបញ្ចប់មិនអាចតូចជាងថ្ងៃខែចាប់ផ្តើមបានឡើយ។ សូមវាយបញ្ចូលថ្ងៃខែបញ្ចប់ម្តងទៀត៖');
        }

        parsedEnd.setHours(23, 59, 59, 999);
        session.step = 'idle';

        ctx.reply('⏳ កំពុងទាញយកទិន្នន័យ និងគណនារបាយការណ៍ សូមរង់ចាំ...');
        generateReport(ctx, session.customStartDate, parsedEnd);
    }
});

// Start Express server
app.get('/', (req, res) => res.send('Bot is running live!'));
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));