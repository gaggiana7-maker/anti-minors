const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 Age Check Bot Starting...');

// ==================== CONFIGURATION ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1457870506505011331'; // UPDATED CHANNEL
const SPECIAL_CHANNEL_ID = '1447208095217619055';

// ==================== 5 API KEYS ROTATION ====================
const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5
].filter(key => key && key.trim() !== '');

console.log(`🔑 Loaded ${API_KEYS.length} API keys`);
if (API_KEYS.length === 0) {
  console.error('❌ ERROR: No API keys found!');
}

let currentKeyIndex = 0;

function getCurrentKey() { 
  return API_KEYS[currentKeyIndex]; 
}

function rotateKey() {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return getCurrentKey();
}

async function callAIWithRetry(prompt) {
  for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
    const keyIndex = currentKeyIndex;
    const key = getCurrentKey();
    
    console.log(`🔑 Attempt ${attempt + 1} with Key ${keyIndex}`);
    
    try {
      const groq = new Groq({ apiKey: key });
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 50
      });
      
      const response = completion.choices[0].message.content.trim();
      console.log(`✅ Key ${keyIndex} success`);
      
      return response;
      
    } catch (error) {
      console.error(`❌ Key ${keyIndex} failed:`, error.message.substring(0, 80));
      rotateKey();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  throw new Error(`All keys failed`);
}

// ==================== SMART AGE DETECTION ====================
async function isUser18OrOlder(messageText) {
  const prompt = `Analyze: "${messageText}"
  
  Is the user mentioning or implying they are 18 years old or OLDER?
  
  Look for:
  - Numbers 18+ that could be age: "18top", "23m", "25f", "I'm 20"
  - Context: dating/NSFW + number = likely age
  - Ignore: sizes (cm), money, quantities
  
  When unsure, assume YES (better to allow than delete wrong).
  
  Examples:
  • "18top" → YES
  • "23m" → YES
  • "41 reversed" → NO (means 14)
  • "my dick 20cm" → NO
  • "hello" → NO
  
  Answer ONLY: YES or NO`;
  
  try {
    const response = await callAIWithRetry(prompt);
    const answer = response.trim().toUpperCase();
    
    if (answer.includes('YES') || answer === 'Y') return 'YES';
    if (answer.includes('NO') || answer === 'N') return 'NO';
    
    console.log(`⚠️ Unclear AI response: "${response}", defaulting to YES`);
    return 'YES';
    
  } catch (error) {
    console.error('❌ Age check failed, defaulting to YES');
    return 'YES';
  }
}

// ==================== ATTACHMENT CHECK ====================
function hasAttachment(attachments) {
  if (!attachments || attachments.size === 0) return false;
  return Array.from(attachments.values()).some(att => 
    att.contentType?.startsWith('image/') || 
    att.contentType?.startsWith('video/')
  );
}

// ==================== TIME FUNCTIONS ====================
function getFormattedTimestamp() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
  return `Today at ${time}`;
}

// ==================== DISCORD CLIENT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// ==================== BOT READY ====================
client.once('ready', () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);
  console.log(`🔑 Using ${API_KEYS.length} API keys`);
  client.user.setActivity('Age Check 🔞', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  try {
    // 1. SPECIAL CHANNEL: Photo/Video required
    if (msg.channel.id === SPECIAL_CHANNEL_ID && !hasAttachment(msg.attachments)) {
      await msg.delete();
      console.log('🗑️ Deleted: No attachment in special channel');
      return;
    }
    
    // 2. MAIN CHECK: Is user 18+?
    const ageResult = await isUser18OrOlder(msg.content);
    console.log(`🤖 "${msg.content.substring(0, 50)}..." → ${ageResult}`);
    
    if (ageResult === 'YES') {
      // User is 18+ → Message stays
      console.log('✅ Kept: User is 18+');
    } else {
      // User is under 18 or no age → Delete + Log
      await msg.delete();
      console.log('🗑️ Deleted: Under 18 or no age');
      
      // Log to moderation channel
      await logMinorDetection(msg);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    try { await msg.delete(); } catch {}
  }
});

// ==================== LOG MINOR DETECTION ====================
async function logMinorDetection(msg) {
  const logChannel = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) {
    console.error('❌ Log channel not found:', LOG_CHANNEL_ID);
    return;
  }
  
  const timestamp = getFormattedTimestamp();
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setAuthor({
      name: `${msg.author.username}`,
      iconURL: msg.author.displayAvatarURL({ dynamic: true })
    })
    .setDescription(`\`\`\`${msg.content}\`\`\``)
    .addFields(
      { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true },
      { name: 'Time', value: timestamp, inline: true }
    )
    .setFooter({
      text: `ID: ${msg.author.id} | Under 18 detected`
    });
  
  const actionRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`ban_${msg.author.id}_${Date.now()}`)
        .setLabel('banna')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ignore_${msg.author.id}_${Date.now()}`)
        .setLabel('ignora')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await logChannel.send({ embeds: [embed], components: [actionRow] });
  console.log('📋 Logged to channel:', LOG_CHANNEL_ID);
}

// ==================== BUTTON INTERACTIONS ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const [action, userId] = interaction.customId.split('_');
  const timestamp = getFormattedTimestamp();
  
  if (!interaction.guild) return;
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    if (action === 'ban') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      
      if (member) {
        await member.ban({ reason: `Minor - by ${interaction.user.tag}` });
        
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFooter({ 
            text: `ID: ${userId} | ${timestamp} • BANNED by @${interaction.user.username}` 
          });
        
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: `✅ Banned` });
        console.log(`🔨 Banned ${userId} by ${interaction.user.tag}`);
      }
    }
    else if (action === 'ignore') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ 
          text: `ID: ${userId} | ${timestamp} • IGNORED by @${interaction.user.username}` 
        });
      
      await interaction.message.edit({ embeds: [embed], components: [] });
      await interaction.editReply({ content: '✅ Ignored' });
      console.log(`👌 Ignored ${userId} by ${interaction.user.tag}`);
    }
  } catch (error) {
    await interaction.editReply({ content: '❌ Error' });
  }
});

// ==================== EXPRESS SERVER ====================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: client.user?.tag || 'Starting...',
    keys: API_KEYS.length,
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Health check: http://localhost:${PORT}`);
});

// ==================== LOGIN ====================
console.log('🔑 Logging in...');
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});
