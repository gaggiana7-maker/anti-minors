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
        max_tokens: 10
      });
      
      const answer = response.choices[0].message.content.trim().toUpperCase();
      return answer;
      
    } catch (error) {
      console.log(`❌ Key ${currentKeyIndex} failed, trying next...`);
      rotateKey();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return 'NO';
}

// ==================== SMART AGE CHECK ====================
async function isUser18Plus(messageText) {
  const text = messageText.toLowerCase();
  
  // AUTO-YES: Any "18" that's NOT part of reversed code
  if (/\b18\b/.test(text) && !/41|51|61|71/.test(text)) {
    console.log(`✅ AUTO-APPROVED: Contains "18"`);
    return 'YES';
  }
  
  // AUTO-NO: Reversed age codes
  if (/(41|51|61|71).*(reversed|swap|🔄|🔃|↩|↪)/.test(text) || 
      /(reversed|swap|🔄|🔃|↩|↪).*(41|51|61|71)/.test(text)) {
    console.log(`🚨 AUTO-REJECTED: Reversed age code`);
    return 'NO';
  }
  
  // Ask AI for everything else
  const prompt = `Message: "${messageText.substring(0, 300)}"
  
  Question: Does the user mention being 18 years old or OLDER?
  
  Examples YES: "19m", "20f", "23", "25yo", "I'm 30", "22 years old"
  Examples NO: "15", "16", "17", "u18", "under 18", "hello"
  
  Answer ONLY: YES or NO`;
  
  const response = await askAI(prompt);
  return response.includes('YES') ? 'YES' : 'NO';
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
  
  // Skip empty messages
  if (!msg.content || msg.content.trim().length < 2) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // ========== SPECIAL CHANNEL ==========
    if (isSpecialChannel) {
      if (!hasAttachment(msg.attachments)) {
        await msg.delete();
        return;
      }
      
      const result = await isUser18Plus(msg.content);
      console.log(`📸 Media: "${msg.content.substring(0, 30)}..." → ${result}`);
      
      if (result === 'NO') {
        await msg.delete();
        await logMinorDetection(msg);
      }
      return;
    }
    
    // ========== REGULAR CHANNELS ==========
    const result = await isUser18Plus(msg.content);
    console.log(`💬 Regular: "${msg.content.substring(0, 30)}..." → ${result}`);
    
    if (result === 'NO') {
      await msg.delete();
      await logMinorDetection(msg);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
});

// ==================== CLEAN LOGGING - ONLY REAL MINORS ====================
async function logMinorDetection(msg) {
  // DON'T LOG: Empty or very short messages
  if (!msg.content || msg.content.trim().length < 5) {
    console.log('⚠️ Not logging: Message too short');
    return;
  }
  
  // DON'T LOG: Messages that obviously have adult ages
  const text = msg.content.toLowerCase();
  if (/\b(?:19|20|21|22|23|24|25|26|27|28|29|3[0-9]|[4-5][0-9])\s*(?:m|f|yo|y\.o|years)\b/.test(text)) {
    console.log('⚠️ Not logging: Contains clear adult age');
    return;
  }
  
  // DON'T LOG: Just URLs/emojis
  if (/^(?:http|www|:\/\/|[\p{Emoji}]|\s)+$/iu.test(msg.content.trim())) {
    console.log('⚠️ Not logging: Just URLs/emojis');
    return;
  }
  
  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) {
    console.error('❌ Log channel not found');
    return;
  }
  
  console.log(`📋 Logging actual minor detection`);
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🚨 Underage Detection')
    .setAuthor({
      name: msg.author.tag,
      iconURL: msg.author.displayAvatarURL({ dynamic: true })
    })
    .setDescription(`**Message:**\n\`\`\`${msg.content.substring(0, 800)}\`\`\``)
    .addFields(
      { name: 'User ID', value: `\`${msg.author.id}\``, inline: true },
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
        await member.ban({ reason: `Underage - banned by ${interaction.user.tag}` });
        
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
