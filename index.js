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

// Temporary in-memory state tracker to keep track of user context sessions
const userSessions = new Map();

// --- TELEGRAM BOT LOGIC ---

// Command: /start
bot.command('start', (ctx) => {
    ctx.reply('សូមស្វាគមន៍មកកាន់ហាងកសិកម្ម ស្រែមាន! សូមចែករំលែកលេខទូរស័ព្ទរបស់អ្នកដើម្បីពិនិត្យរបាយការណ៍។', 
        Markup.keyboard([
            Markup.button.contactRequest('📲 ចែករំលែកលេខទូរស័ព្ទ (Share Contact)')
        ]).oneTime().resize()
    );
});

// Handler: When user clicks "Share Contact"
bot.on('contact', async (ctx) => {
    try {
        let phone = ctx.message.contact.phone_number;
        phone = phone.replace(/[^0-9+]/g, ''); 
        if (!phone.startsWith('+')) phone = '+' + phone;

        // Extract Customer ID (Removes "+855" or "855")
        const customerId = phone.replace(/^\+?855/, ''); 

        // Verify Customer exists
        const { data: customer, error: custError } = await supabase
            .from('customers')
            .select('id, name')
            .eq('id', customerId)
            .single();

        if (custError || !customer) {
            return ctx.reply('❌ រកមិនឃើញប្រវត្តិរបស់អ្នកក្នុងប្រព័ន្ធឡើយ។');
        }

        // Save session data so the button handlers know who is querying
        userSessions.set(ctx.from.id, { customerId: customer.id, customerName: customer.name });

        // Prompt user to select their desired date timeframe filter
        await ctx.reply(`👋 ជម្រាបសួរ ${customer.name}!\nសូមជ្រើសរើសចន្លោះកាលបរិច្ឆេទដែលអ្នកចង់ពិនិត្យរបាយការណ៍៖`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('📅 ប្រវត្តិ ៣ ខែចុងក្រោយ (Last 3 Months)', 'range_3_months')],
                [Markup.button.callback('📅 ប្រវត្តិ ៦ ខែចុងក្រោយ (Last 6 Months)', 'range_6_months')],
                [Markup.button.callback('🗓️ របាយការណ៍ប្រចាំឆ្នាំ (Full 1 Year)', 'range_1_year')]
            ])
        );

    } catch (err) {
        console.error(err);
        ctx.reply('❌ មានបញ្ហាបច្ចេកទេសក្នុងការតភ្ជាប់។');
    }
});

// --- DYNAMIC REUSABLE REPORT GENERATION FUNCTION ---
async function generateReport(ctx, monthsBack) {
    const session = userSessions.get(ctx.from.id);
    if (!session) {
        return ctx.reply('⚠️ សេសសិនរបស់អ្នកបានផុតកំណត់។ សូមចែករំលែកលេខទូរស័ព្ទម្តងទៀត (/start)។');
    }

    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - monthsBack);

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
            return ctx.editMessageText(`👋 ជម្រាបសួរ ${session.customerName}!\nមិនមានប្រវត្តិទិញទំនិញក្នុងចន្លោះកាលបរិច្ឆេទនេះឡើយ (${monthsBack} ខែចុងក្រោយ)។`,
                Markup.inlineKeyboard([[Markup.button.callback('⬅️ ត្រឡប់ក្រោយ (Go Back)', 'go_back_menu')]])
            );
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

        // Pushes content up to clear contact display illusion
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

        await ctx.editMessageText(report, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ ផ្លាស់ប្តូរថ្ងៃខែ (Change Date)', 'go_back_menu')],
                [Markup.button.callback('❌ បិទចោល (Close)', 'close_report')]
            ])
        });

    } catch (err) {
        console.error(err);
        ctx.reply('❌ មានបញ្ហាបច្ចេកទេសក្នុងការគណនាទិន្នន័យ។');
    }
}

// --- BUTTON CALLBACK ACTIONS ---
bot.action('range_3_months', (ctx) => generateReport(ctx, 3));
bot.action('range_6_months', (ctx) => generateReport(ctx, 6));
bot.action('range_1_year', (ctx) => generateReport(ctx, 12));

bot.action('go_back_menu', async (ctx) => {
    const session = userSessions.get(ctx.from.id);
    const name = session ? session.customerName : 'អតិថិជន';
    await ctx.editMessageText(`👋 ជម្រាបសួរ ${name}!\nសូមជ្រើសរើសចន្លោះកាលបរិច្ឆេទដែលអ្នកចង់ពិនិត្យរបាយការណ៍ឡើងវិញ៖`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('📅 ប្រវត្តិ ៣ ខែចុងក្រោយ (Last 3 Months)', 'range_3_months')],
            [Markup.button.callback('📅 ប្រវត្តិ ៦ ខែចុងក្រោយ (Last 6 Months)', 'range_6_months')],
            [Markup.button.callback('🗓️ របាយការណ៍ប្រចាំឆ្នាំ (Full 1 Year)', 'range_1_year')]
        ])
    );
    await ctx.answerCbQuery();
});

bot.action('close_report', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) { await ctx.editMessageText('🗑️ របាយការណ៍ត្រូវបានលុបចេញពីអេក្រង់។'); }
    await ctx.answerCbQuery();
});

// Start Express server
app.get('/', (req, res) => res.send('Bot is running live!'));
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
