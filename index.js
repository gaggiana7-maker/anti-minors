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

// ==================== MESSAGE VALIDATION ====================
function validateMessage(text) {
  if (!text || typeof text !== 'string') return { valid: false, reason: 'no_text' };
  
  const lowercase = text.toLowerCase();
  
  // 1. CHECK FOR MINORS FIRST
  // REVERSED/SWAP/🔄 = MINORE CERCA MAGGIORENNE
  if (lowercase.includes('reversed') || lowercase.includes('swap') || 
      lowercase.includes('🔄') || lowercase.includes('🔃') || 
      lowercase.includes('↪️') || lowercase.includes('↩️')) {
    
    const numberMatch = lowercase.match(/\b(\d{1,2})\b/);
    if (numberMatch) {
      const age = parseInt(numberMatch[1]);
      return { valid: false, reason: 'minor', details: `underage (reversed - looking for ${age}+)` };
    }
    return { valid: false, reason: 'minor', details: 'underage (reversed/swap)' };
  }
  
  // NUMERI SCAMBIATI 51=15, 61=16, 71=17
  if (lowercase.includes('51') || lowercase.includes('61') || lowercase.includes('71')) {
    return { valid: false, reason: 'minor', details: 'underage (swapped number 51/61/71)' };
  }
  
  // CHECK FOR DIRECT MINOR AGES 1-17
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
        return { valid: false, reason: 'minor', details: `underage (${age} years)` };
      }
    }
  }
  
  // IGNORA MISURE: "8cm", "7.5"", "18cm"
  const measurementPatterns = [
    /\b\d+(?:\.\d+)?\s*(?:cm|centimeters?|in|inches?|")\b/i,
    /\bmine is\s+\d+/i,
    /\bsize\s+\d+/i,
    /\blength\s+\d+/i,
    /\b\d+(?:\.\d+)?"/i,
  ];
  
  for (const pattern of measurementPatterns) {
    if (pattern.test(lowercase)) {
      // È una misura, continua a controllare per età
    }
  }
  
  // 2. CHECK IF ANY AGE 18+ IS MENTIONED (REQUIRED IN ALL CHANNELS)
  const anyAgePattern = /\b(1[8-9]|[2-9][0-9])\b/;
  const hasAge = anyAgePattern.test(lowercase);
  
  if (!hasAge) {
    return { valid: false, reason: 'no_age', details: 'No age 18+ mentioned' };
  }
  
  // 3. CHECK FOR ADULT AGE WITH MEASUREMENTS CONTEXT
  // Se ha un'età 18+ ma anche misure, va bene
  const adultAgeWithMeasurePattern = /\b(1[8-9]|[2-9][0-9])\b.*\b\d+(?:\.\d+)?\s*(?:cm|in|")\b/i;
  if (adultAgeWithMeasurePattern.test(lowercase)) {
    return { valid: true, reason: 'adult_with_measurements' };
  }
  
  // Se ha solo età 18+ senza contesto strano
  return { valid: true, reason: 'adult' };
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
  
  client.user.setActivity('age verification ⚠️', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // VALIDATE MESSAGE CONTENT
    const validation = validateMessage(msg.content);
    
    if (!validation.valid) {
      await msg.delete();
      
      if (validation.reason === 'minor') {
        console.log(`🚨 Minor: ${msg.author.tag} - ${validation.details}`);
        
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
              text: `id: ${msg.author.id} | reason: underage | ${timestamp}`
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
      } else {
        console.log(`🗑️ No age: ${msg.author.tag} - "${msg.content.substring(0, 50)}..."`);
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
    
    console.log(`✅ Allowed: ${msg.author.tag} - ${validation.reason}`);
    
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
