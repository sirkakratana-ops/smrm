const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// 1. Initialize Supabase Client using Environment Variables
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 3. Set up Express Server for Render Webhook
const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = `/bot-${process.env.TELEGRAM_BOT_TOKEN}`;

// Tell Telegram to send updates to your Render Webhook URL
if (process.env.RENDER_EXTERNAL_URL) {
    bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}${WEBHOOK_PATH}`);
    app.use(bot.webhookCallback(WEBHOOK_PATH));
}

// --- TELEGRAM BOT LOGIC ---

// Command: /start (Restored so users have a button to click)
bot.command('start', (ctx) => {
    ctx.reply('សូមស្វាគមន៍មកកាន់ហាងកសិកម្ម ស្រែមាន! សូមចែករំលែកលេខទូរស័ព្ទរបស់អ្នកដើម្បីពិនិត្យប្រវត្តិកុម្មង់។', 
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
        
        if (!phone.startsWith('+')) {
            phone = '+' + phone;
        }

        console.log("👉 Executing dynamic 1-year report lookup for phone:", phone);

        // 1. Fetch the customer
        const { data: customer, error: custError } = await supabase
            .from('customers')
            .select('id, name')
            .eq('phone', phone)
            .single();

        if (custError || !customer) {
            return ctx.reply('❌ រកមិនឃើញលេខទូរស័ព្ទរបស់អ្នកក្នុងប្រព័ន្ធឡើយ។');
        }

        // 2. Calculate the rolling 1-year dates
        const endDate = new Date(); 
        const startDate = new Date();
        startDate.setFullYear(endDate.getFullYear() - 1); 

        // 3. Fetch all invoice items for this customer within the rolling year date range
        const { data: items, error: itemError } = await supabase
            .from('invoice_items')
            .select(`
                quantity,
                unit_price,
                category,
                invoices!inner(customer_id, invoice_date)
            `)
            .eq('invoices.customer_id', customer.id)
            .gte('invoices.invoice_date', startDate.toISOString())
            .lte('invoices.invoice_date', endDate.toISOString());

        if (itemError || !items || items.length === 0) {
            return ctx.reply(`👋 ជម្រាបសួរ ${customer.name}! អ្នកមិនទាន់មានប្រវត្តិទិញទំនិញក្នុងរយៈពេល ១ ឆ្នាំចុងក្រោយនេះទេ។`);
        }

        // 4. Initialize category totals in Riel (៛)
        let totals = {
            'Granular Fertilizer': 0,
            'Liquid Fertilizer': 0,
            'Powder Fertilizer': 0,
            'Pesticide': 0,
            'Fungicide': 0,
            'Herbicide': 0
        };

        // Sum up total Riel values grouped by category
        items.forEach(item => {
            const itemTotalRiel = Number(item.quantity) * Number(item.unit_price);
            if (totals[item.category] !== undefined) {
                totals[item.category] += itemTotalRiel;
            }
        });

        // 5. Compute Grand Total and Group Sub-totals in Riel
        const totalFertilizerRiel = totals['Granular Fertilizer'] + totals['Liquid Fertilizer'] + totals['Powder Fertilizer'];
        const totalMedicineRiel = totals['Pesticide'] + totals['Fungicide'] + totals['Herbicide'];
        const grandTotalRiel = totalFertilizerRiel + totalMedicineRiel;

        if (grandTotalRiel === 0) {
            return ctx.reply(`👋 ជម្រាបសួរ ${customer.name}! មិនមានទិន្នន័យទិញទំនិញសរុបឡើយ។`);
        }

        // 6. Convert EVERYTHING to USD ($) using 1$ = 4000៛ exchange rate
        const EXCHANGE_RATE = 4000;
        const toUSD = (riel) => riel / EXCHANGE_RATE;

        const granularUSD = toUSD(totals['Granular Fertilizer']);
        const liquidUSD = toUSD(totals['Liquid Fertilizer']);
        const powderUSD = toUSD(totals['Powder Fertilizer']);
        const fertilizerSubUSD = toUSD(totalFertilizerRiel);

        const herbicideUSD = toUSD(totals['Herbicide']);
        const pesticideUSD = toUSD(totals['Pesticide']); // Fixed spelling typo here
        const fungicideUSD = toUSD(totals['Fungicide']);
        const medicineSubUSD = toUSD(totalMedicineRiel);
        
        const grandTotalUSD = toUSD(grandTotalRiel);

        // 7. Calculate Percentages based on Grand Total
        const getPct = (usdValue) => ((usdValue / grandTotalUSD) * 100).toFixed(0);

        // 8. Construct the clean Khmer Report Response String
        let report = `🌾 *សូមជូនរបាយការណ៍ប្រចាំឆ្នាំ*\n`;
        report += `ឈ្មោះ: *${customer.name}*\n`;
        report += `📅: ${startDate.toLocaleDateString('km-KH')} ដល់ ${endDate.toLocaleDateString('km-KH')}\n`;
        report += `-----------------------------\n`;
        report += `ជីគ្រាប់ Granular: $${granularUSD.toLocaleString()} (${getPct(granularUSD)}%)\n`;
        report += `ជីទឹក Liquid: $${liquidUSD.toLocaleString()} (${getPct(liquidUSD)}%)\n`;
        report += `ជីម្សៅ Powder: $${powderUSD.toLocaleString()} (${getPct(powderUSD)}%)\n\n`;
        report += `*សរុបជី: $${fertilizerSubUSD.toLocaleString()} (${getPct(fertilizerSubUSD)}%)*\n`;
        report += `-----------------------------\n`;
        report += `ថ្នាំស្មៅ Herbicide: $${herbicideUSD.toLocaleString()} (${getPct(herbicideUSD)}%)\n`;
        report += `ថ្នាំសត្វល្អិត Pesticide: $${pesticideUSD.toLocaleString()} (${getPct(pesticideUSD)}%)\n`;
        report += `ថ្នាំជំងឺ Fungicide: $${fungicideUSD.toLocaleString()} (${getPct(fungicideUSD)}%)\n\n`;
        report += `*សរុបថ្នាំ: $${medicineSubUSD.toLocaleString()} (${getPct(medicineSubUSD)}%)*\n`;
        report += `-----------------------------\n`;
        report += `💰 *សរុបរួម Total: $${grandTotalUSD.toLocaleString()}*`;

        // Send the complete summary with a close button
        await ctx.reply(report, { 
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('❌ បិទរបាយការណ៍ (Close)', 'delete_this_invoice')]
            ])
        });

    } catch (err) {
        console.error("Critical Execution Error inside bot.on:", err);
        ctx.reply('❌ មានបញ្ហាបច្ចេកទេសក្នុងការគណនារបាយការណ៍។');
    }
});

// Callback listener to clear/close the report card message
bot.action('delete_this_invoice', async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch (error) {
        console.error("Failed to delete report message:", error);
        await ctx.editMessageText('🗑️ របាយការណ៍ចាស់ត្រូវបានលុបចេញពីអេក្រង់។');
    }
    await ctx.answerCbQuery();
});

// Start Express server
app.get('/', (req, res) => res.send('Bot is running live!'));
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
