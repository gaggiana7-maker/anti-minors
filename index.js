const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 ULTIMATE STRICT Age Bot Starting...');

// ==================== CONFIG ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1457870506505011331';
const SPECIAL_CHANNEL_ID = '1447208095217619055';

// ==================== API KEYS ====================
const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5
].filter(key => key && key.trim() !== '');

console.log(`🔑 ${API_KEYS.length} keys loaded`);
let currentKeyIndex = 0;

function getCurrentKey() { return API_KEYS[currentKeyIndex]; }
function rotateKey() { currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length; }

async function askAI(prompt) {
  for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
    try {
      const groq = new Groq({ apiKey: getCurrentKey() });
      const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      return result;
      
    } catch (error) {
      console.log(`❌ Key ${currentKeyIndex} failed`);
      rotateKey();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return { has_age_18_plus: false, is_minor: false, confidence: 'low', reason: 'AI failed - deleting for safety' };
}

// ==================== IMPROVED STRICT CHECK ====================
async function checkMessage(text) {
  const prompt = `You are analyzing a message in an adult NSFW server. Your ONLY job is to find the AGE of the PERSON WHO WROTE this message.

Message: "${text}"

CRITICAL INSTRUCTIONS:
1. Find the SENDER'S age (usually at start of message: "19m", "22f", "m21", etc.)
2. IGNORE all other numbers (preferences, measurements, "no under X", etc.)
3. REJECT ages above 70 as fake/seller attempts
4. If sender's age is 18-70 → has_age_18_plus = true
5. If sender's age is under 18 → is_minor = true
6. If NO valid age found (missing, above 70, or fake) → has_age_18_plus = false

EXAMPLES OF VALID 18+ (KEEP):
✅ "19m looking for fun" → age 19 (KEEP)
✅ "22m bottom with 7 inch" → age 22, ignore "7" (KEEP)
✅ "m21 bored dm" → age 21 (KEEP)
✅ "18 black vers no -19" → age 18, ignore "-19" preference (KEEP)
✅ "26m top 4 young twinks" → age 26, ignore "young" and "4" (KEEP)
✅ "20f dm open check bio" → age 20 (KEEP)
✅ "30 vers anyone?" → age 30 (KEEP)

EXAMPLES OF MINORS (FLAG + DELETE):
❌ "17m curious" → age 17 (MINOR)
❌ "16 looking for friends" → age 16 (MINOR)
❌ "61m reversed" → 16 reversed (MINOR)
❌ "m51🔁" or "m51🔄" or "51↩️" → 15 reversed (MINOR)
❌ "M71🔄" or "71 reversed" → 17 reversed (MINOR)
❌ "81 swap" or "m81🔁" → 18 reversed = ACTUALLY 18 (KEEP!)
❌ "m15" → age 15 (MINOR)

EXAMPLES OF NO AGE (DELETE):
❌ "hey dm me" → no age
❌ "anyone here?" → no age
❌ "check bio" → no age
❌ "dms open" → no age
❌ "looking for fun" → no age
❌ "400m dm me" → fake age, likely seller (DELETE)
❌ "999f check bio" → fake age, likely seller (DELETE)
❌ "100+ dm" → unrealistic age (DELETE)
❌ "85m sell content" → suspiciously high (DELETE)

TRICKY CASES:
- "22m no under 18" → age 22 (KEEP, "under 18" is a preference not sender's age)
- "25 top no chubby -20" → age 25 (KEEP, "-20" is preference)
- "19 with 8 inch dick" → age 19 (KEEP, ignore "8")
- "reversed 81" or "81🔁" or "81↩️" → 18 reversed = age 18 (KEEP)
- "91🔄" or "reversed 91" → 19 reversed = age 19 (KEEP)
- ANY age with 🔁🔄↩️ symbols = REVERSED age, calculate correctly
- "m51🔁 bottom idc about age" → 51 reversed = 15 (MINOR!)
- "400m dm me" → fake age = seller (DELETE, no valid age)
- "999 check bio" → fake age = seller (DELETE, no valid age)
- "75m looking" → too high, likely fake (DELETE, no valid age)
- Valid age range: 18-70 years old only

Return ONLY this JSON format:
{
  "has_age_18_plus": boolean,
  "is_minor": boolean,
  "confidence": "high" | "medium" | "low",
  "reason": "brief explanation in English"
}`;
  
  return await askAI(prompt);
}

// ==================== DISCORD ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Channel IDs that the bot monitors
const MONITORED_CHANNELS = [
  LOG_CHANNEL_ID,
  SPECIAL_CHANNEL_ID,
  // Add other channel IDs here if needed
];

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} ready`);
  console.log(`📋 Log channel: ${LOG_CHANNEL_ID}`);
  console.log(`🔒 Special channel: ${SPECIAL_CHANNEL_ID}`);
  console.log(`🚨 RULE: No age 18+ = DELETE`);
  client.user.setActivity('18+ ONLY 🔞', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  // ONLY monitor specific channels
  if (!MONITORED_CHANNELS.includes(msg.channel.id)) return;
  
  // Skip very short messages
  if (!msg.content || msg.content.trim().length < 1) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // SPECIAL CHANNEL: Requires photo/video attachment
    if (isSpecialChannel) {
      const hasAttachment = msg.attachments?.size > 0 && 
        Array.from(msg.attachments.values()).some(att => 
          att.contentType?.startsWith('image/') || 
          att.contentType?.startsWith('video/')
        );
      
      if (!hasAttachment) {
        await msg.delete();
        console.log(`🗑️ Deleted (Special channel - no media): "${msg.content.substring(0, 30)}..."`);
        return;
      }
    }
    
    // Check message for age
    const check = await checkMessage(msg.content);
    console.log(`🤖 "${msg.content.substring(0, 40)}..." → Age 18+: ${check.has_age_18_plus}, Minor: ${check.is_minor}, Confidence: ${check.confidence}`);
    
    if (!check.has_age_18_plus) {
      // NO AGE 18+ → DELETE
      await msg.delete();
      
      // ONLY LOG IF CONFIRMED MINOR (high confidence)
      if (check.is_minor && check.confidence === 'high') {
        console.log(`🚨 MINOR DETECTED - Logging to channel`);
        await logMinor(msg, check);
      } else {
        console.log(`🗑️ Deleted: No age 18+ mentioned`);
      }
    } else {
      // HAS AGE 18+ → KEEP
      console.log(`✅ Kept: Has age 18+`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
});

// ==================== LOGGING (MINORS ONLY) ====================
async function logMinor(msg, check) {
  try {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) {
      console.error(`❌ Log channel ${LOG_CHANNEL_ID} not found`);
      return;
    }
    
    console.log(`📨 Sending minor alert to log channel...`);
    
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 MINOR DETECTED')
      .setAuthor({ 
        name: msg.author.tag, 
        iconURL: msg.author.displayAvatarURL({ dynamic: true }) 
      })
      .setDescription(`**Message:**\n\`\`\`${msg.content.substring(0, 1000)}\`\`\``)
      .addFields(
        { name: 'Reason', value: check.reason || 'Underage detected', inline: false },
        { name: 'Confidence', value: '✅ HIGH', inline: true },
        { name: 'User ID', value: `\`${msg.author.id}\``, inline: true },
        { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true }
      )
      .setTimestamp();
    
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ban_${msg.author.id}_${Date.now()}`)
        .setLabel('Ban User')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ignore_${msg.author.id}_${Date.now()}`)
        .setLabel('Ignore')
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Send without mentioning anyone (silent log)
    await logChannel.send({ 
      embeds: [embed], 
      components: [buttons],
      allowedMentions: { parse: [] } // No mentions
    });
    
    console.log(`✅ Minor logged successfully`);
    
  } catch (error) {
    console.error('❌ Logging failed:', error.message);
  }
}

// ==================== BUTTONS ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const [action, userId] = interaction.customId.split('_');
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    if (action === 'ban') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) {
        await member.ban({ reason: `Minor - banned by ${interaction.user.tag}` });
        
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFooter({ text: `Banned by ${interaction.user.tag}` });
        
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: '✅ User banned successfully' });
      } else {
        await interaction.editReply({ content: '❌ User not found or already left' });
      }
    }
    else if (action === 'ignore') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ text: `Ignored by ${interaction.user.tag}` });
      
      await interaction.message.edit({ embeds: [embed], components: [] });
      await interaction.editReply({ content: '✅ Alert ignored' });
    }
  } catch (error) {
    console.error('Button error:', error);
    await interaction.editReply({ content: '❌ An error occurred' });
  }
});

// ==================== SERVER ====================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: client.user?.tag,
    rule: 'NO AGE 18+ = DELETE',
    monitored_channels: MONITORED_CHANNELS.length
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Health check running on port ${PORT}`);
});

// ==================== LOGIN ====================
console.log('🔑 Logging in to Discord...');
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});
