const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 Age Bot Starting...');

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
        max_tokens: 100
      });
      
      return response.choices[0].message.content;
      
    } catch (e) {
      console.log(`Key ${keyIndex} failed`);
      nextKey();
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return 'DELETE'; // If all keys fail, delete
}

// ==================== MINIMAL REGEX CHECKS ====================
function quickChecks(text) {
  const lower = text.toLowerCase();
  
  // 1. REVERSED CODES (only regex we need)
  if (/(41|51|61|71).*(reversed|swap|🔄|🔃)/i.test(lower) || 
      /(reversed|swap|🔄|🔃).*(41|51|61|71)/i.test(lower)) {
    return { action: 'DELETE_LOG', reason: 'Reversed age code' };
  }
  
  // 2. "18" anywhere = KEEP (simple regex)
  if (/\b18\b/i.test(text)) {
    return { action: 'KEEP', reason: 'Age 18' };
  }
  
  return null; // Let AI decide
}

// ==================== AI CHECK ====================
async function checkMessage(text) {
  // Quick checks first
  const quick = quickChecks(text);
  if (quick) return quick;
  
  // Ask AI
  const response = await askAI(`Message: "${text}"
  
  In this NSFW Discord server, should this message be deleted?
  
  DELETE if:
  - No age 18+ mentioned
  - Age under 18 mentioned
  - Dating message without age
  
  KEEP if:
  - Age 18+ mentioned (23m, 25f, etc.)
  - Not a dating message
  
  Answer: DELETE or KEEP`);
  
  const answer = response.trim().toUpperCase();
  
  if (answer.includes('DELETE')) {
    return { action: 'DELETE', reason: 'AI: ' + answer };
  } else if (answer.includes('KEEP')) {
    return { action: 'KEEP', reason: 'AI: ' + answer };
  } else {
    // If AI confused, delete to be safe
    return { action: 'DELETE', reason: 'AI uncertain' };
  }
}

// ==================== DISCORD ====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`✅ ${client.user.tag} ready`);
  client.user.setActivity('Age Check', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  if (!msg.content || msg.content.trim().length < 2) return;
  
  try {
    // Special channel needs attachment
    if (msg.channel.id === SPECIAL_CHANNEL_ID) {
      const hasFile = msg.attachments?.size > 0;
      if (!hasFile) {
        await msg.delete();
        return;
      }
    }
    
    const result = await checkMessage(msg.content);
    console.log(`🤖 "${msg.content.substring(0, 30)}..." → ${result.action}`);
    
    if (result.action === 'DELETE' || result.action === 'DELETE_LOG') {
      await msg.delete();
      
      if (result.action === 'DELETE_LOG') {
        await logMinor(msg, result.reason);
      }
    }
    // If KEEP, message stays
    
  } catch (e) {
    console.error('Error:', e.message);
  }
});

// ==================== LOGGING ====================
async function logMinor(msg, reason) {
  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return;
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🚨 Minor Detected')
    .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
    .setDescription(`\`\`\`${msg.content.substring(0, 800)}\`\`\``)
    .addFields(
      { name: 'Reason', value: reason, inline: true },
      { name: 'User ID', value: `\`${msg.author.id}\``, inline: true }
    )
    .setTimestamp();
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ban_${msg.author.id}`)
      .setLabel('Ban User')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ignore_${msg.author.id}`)
      .setLabel('Ignore')
      .setStyle(ButtonStyle.Secondary)
  );
  
  await logChannel.send({ embeds: [embed], components: [buttons] });
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
app.get('/', (req, res) => res.json({ status: 'online', bot: client.user?.tag }));
app.listen(process.env.PORT || 10000, () => console.log('🌐 Server up'));

// ==================== LOGIN ====================
console.log('🔑 Logging in...');
client.login(process.env.BOT_TOKEN).catch(console.error);
