const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 Age Verification Bot Starting...');

// ==================== CONFIGURATION ====================
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

console.log(`🔑 Loaded ${API_KEYS.length} API keys`);
let currentKeyIndex = 0;

function getCurrentKey() { return API_KEYS[currentKeyIndex]; }
function rotateKey() { currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length; }

async function askAI(question) {
  for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
    try {
      const groq = new Groq({ apiKey: getCurrentKey() });
      const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: question }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });
      
      return JSON.parse(response.choices[0].message.content);
      
    } catch (error) {
      console.log(`❌ Key ${currentKeyIndex} failed, trying next...`);
      rotateKey();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return { is_minor: false, confidence: 'low', reason: 'AI failed' };
}

// ==================== SMART AGE CHECK ====================
async function checkAge(messageText) {
  const text = messageText.toLowerCase();
  
  // AUTO-MINOR: Reversed age codes (100% certain)
  if (/(41|51|61|71).*(reversed|swap|🔄|🔃|↩|↪)/.test(text) || 
      /(reversed|swap|🔄|🔃|↩|↪).*(41|51|61|71)/.test(text)) {
    console.log(`🚨 CERTAIN MINOR: Reversed age code`);
    return { is_minor: true, confidence: 'high', reason: 'Reversed age code detected' };
  }
  
  // AUTO-ADULT: "18" anywhere (100% certain adult)
  if (/\b18\b/.test(text) && !/41|51|61|71/.test(text)) {
    console.log(`✅ CERTAIN ADULT: Contains "18"`);
    return { is_minor: false, confidence: 'high', reason: 'Age 18 mentioned' };
  }
  
  // Ask AI for detailed analysis
  const response = await askAI(`{
    "system": "Analyze if this user mentions being under 18. Return JSON: {is_minor: boolean, confidence: 'high/medium/low', reason: 'explanation'}",
    "user": "Message: ${messageText.substring(0, 300)}"
  }`);
  
  return response;
}

// ==================== ATTACHMENT CHECK ====================
function hasAttachment(attachments) {
  if (!attachments || attachments.size === 0) return false;
  return Array.from(attachments.values()).some(att => 
    att.contentType?.startsWith('image/') || 
    att.contentType?.startsWith('video/')
  );
}

// ==================== DISCORD CLIENT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);
  client.user.setActivity('Age Verification', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  // Skip very short messages
  if (!msg.content || msg.content.trim().length < 2) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // ========== SPECIAL CHANNEL ==========
    if (isSpecialChannel) {
      if (!hasAttachment(msg.attachments)) {
        await msg.delete();
        return;
      }
    }
    
    // ========== AGE CHECK ==========
    const ageCheck = await checkAge(msg.content);
    console.log(`🤖 "${msg.content.substring(0, 30)}..." → Minor: ${ageCheck.is_minor}, Confidence: ${ageCheck.confidence}`);
    
    if (ageCheck.is_minor && ageCheck.confidence === 'high') {
      // CERTAIN MINOR → Delete + Log
      await msg.delete();
      await logMinorDetection(msg, ageCheck);
    } else if (!ageCheck.is_minor) {
      // NOT MINOR → Message stays
    } else {
      // Unsure/low confidence → Delete but DON'T log
      await msg.delete();
      console.log('🗑️ Deleted (unsure), not logging');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
});

// ==================== LOGGING - ONLY CERTAIN MINORS ====================
async function logMinorDetection(msg, ageCheck) {
  // ONLY log HIGH confidence minors
  if (ageCheck.confidence !== 'high') {
    console.log('⚠️ Not logging: Low confidence detection');
    return;
  }
  
  // Don't log empty/short messages
  if (!msg.content || msg.content.trim().length < 5) {
    console.log('⚠️ Not logging: Message too short');
    return;
  }
  
  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) {
    console.error('❌ Log channel not found');
    return;
  }
  
  console.log(`📋 LOGGING CERTAIN MINOR: ${ageCheck.reason}`);
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🚨 CERTAIN MINOR DETECTED')
    .setAuthor({
      name: msg.author.tag,
      iconURL: msg.author.displayAvatarURL({ dynamic: true })
    })
    .setDescription(`**Message:**\n\`\`\`${msg.content.substring(0, 800)}\`\`\``)
    .addFields(
      { name: 'Confidence', value: '✅ HIGH', inline: true },
      { name: 'Reason', value: ageCheck.reason || 'Underage detected', inline: true },
      { name: 'User ID', value: `\`${msg.author.id}\``, inline: false },
      { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true }
    )
    .setTimestamp();
  
  const actionRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`ban_${msg.author.id}_${Date.now()}`)
        .setLabel('Ban User')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ignore_${msg.author.id}_${Date.now()}`)
        .setLabel('Ignore')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await logChannel.send({ embeds: [embed], components: [actionRow] });
}

// ==================== BUTTON INTERACTIONS ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const [action, userId] = interaction.customId.split('_');
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    if (action === 'ban') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      
      if (member) {
        await member.ban({ reason: `Certain minor - banned by ${interaction.user.tag}` });
        
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor('#FF0000')
          .setFooter({ text: `✅ Banned by ${interaction.user.tag}` });
        
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: '✅ User has been banned.' });
      }
    }
    else if (action === 'ignore') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#808080')
        .setFooter({ text: `✅ Ignored by ${interaction.user.tag}` });
      
      await interaction.message.edit({ embeds: [embed], components: [] });
      await interaction.editReply({ content: '✅ Report ignored.' });
    }
  } catch (error) {
    await interaction.editReply({ content: '❌ An error occurred.' });
  }
});

// ==================== EXPRESS SERVER ====================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: client.user?.tag || 'Starting...'
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// ==================== LOGIN ====================
console.log('🔑 Logging in to Discord...');
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});
