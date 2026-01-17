const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 Fixed Bot Starting...');

// ==================== CONFIG ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1457870506505011331';
const SPECIAL_CHANNEL_ID = '1447208095217619055';

// CHANNELS WHERE BOT SHOULD OPERATE
const ALLOWED_CHANNELS = [
  '1447208038665556053', // general
  '1447208095217619055', // self
  '1447204367089270876', // other channel?
];

// ==================== API KEYS ====================
const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5
].filter(Boolean);

console.log(`🔑 ${API_KEYS.length} keys loaded`);
let keyIndex = 0;

function getKey() { return API_KEYS[keyIndex]; }
function nextKey() { keyIndex = (keyIndex + 1) % API_KEYS.length; }

async function askAI(question) {
  for (let i = 0; i < API_KEYS.length * 2; i++) {
    try {
      const groq = new Groq({ apiKey: getKey() });
      const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: question }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      return result;
      
    } catch (e) {
      console.log(`Key ${keyIndex} failed`);
      nextKey();
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return { delete: false, minor: false, confidence: 'low', reason: 'AI failed' };
}

// ==================== AI CHECK ====================
async function analyzeMessage(text) {
  const prompt = `Analyze this Discord message:

"${text}"

RULES:
1. If message contains age 18+ (18, 19, 20, etc.) → KEEP
2. If message contains age under 18 (15, 16, 17) → DELETE + FLAG MINOR
3. If NO age mentioned but looks like dating/NSFW → DELETE ONLY (no flag)
4. General chat without age → KEEP
5. Watch for: "41 reversed" = 14 (minor), "51 swap" = 15 (minor)

Return JSON:
{
  "delete": boolean (delete message?),
  "minor": boolean (is this a CERTAIN minor?),
  "confidence": "high/medium/low",
  "reason": "brief explanation"
}`;
  
  return await askAI(prompt);
}

// ==================== DISCORD ====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} ready`);
  console.log(`📋 Log channel: ${LOG_CHANNEL_ID}`);
  client.user.setActivity('Age Check', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  // ONLY operate in specific channels
  if (!ALLOWED_CHANNELS.includes(msg.channel.id)) {
    return; // Ignore other channels
  }
  
  if (!msg.content || msg.content.trim().length < 2) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // Special channel: needs attachment
    if (isSpecialChannel) {
      const hasFile = msg.attachments?.size > 0;
      if (!hasFile) {
        await msg.delete();
        console.log(`📸 Deleted: No attachment in media channel`);
        return;
      }
    }
    
    const analysis = await analyzeMessage(msg.content);
    console.log(`🤖 Channel: ${msg.channel.id}, "${msg.content.substring(0, 30)}..." → Delete: ${analysis.delete}, Minor: ${analysis.minor}`);
    
    if (analysis.delete) {
      await msg.delete();
      
      // LOG ONLY if CERTAIN MINOR
      if (analysis.minor && analysis.confidence === 'high') {
        console.log(`📋 LOGGING MINOR: ${analysis.reason}`);
        await logMinor(msg, analysis);
      } else {
        console.log(`🗑️ Deleted (not a minor)`);
      }
    } else {
      console.log(`✅ Kept`);
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
});

// ==================== LOGGING - FIXED ====================
async function logMinor(msg, analysis) {
  try {
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) {
      console.error(`❌ Cannot find log channel ${LOG_CHANNEL_ID}`);
      return;
    }
    
    console.log(`📨 Sending to log channel: ${logChannel.name}`);
    
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 MINOR DETECTED')
      .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
      .setDescription(`**Message:**\n\`\`\`${msg.content.substring(0, 1000)}\`\`\``)
      .addFields(
        { name: 'Reason', value: analysis.reason || 'Underage detected', inline: false },
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
    
    await logChannel.send({ embeds: [embed], components: [buttons] });
    console.log(`✅ Logged to channel successfully`);
    
  } catch (e) {
    console.error('❌ Logging failed:', e.message);
  }
}

// ==================== BUTTONS ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const [action, userId] = interaction.customId.split('_');
  
  await interaction.deferReply({ ephemeral: true });
  
  if (action === 'ban') {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member.ban({ reason: `Minor - by ${interaction.user.tag}` });
      await interaction.editReply({ content: '✅ Banned' });
    }
  } else if (action === 'ignore') {
    await interaction.editReply({ content: '✅ Ignored' });
  }
});

// ==================== SERVER ====================
const app = express();
app.get('/', (req, res) => res.json({ 
  status: 'online', 
  bot: client.user?.tag,
  log_channel: LOG_CHANNEL_ID 
}));
app.listen(process.env.PORT || 10000, () => console.log('🌐 Server up'));

// ==================== LOGIN ====================
console.log('🔑 Logging in...');
client.login(process.env.BOT_TOKEN).catch(console.error);
