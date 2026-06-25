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

// Command: /start
bot.command('start', (ctx) => {
    ctx.reply('សូមស្វាគមន៍មកកាន់ហាងកសិកម្ម ស្រែមាស! សូមចែករំលែកលេខទូរស័ព្ទរបស់អ្នកដើម្បីពិនិត្យប្រវត្តិកុម្មង់។', 
        Markup.keyboard([
            Markup.button.contactRequest('📲 ចែករំលែកលេខទូរស័ព្ទ (Share Contact)')
        ]).oneTime().resize()
    );
});

// Handler: When user clicks "Share Contact"
bot.on('contact', async (ctx) => {
    let phone = ctx.message.contact.phone_number;

    // Remove all spaces, dashes, or parentheses to make it numbers-only
    phone = phone.replace(/[^0-9]/g, ''); 
    
    // Add a single '+' at the front so it matches standard global format
    phone = '+' + phone; 

    // Now phone becomes exactly: "+85515612512"
    console.log("Searching database for:", phone); 
    
    // ... rest of your supabase lookup code remains the same ...


    try {
        // Fetch the customer from Supabase by phone
        const { data: customer, error: custError } = await supabase
            .from('customers')
            .select('id, name')
            .eq('phone', phone)
            .single();

        if (custError || !customer) {
            return ctx.reply('❌ រកមិនឃើញលេខទូរស័ព្ទរបស់អ្នកក្នុងប្រព័ន្ធឡើយ។ សូមទាក់ទងមកហាងផ្ទាល់ដើម្បីចុះឈ្មោះ។');
        }

        // Fetch recent invoices for this customer
        const { data: invoices, error: invError } = await supabase
            .from('invoices')
            .select(`
                id, 
                invoice_date, 
                total_amount, 
                status,
                invoice_items (product_name, quantity, unit_price)
            `)
            .eq('customer_id', customer.id)
            .order('invoice_date', { ascending: false })
            .limit(5);

        if (invError || !invoices || invoices.length === 0) {
            return ctx.reply(`👋 ជម្រាបសួរ ${customer.name}! អ្នកមិនទាន់មានប្រវត្តិទិញទំនិញក្នុងប្រព័ន្ធនៅឡើយទេ។`);
        }

        // Build the Khmer text invoice response string
        let report = `🌾 *ហាងកសិកម្ម ស្រែមាន*\n`;
        report += `អតិថិជន: *${customer.name}*\n`;
        report += `----------------------------------\n\n`;

        invoices.forEach((inv) => {
            const date = new Date(inv.invoice_date).toLocaleDateString('km-KH');
            const statusKhmer = inv.status === 'Debt' ? 'ជំពាក់ (Debt) ⚠️' : 'ទូទាត់រួចរាល់ ✅';
            
            report += `📄 *វិក្កយបត្រ #: ${inv.id}* (${date})\n`;
            report += `ស្ថានភាព: ${statusKhmer}\n`;
            
            inv.invoice_items.forEach((item, index) => {
                report += `  ${index + 1}. ${item.product_name} x ${item.quantity} (តម្លៃដើម: ${Number(item.unit_price).toLocaleString()}៛)\n`;
            });
            
            report += `💰 *សរុបរួម: ${Number(inv.total_amount).toLocaleString()} ៛*\n`;
            report += `----------------------------------\n\n`;
        });

        await ctx.reply(report, { parse_mode: 'Markdown' });

    } catch (err) {
        console.error(err);
        ctx.reply('❌ មានបញ្ហាបច្ចេកទេសក្នុងការទាញយកទិន្នន័យ។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។');
    }
});

// Start Express server
app.get('/', (req, res) => res.send('Bot is running live!'));
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
