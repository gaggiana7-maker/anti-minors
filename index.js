const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');

console.log('🚀 Discord Age Verification Bot Starting...');

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
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) + ' at ' + getCurrentTime();
}

// ==================== MESSAGE VALIDATION ====================
function validateMessage(text, channelType) {
  if (!text || typeof text !== 'string') {
    return {
      action: 'delete',
      reason: 'No text content',
      age: null
    };
  }
  
  const lowercase = text.toLowerCase().trim();
  
  // CHECK 1: ANY AGE MENTIONED AT ALL? (1-99)
  // Look for ANY number 1-99 in the text
  const ageMatch = lowercase.match(/\b([1-9]|[1-9][0-9])\b/);
  
  if (!ageMatch) {
    // NO AGE MENTIONED AT ALL → DELETE IN BOTH CHANNELS
    return {
      action: 'delete_no_age',
      reason: 'No age mentioned',
      age: null
    };
  }
  
  const age = parseInt(ageMatch[1]);
  
  // CHECK 2: IS IT A MINOR? (1-17)
  if (age >= 1 && age <= 17) {
    return {
      action: 'delete_minor',
      reason: `Minor detected (${age} years)`,
      age: age
    };
  }
  
  // CHECK 3: IS IT ADULT? (18-99)
  if (age >= 18 && age <= 99) {
    if (channelType === 'special') {
      return {
        action: 'check_attachments',
        reason: 'Adult age, check attachments for special channel',
        age: age
      };
    }
    return {
      action: 'allow',
      reason: 'Adult age mentioned',
      age: age
    };
  }
  
  // Fallback
  return {
    action: 'delete',
    reason: 'Invalid age format',
    age: null
  };
}

// ==================== ATTACHMENT CHECK ====================
function checkAttachments(attachments) {
  if (!attachments || attachments.size === 0) {
    return {
      valid: false,
      reason: 'No attachments'
    };
  }
  
  const valid = Array.from(attachments.values()).some(att => {
    // Accept any Discord attachment
    return att.url && (
      att.url.includes('cdn.discordapp.com') || 
      att.url.includes('media.discordapp.net') ||
      (att.contentType && (
        att.contentType.startsWith('image/') ||
        att.contentType.startsWith('video/')
      ))
    );
  });
  
  return {
    valid: valid,
    reason: valid ? 'Has valid attachment' : 'No valid attachments'
  };
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
  console.log(`👁️  Watching for age verification...`);
  
  // Set bot status
  client.user.setActivity('age verification ⚠️', { 
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
    const validation = validateMessage(msg.content, isSpecialChannel ? 'special' : 'regular');
    
    // Handle validation results
    switch (validation.action) {
      case 'delete_no_age':
        // NO AGE MENTIONED → DELETE IN BOTH CHANNELS
        await msg.delete();
        console.log(`🗑️ No age mentioned from ${msg.author.tag}: "${msg.content.substring(0, 50)}..."`);
        
        // Send DM explanation
        try {
          await msg.author.send({
            content: `## ⚠️ Message Deleted\n\n` +
                    `**Channel:** <#${msg.channel.id}>\n` +
                    `**Reason:** No age mentioned\n\n` +
                    `**Rule:** All messages must include your age (18+ only).\n` +
                    `**Examples:** "18", "25", "I'm 21", "22 looking", "19 m"\n\n` +
                    `Messages without age like "dms open" or "anyone?" are not allowed.`
          });
        } catch (dmError) {
          // Can't DM, that's fine
        }
        break;
        
      case 'delete_minor':
        // MINOR DETECTED → DELETE + LOG
        await msg.delete();
        console.log(`🚨 Minor (${validation.age}y) from ${msg.author.tag}`);
        
        // Log to moderation channel
        const logChannel = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ Minor Detected')
            .setDescription(
              `**User:** ${msg.author.username} (${msg.author.id})\n` +
              `**Age:** ${validation.age} years\n` +
              `**Channel:** <#${msg.channel.id}>\n` +
              `**Time:** ${getCurrentTime()}\n\n` +
              `**Message Content:**\n${msg.content.substring(0, 500)}`
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
          
          await logChannel.send({ embeds: [embed], components: [actionRow] });
        }
        break;
        
      case 'check_attachments':
        // SPECIAL CHANNEL: Has adult age, check attachments
        if (!isSpecialChannel) break;
        
        const attachmentCheck = checkAttachments(msg.attachments);
        
        if (!attachmentCheck.valid) {
          await msg.delete();
          console.log(`🗑️ Special channel: No attachment from ${msg.author.tag} (age: ${validation.age})`);
          
          try {
            await msg.author.send({
              content: `## ⚠️ Special Channel Message Deleted\n\n` +
                      `**Channel:** <#${SPECIAL_CHANNEL_ID}>\n` +
                      `**Your Age:** ${validation.age} ✓\n` +
                      `**Missing:** Photo/video attachment ✗\n\n` +
                      `**Requirements:**\n` +
                      `1. Age 18+ ✓\n` +
                      `2. Photo/video attachment ✗\n\n` +
                      `Please add at least one image or video and repost.`
            });
          } catch (dmError) {
            // Can't DM, that's fine
          }
        } else {
          console.log(`✅ Special: Valid post from ${msg.author.tag} (${validation.age}y)`);
        }
        break;
        
      case 'allow':
        // Message is allowed (has adult age)
        console.log(`✅ Allowed: ${msg.author.tag} (${validation.age}y) in ${isSpecialChannel ? 'special' : 'regular'} channel`);
        break;
    }
    
  } catch (error) {
    console.error('❌ Error in message handler:', error.message);
  }
});

// ==================== BUTTON INTERACTIONS ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const [action, userId, messageId] = interaction.customId.split('_');
  const time = getCurrentTime();
  const timestamp = getFormattedTimestamp();
  
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
        
        // Update the log message
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor('#990000')
          .setFooter({ text: `Banned by @${interaction.user.username} • ${timestamp}` });
        
        await interaction.message.edit({ 
          embeds: [embed], 
          components: [] 
        });
        
        await interaction.editReply({ 
          content: `✅ Successfully banned <@${userId}>` 
        });
        
        console.log(`🔨 Banned ${member.user.tag} (by ${interaction.user.tag})`);
      } else {
        await interaction.editReply({ 
          content: '❌ User not found in this server.' 
        });
      }
    }
    else if (action === 'ignore') {
      // Update the log message
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#666666')
        .setFooter({ text: `Ignored by @${interaction.user.username} • ${timestamp}` });
      
      await interaction.message.edit({ 
        embeds: [embed], 
        components: [] 
      });
      
      await interaction.editReply({ 
        content: '✅ Case ignored and closed.' 
      });
      
      console.log(`✅ Case ignored by ${interaction.user.tag}`);
    }
  } catch (error) {
    console.error('❌ Button interaction error:', error.message);
    await interaction.editReply({ 
      content: '❌ An error occurred while processing this action.' 
    });
  }
});

// ==================== EXPRESS SERVER FOR RENDER ====================
const app = express();
const PORT = process.env.PORT || 10000;

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    bot: client.user?.tag || 'Starting...',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  const status = {
    bot: {
      ready: client.isReady(),
      tag: client.user?.tag || 'Not ready',
      id: client.user?.id || 'N/A',
      uptime: client.uptime || 0
    },
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      node: process.version
    },
    server: {
      guilds: client.guilds?.cache?.size || 0,
      channels: client.channels?.cache?.size || 0,
      users: client.users?.cache?.size || 0
    }
  };
  
  res.json(status);
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
  console.log(`🔗 Health check URL: http://localhost:${PORT}`);
  console.log(`📊 Status endpoint: http://localhost:${PORT}/status`);
});

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received. Shutting down gracefully...');
  
  try {
    await client.destroy();
    server.close(() => {
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received. Shutting down gracefully...');
  
  try {
    await client.destroy();
    server.close(() => {
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// ==================== ERROR HANDLING ====================
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

// ==================== BOT LOGIN ====================
console.log('🔑 Attempting to login to Discord...');
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  console.error('⚠️ Please check your BOT_TOKEN environment variable');
  process.exit(1);
});
