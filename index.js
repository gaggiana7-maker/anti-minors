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
      return answer.includes('YES') ? 'YES' : 'NO';
      
    } catch (error) {
      console.log(`❌ Key ${currentKeyIndex} failed, rotating...`);
      rotateKey();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return 'NO'; // If all keys fail, delete message
}

// ==================== IMPROVED AGE CHECK ====================
async function isUser18Plus(messageText) {
  const prompt = `Message: "${messageText.substring(0, 300)}"
  
  Question: Does this user mention being 18 years old or OLDER?
  
  IMPORTANT: Only answer YES if CLEARLY 18+.
  If unsure, no age, or under 18 → answer NO.
  
  Examples YES: "18top", "23m", "25f", "I'm 20", "age 22"
  Examples NO: "15", "16", "17", "u18", "41 reversed", "hello", "my dick 20cm"
  
  Answer ONLY: YES or NO`;
  
  return await askAI(prompt);
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
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // ========== SPECIAL CHANNEL LOGIC ==========
    if (isSpecialChannel) {
      // 1. Check attachment FIRST
      if (!hasAttachment(msg.attachments)) {
        await msg.delete();
        console.log(`📸 Special channel: Deleted (no attachment)`);
        return;
      }
      
      // 2. THEN check age (IMPORTANT FIX!)
      const result = await isUser18Plus(msg.content);
      console.log(`📸 Special channel: "${msg.content.substring(0, 30)}..." → ${result}`);
      
      if (result === 'NO') {
        await msg.delete();
        await logMinorDetection(msg, 'SPECIAL_CHANNEL');
        return;
      }
      // If YES, message stays
      return;
    }
    
    // ========== REGULAR CHANNELS LOGIC ==========
    const result = await isUser18Plus(msg.content);
    console.log(`💬 Regular channel: "${msg.content.substring(0, 30)}..." → ${result}`);
    
    if (result === 'NO') {
      await msg.delete();
      await logMinorDetection(msg, 'REGULAR_CHANNEL');
    }
    // If YES, message stays
    
  } catch (error) {
    console.error('Error:', error.message);
  }
});

// ==================== CLEAN LOGGING FUNCTION ====================
async function logMinorDetection(msg, channelType) {
  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) {
    console.error('❌ Log channel not found');
    return;
  }
  
  // Only log if message was actually deleted for age reasons
  if (!msg.content || msg.content.trim() === '') {
    console.log('⚠️ Not logging: Empty message');
    return;
  }
  
  // Don't log super short messages (likely spam/random shit)
  if (msg.content.length < 3) {
    console.log('⚠️ Not logging: Message too short');
    return;
  }
  
  console.log(`📋 Logging minor detection from ${channelType}`);
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🚨 Underage Detection')
    .setAuthor({
      name: msg.author.tag,
      iconURL: msg.author.displayAvatarURL({ dynamic: true })
    })
    .setDescription(`**Content:**\n\`\`\`${msg.content.substring(0, 1000)}\`\`\``)
    .addFields(
      { name: 'User ID', value: `\`${msg.author.id}\``, inline: true },
      { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true },
      { name: 'Channel Type', value: channelType, inline: true }
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
