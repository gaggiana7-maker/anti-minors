const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

console.log('🚀 Discord Minor Detection Bot Starting...');

// ==================== CONFIGURATION ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1457870506505011331';
const SPECIAL_CHANNEL_ID = '1447208095217619055';

// ==================== TIME FUNCTIONS ====================
function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
}

function getFormattedTimestamp() {
  return `Today at ${getCurrentTime()}`;
}

// ==================== MINOR DETECTION ====================
function detectMinor(text) {
  if (!text || typeof text !== 'string') return null;
  
  const lowercase = text.toLowerCase();
  
  // 1. REVERSED/SWAP/🔄 = MINORE CERCA MAGGIORENNE
  if (lowercase.includes('reversed') || lowercase.includes('swap') || 
      lowercase.includes('🔄') || lowercase.includes('🔃') || 
      lowercase.includes('↪️') || lowercase.includes('↩️')) {
    
    const numberMatch = lowercase.match(/\b(\d{1,2})\b/);
    if (numberMatch) {
      const age = parseInt(numberMatch[1]);
      return { age: age, reason: 'underage (reversed)' };
    }
    return { age: 'unknown', reason: 'underage (reversed/swap)' };
  }
  
  // 2. NUMERI SCAMBIATI 51=15, 61=16, 71=17
  if (lowercase.includes('51') || lowercase.includes('61') || lowercase.includes('71')) {
    return { age: 'swapped', reason: 'underage (swapped number)' };
  }
  
  // 3. SOLO SE DICHIARA LA SUA ETÀ, NON MISURE!
  // Pattern specifici per ETÀ
  
  // "I'm 17", "I am 16", "age 15"
  const agePatterns = [
    /(?:i'?m|i am|im|age is|aged?)\s+(\d{1,2})\b/i,
    /\b(\d{1,2})\s*(?:yo|y\.o\.|years? old|y\/o|anni?)\b/i,
    /\b(\d{1,2})\s+(?:m|f|male|female)\b/i,
    /^(\d{1,2})\s*(?:m|f)/i,
  ];
  
  for (const pattern of agePatterns) {
    const match = lowercase.match(pattern);
    if (match && match[1]) {
      const age = parseInt(match[1]);
      if (age >= 1 && age <= 17) {
        return { age: age, reason: 'underage' };
      }
    }
  }
  
  // IGNORA MISURE: "8cm", "7.5"", "18cm" - NON SONO ETÀ!
  const measurementPatterns = [
    /\b\d+(?:\.\d+)?\s*(?:cm|centimeters?|in|inches?|")\b/i,
    /\bmine is\s+\d+/i,
    /\bsize\s+\d+/i,
    /\blength\s+\d+/i,
    /\b\d+(?:\.\d+)?"/i,
  ];
  
  for (const pattern of measurementPatterns) {
    if (pattern.test(lowercase)) {
      return null; // È una misura, ignora
    }
  }
  
  return null;
}

// ==================== ATTACHMENT CHECK ====================
function checkAttachments(attachments) {
  if (!attachments || attachments.size === 0) return false;
  
  return Array.from(attachments.values()).some(att => {
    if (att.url && att.url.includes('cdn.discordapp.com')) return true;
    if (att.contentType && (
      att.contentType.startsWith('image/') || 
      att.contentType.startsWith('video/')
    )) return true;
    return false;
  });
}

// ==================== DISCORD CLIENT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ==================== BOT READY ====================
client.once('ready', () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);
  console.log(`📊 Connected to ${client.guilds.cache.size} server(s)`);
  
  client.user.setActivity('minor detection ⚠️', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // CHECK MINORS
    const minorDetection = detectMinor(msg.content);
    
    if (minorDetection !== null) {
      await msg.delete();
      console.log(`🚨 Minor: ${msg.author.tag} - "${minorDetection.reason}"`);
      
      const logChannel = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        const timestamp = getFormattedTimestamp();
        
        const embed = new EmbedBuilder()
          .setColor('#2b2d31')
          .setAuthor({
            name: `${msg.author.username}`,
            iconURL: msg.author.displayAvatarURL({ dynamic: true })
          })
          .setDescription(`\`\`\`${msg.content}\`\`\``)
          .setFooter({
            text: `id: ${msg.author.id} | reason: ${minorDetection.reason} | ${timestamp}`
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
      }
      return;
    }
    
    // SPECIAL CHANNEL: MUST HAVE PHOTO/VIDEO
    if (isSpecialChannel) {
      const hasValidAttachment = checkAttachments(msg.attachments);
      
      if (!hasValidAttachment) {
        await msg.delete();
        console.log(`🗑️ Special: No photo/video from ${msg.author.tag}`);
        return;
      }
    }
    
    console.log(`✅ Allowed: ${msg.author.tag}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
});

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
        await member.ban({ reason: `Minor detected` });
        
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFooter({ 
            text: `id: ${userId} | reason: underage | ${timestamp} • bannato da @${interaction.user.username}` 
          });
        
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: `✅ Banned` });
      }
    }
    else if (action === 'ignore') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ 
          text: `id: ${userId} | reason: underage | ${timestamp} • ignorato da @${interaction.user.username}` 
        });
      
      await interaction.message.edit({ embeds: [embed], components: [] });
      await interaction.editReply({ content: '✅ Ignored' });
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
