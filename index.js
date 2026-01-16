const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

console.log('🚀 Discord Minor Detection Bot Starting...');

// ==================== CONFIGURATION ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1457870506505011331'; // BAN/LOG CHANNEL
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

// ==================== MINOR DETECTION ====================
function detectMinor(text) {
  if (!text || typeof text !== 'string') return null;
  
  const lowercase = text.toLowerCase();
  
  // PATTERN 1: "REVERSED" OR SWAP EMOJIS (MEANS UNDER 18)
  const reversedPatterns = [
    /\breversed\b/i,
    /🔃|🔄|↩️|↪️|🔄️/, // Swap/Reverse emojis
    /\bswap\b/i,
    /\bother way around\b/i,
    /\bu18\b/i,
    /\bu18\s*🔃/i,
    /\bu18\s*🔄/i,
  ];
  
  for (const pattern of reversedPatterns) {
    if (pattern.test(lowercase)) {
      return { age: 'reversed', reason: 'Reversed/swap detected (under 18)' };
    }
  }
  
  // PATTERN 2: ANY NUMBER 1-17 MENTIONED
  const agePatterns = [
    // Simple numbers 1-17
    /\b(1[0-7]|[1-9])\b/,
    
    // With gender: "17m", "16f", "15 male"
    /\b(1[0-7]|[1-9])\s*(m|f|male|female)\b/i,
    
    // With age indicator: "17yo", "16 years"
    /\b(1[0-7]|[1-9])\s*(yo|y\.o\.|years?|yrs?|y\/o)\b/i,
    
    // Looking for/chatting with age: "looking for 17", "chat 16"
    /\b(?:looking|searching|seeking|want|need|for|find|meet|chat|talk|dm|dms|hmu|cam|wanna)\s+(1[0-7]|[1-9])\b/i,
    
    // Age ranges: "17+", "16+"
    /\b(1[0-7]|[1-9])\s*\+/,
    
    // M61🔄, M71🔃 patterns
    /[mf]\s*(1[0-7]|[1-9])\s*[🔃🔄↩️↪️]/i,
    /(1[0-7]|[1-9])\s*[🔃🔄↩️↪️]/i,
    
    // "51 reversed", "61 🔄" etc
    /\b(\d{1,2})\s*(?:reversed|swap|🔃|🔄|↩️|↪️)\b/i,
    /\b(?:reversed|swap|🔃|🔄|↩️|↪️)\s*(\d{1,2})\b/i,
  ];
  
  for (const pattern of agePatterns) {
    const match = lowercase.match(pattern);
    if (match) {
      // Find the number in match
      for (const group of match) {
        if (group && /^\d+$/.test(group)) {
          const age = parseInt(group);
          if (age >= 1 && age <= 17) {
            return { age: age, reason: `Minor age ${age} detected` };
          }
        }
      }
    }
  }
  
  // PATTERN 3: SPECIFIC MINOR PHRASES
  const minorPhrases = [
    /\bu18 looking/i,
    /\bunder 18/i,
    /\bunderage/i,
    /\bminor\b/i,
    /\bhigh school\b/i,
    /\bhs\b/i,
  ];
  
  for (const phrase of minorPhrases) {
    if (phrase.test(lowercase)) {
      return { age: 'phrase', reason: 'Minor phrase detected' };
    }
  }
  
  return null;
}

// ==================== ATTACHMENT CHECK (FOR SPECIAL CHANNEL ONLY) ====================
function checkAttachments(attachments) {
  if (!attachments || attachments.size === 0) {
    return false;
  }
  
  return Array.from(attachments.values()).some(att => 
    att.url.includes('cdn.discordapp.com') || 
    att.url.includes('media.discordapp.net') ||
    (att.contentType && (
      att.contentType.startsWith('image/') ||
      att.contentType.startsWith('video/')
    ))
  );
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
  console.log(`👁️  Watching for minors in all channels...`);
  
  client.user.setActivity('minor detection ⚠️', { 
    type: 'WATCHING' 
  });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  // Ignore bots and DMs
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // SAME LOGIC FOR BOTH CHANNELS: MINOR DETECTION
    const minorDetection = detectMinor(msg.content);
    
    if (minorDetection !== null) {
      // DELETE MESSAGE (BOTH CHANNELS)
      await msg.delete();
      console.log(`🚨 Minor detected: ${msg.author.tag} - ${minorDetection.reason}`);
      
      // LOG TO BAN CHANNEL ONLY (BOTH CHANNELS)
      const logChannel = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⚠️ Minor Detected')
          .setDescription(
            `**User:** ${msg.author.username} (${msg.author.id})\n` +
            `**Reason:** ${minorDetection.reason}\n` +
            `**Channel:** <#${msg.channel.id}>\n` +
            `**Time:** ${getCurrentTime()}\n\n` +
            `**Message:**\n${msg.content.substring(0, 500)}\n\n` +
            `**Action Required:**`
          )
          .setTimestamp();
        
        const actionRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`ban_${msg.author.id}_${msg.id}`)
              .setLabel('Ban User')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`ignore_${msg.author.id}_${msg.id}`)
              .setLabel('Ignore')
              .setStyle(ButtonStyle.Secondary)
          );
        
        await logChannel.send({ 
          embeds: [embed], 
          components: [actionRow] 
        });
      }
      
      return; // Stop processing
    }
    
    // SPECIAL CHANNEL EXTRA RULE: MUST HAVE PHOTO/VIDEO
    if (isSpecialChannel) {
      const hasValidAttachment = checkAttachments(msg.attachments);
      
      if (!hasValidAttachment) {
        await msg.delete();
        console.log(`🗑️ Special channel: No photo/video from ${msg.author.tag}`);
        // NO DM, just delete
        return;
      }
    }
    
    // If we get here, message is allowed
    console.log(`✅ Allowed: ${msg.author.tag} in ${isSpecialChannel ? 'special' : 'regular'} channel`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
});

// ==================== BUTTON INTERACTIONS ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const [action, userId, messageId] = interaction.customId.split('_');
  const time = getCurrentTime();
  
  if (!interaction.guild) {
    return interaction.reply({ 
      content: '❌ This interaction cannot be processed.',
      ephemeral: true 
    });
  }
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    if (action === 'ban') {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      
      if (member) {
        await member.ban({ 
          reason: `Minor detected - Action by ${interaction.user.tag}` 
        });
        
        // Update log message
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor('#990000')
          .setFooter({ text: `Banned by @${interaction.user.username} • ${time}` });
        
        await interaction.message.edit({ 
          embeds: [embed], 
          components: [] 
        });
        
        await interaction.editReply({ 
          content: `✅ Banned <@${userId}>` 
        });
        
        console.log(`🔨 Banned ${member.user.tag}`);
      }
    }
    else if (action === 'ignore') {
      // Update log message
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#666666')
        .setFooter({ text: `Ignored by @${interaction.user.username} • ${time}` });
      
      await interaction.message.edit({ 
        embeds: [embed], 
        components: [] 
      });
      
      await interaction.editReply({ 
        content: '✅ Case ignored' 
      });
      
      console.log(`✅ Case ignored`);
    }
  } catch (error) {
    await interaction.editReply({ 
      content: '❌ Error processing action' 
    });
  }
});

// ==================== EXPRESS SERVER FOR RENDER ====================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: client.user?.tag || 'Starting...',
    uptime: process.uptime()
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Health check: http://localhost:${PORT}`);
});

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down...');
  await client.destroy();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down...');
  await client.destroy();
  server.close();
  process.exit(0);
});

// ==================== BOT LOGIN ====================
console.log('🔑 Logging in...');
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});
