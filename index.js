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

// 🔐 SALES TEAM SECRET PASSWORD
// 👉 អ្នកអាចប្តូរពាក្យ "SMCUS2026" ទៅជាលេខសម្ងាត់អ្វីផ្សេងដែលអ្នកចង់បាន
const SALES_PASSWORD = 'SMCUS2026';

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
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
        return date;
    }
    return null;
}

// --- TELEGRAM BOT LOGIC ---

// Command: /start
bot.command('start', (ctx) => {
    // បង្កើត Session ថ្មី ឬរក្សាទុកប្រព័ន្ធចាស់បើធ្លាប់លេង
    if (!userSessions.has(ctx.from.id)) {
        userSessions.set(ctx.from.id, { step: 'idle', isSalesAuthenticated: false });
    }

    ctx.reply('🌾 សូមស្វាគមន៍មកកាន់ហាងកសិកម្ម ស្រែមាស!\n\n🔹 សម្រាប់អតិថិជន៖ សូមចុចប៊ូតុងខាងក្រោមដើម្បីឆែករបាយការណ៍ផ្ទាល់ខ្លួន\n🔹 សម្រាប់ក្រុមការងារលក់៖ សូមវាយបញ្ចូលលេខទូរស័ព្ទអតិថិជនដើម្បីស្វែងរក។', 
        Markup.keyboard([
            Markup.button.contactRequest('📲 ចែករំលែកលេខទូរស័ព្ទ (Share Contact)')
        ]).oneTime().resize()
    );
});

// Main selection menu view component
async function sendMainMenu(ctx, customerName, customerId) {
    const text = `👋 របាយការណ៍របស់អតិថិជន៖ *${customerName}*\nសូមជ្រើសរើសចន្លោះកាលបរិច្ឆេទដែលចង់ពិនិត្យ៖`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📅 ប្រវត្តិ ៣ ខែចុងក្រោយ', 'range_3_months')],
        [Markup.button.callback('📅 ប្រវត្តិ ៦ ខែចុងក្រោយ', 'range_6_months')],
        [Markup.button.callback('🗓️ របាយការណ៍ប្រចាំឆ្នាំ (1 Year)', 'range_1_year')],
        [Markup.button.callback('✏️ ជ្រើសរើសថ្ងៃខែដោយខ្លួនឯង (Custom Range)', 'range_custom')]
    ]);

    if (ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } else {
        await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    }
}

// Handler: When user clicks "Share Contact" (For normal customers)
bot.on('contact', async (ctx) => {
    try {
        const senderTelegramId = ctx.from.id;
        const contactOwnerTelegramId = ctx.message.contact.user_id;

        if (!contactOwnerTelegramId || senderTelegramId !== contactOwnerTelegramId) {
            return ctx.reply('⚠️ ពិនិត្យឃើញកំហុសសុវត្ថិភាព៖ សូមចុចប៊ូតុង "📲 ចែករំលែកលេខទូរស័ព្ទ" នៅផ្នែកខាងក្រោម ដើម្បីចែករំលែកលេខផ្ទាល់ខ្លួនរបស់អ្នក។');
        }

        let phone = ctx.message.contact.phone_number;
        phone = phone.replace(/[^0-9+]/g, ''); 
        if (!phone.startsWith('+')) phone = '+' + phone;

        const customerId = phone.replace(/^\+?855/, ''); 

        const { data: customer, error: custError } = await supabase
            .from('customers')
            .select('id, name')
            .eq('id', customerId)
            .single();

        if (custError || !customer) {
            return ctx.reply('❌ រកមិនឃើញប្រវត្តិរបស់អ្នកក្នុងប្រព័ន្ធឡើយ។');
        }

        userSessions.set(ctx.from.id, { 
            customerId: customer.id, 
            customerName: customer.name,
            step: 'idle',
            isSalesAuthenticated: false
        });

        await sendMainMenu(ctx, customer.name, customer.id);

    } catch (err) {
        console.error(err);
        ctx.reply('❌ មានបញ្ហាបច្ចេកទេសក្នុងការតភ្ជាប់។');
    }
});

// Function to handle database lookup once authorized
async function lookupCustomerByPhone(ctx, session, phoneInput) {
    let cleanPhone = phoneInput.replace(/[^0-9+]/g, '');
    let customerId = cleanPhone;
    if (customerId.startsWith('+855')) customerId = customerId.replace('+855', '');
    else if (customerId.startsWith('855')) customerId = customerId.replace('855', '');
    else if (customerId.startsWith('0')) customerId = customerId.substring(1);

    try {
        const { data: customer, error: custError } = await supabase
            .from('customers')
            .select('id, name')
            .eq('id', customerId)
            .single();

        if (custError || !customer) {
            return ctx.reply(`❌ រកមិនឃើញអតិថិជនដែលមានលេខទូរស័ព្ទនេះទេ! (ID ស្វែងរក៖ ${customerId})`);
        }

        // Save target customer to active session metadata
        session.customerId = customer.id;
        session.customerName = customer.name;
        session.step = 'idle';

        await sendMainMenu(ctx, customer.name, customer.id);
    } catch (err) {
        console.error(err);
        ctx.reply('❌ មានបញ្ហាបច្ចេកទេសក្នុងការតភ្ជាប់។');
    }
}

// --- DYNAMIC CORE ENGINE ---
async function generateReport(ctx, startDate, endDate) {
    const session = userSessions.get(ctx.from.id);
    if (!session) {
        return ctx.reply('⚠️ សេសសិនបានផុតកំណត់។ សូមវាយបញ្ចូលលេខទូរស័ព្ទអតិថិជនម្តងទៀត។');
    }

    try {
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
            const emptyMsg = `👋 របាយការណ៍របស់៖ *${session.customerName}*\nមិនមានប្រវត្តិទិញទំនិញក្នុងចន្លោះកាលបរិច្ឆេទនេះឡើយ៖\n📍 ពី ${startDate.toLocaleDateString('km-KH')} ដល់ ${endDate.toLocaleDateString('km-KH')}`;
            const emptyKb = Markup.inlineKeyboard([[Markup.button.callback('⬅️ ត្រឡប់ក្រោយ (Go Back)', 'go_back_menu')]]);
            
            return ctx.reply(emptyMsg, { parse_mode: 'Markdown', ...emptyKb });
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

        let report = `\n`.repeat(25);
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
    const userId = ctx.from.id;
    
    // បង្កើត Session បើមិនទាន់មាន
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: 'idle', isSalesAuthenticated: false });
    }
    
    const session = userSessions.get(userId);
    const textInput = ctx.message.text.trim();

    // 🔐 ករណីទី១៖ កំពុងស្ថិតក្នុងដំណាក់កាលទាមទារលេខសម្ងាត់ (Verifying Password)
    if (session.step === 'awaiting_sales_password') {
        if (textInput === SALES_PASSWORD) {
            session.isSalesAuthenticated = true;
            ctx.reply('✅ លេខសម្ងាត់ត្រឹមត្រូវ! ប្រព័ន្ធបានបើកសិទ្ធិជូនក្រុមការងារលក់ជោគជ័យ។');
            
            // បន្តទៅទាញទិន្នន័យលេខទូរស័ព្ទដែល Sales បានវាយមុននេះភ្លាមៗ
            return await lookupCustomerByPhone(ctx, session, session.pendingQueryPhone);
        } else {
            session.step = 'idle';
            return ctx.reply('❌ លេខសម្ងាត់មិនត្រឹមត្រូវទេ! បដិសេធការចូលស្វែងរក។');
        }
    }

    // 🔎 ករណីទី២៖ ក្រុមការងារលក់ វាយបញ្ចូលលេខទូរស័ព្ទដើម្បីស្វែងរក
    if (session.step === 'idle' && (textInput.match(/^\d+$/) || textInput.startsWith('+'))) {
        // បើមិនទាន់បានវាយលេខសម្ងាត់ផ្ទៀងផ្ទាត់ទេ
        if (!session.isSalesAuthenticated) {
            session.step = 'awaiting_sales_password';
            session.pendingQueryPhone = textInput; // រក្សាទុកលេខទូរស័ព្ទដែលចង់ស្វែងរកបណ្តោះអាសន្ន
            return ctx.reply('🔐 មុខងារស្វែងរកនេះសម្រាប់តែក្រុមការងារលក់ប៉ុណ្ណោះ។ សូមវាយបញ្ចូលលេខសម្ងាត់ដើម្បីបន្ត៖');
        }
        
        // បើធ្លាប់វាយលេខសម្ងាត់ត្រូវរួចហើយ គឺរត់ទៅរកទិន្នន័យតែម្តង
        return await lookupCustomerByPhone(ctx, session, textInput);
    }

    // 📅 ករណីទី៣៖ ដំណាក់កាលរើសកាលបរិច្ឆេទ Custom Range
    if (session.step === 'awaiting_start_date') {
        const parsedStart = parseDateString(textInput);
        if (!parsedStart) {
            return ctx.reply('❌ ទម្រង់ថ្ងៃខែមិនត្រឹមត្រូវឡើយ។ សូមព្យាយាមម្តងទៀតតាមទម្រង់ `DD-MM-YYYY`៖');
        }
        session.customStartDate = parsedStart;
        session.step = 'awaiting_end_date';
        return ctx.reply(`✅ ទទួលបានថ្ងៃចាប់ផ្តើម៖ ${parsedStart.toLocaleDateString('km-KH')}\n\n📅 សូមវាយបញ្ចូល *ថ្ងៃខែឆ្នាំបញ្ចប់* (\`DD-MM-YYYY\`)៖`, { parse_mode: 'Markdown' });
    }

    if (session.step === 'awaiting_end_date') {
        const parsedEnd = parseDateString(textInput);
        if (!parsedEnd) {
            return ctx.reply('❌ ទម្រង់ថ្ងៃខែមិនត្រឹមត្រូវឡើយ។ សូមព្យាយាមម្តងទៀតតាមទម្រង់ `DD-MM-YYYY`៖');
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
