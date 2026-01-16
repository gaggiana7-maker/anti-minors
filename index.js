const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 Discord Bot with Groq AI Starting...');

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

// ==================== GROQ SETUP ====================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ==================== AI ANALYSIS ====================
async function analyzeWithAI(text) {
  try {
    console.log(`🤖 AI analyzing: "${text.substring(0, 50)}..."`);
    
    const completion = await groq.chat.completions.create({
      messages: [{
        role: "system",
        content: `You are a Discord moderator. Analyze if the user mentions being under 18. Look for: age 1-17, "51 reversed"=15, "61"=16, "71"=17, "reversed/swap/🔄", "u18". Ignore measurements like "8cm", "7 inch". Respond ONLY with JSON: {"is_minor": boolean, "age": number or null, "reason": "short explanation"}`
      }, {
        role: "user",
        content: `Message: ${text.substring(0, 300)}`
      }],
      model: "llama3-70b-8192",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(completion.choices[0].message.content);
    console.log(`🤖 AI result: ${result.is_minor} - ${result.reason}`);
    return result;
    
  } catch (error) {
    console.error('❌ AI error:', error.message);
    return { is_minor: false, age: null, reason: 'error' };
  }
}

// ==================== QUICK CHECK ====================
function quickCheck(text) {
  const t = text.toLowerCase();
  
  // MINORS (clear cases)
  if (/(?:^|\s)(?:51|61|71)\s*(?:reversed|swap|🔄|🔃)/.test(t)) {
    return { is_minor: true, age: 15, reason: 'swapped number' };
  }
  if (/\bu18\b/.test(t) || /\bunder\s*18\b/.test(t)) {
    return { is_minor: true, age: null, reason: 'u18' };
  }
  
  // ADULTS (clear cases - skip AI)
  if (/(?:^|\s|,|\.)(1[8-9]|[2-5][0-9])(?:\s|m|f|,|\.|$)/i.test(t)) {
    return { is_minor: false, age: null, reason: 'adult age' };
  }
  
  return null; // Use AI for uncertain cases
}

// ==================== ATTACHMENT CHECK ====================
function checkAttachments(attachments) {
  if (!attachments || attachments.size === 0) return false;
  return Array.from(attachments.values()).some(att => 
    att.url?.includes('cdn.discordapp.com') || 
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
    GatewayIntentBits.GuildMembers,
  ]
});

// ==================== BOT READY ====================
client.once('ready', () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);
  console.log(`📊 Connected to ${client.guilds.cache.size} server(s)`);
  
  client.user.setActivity('AI moderation ⚠️', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // SPECIAL CHANNEL: MUST HAVE PHOTO/VIDEO
    if (isSpecialChannel) {
      const hasAttachment = checkAttachments(msg.attachments);
      if (!hasAttachment) {
        await msg.delete();
        console.log(`🗑️ Special: No photo/video from ${msg.author.tag}`);
        return;
      }
    }
    
    // QUICK CHECK for obvious cases
    const quickResult = quickCheck(msg.content);
    if (quickResult?.is_minor) {
      await handleMinor(msg, quickResult);
      return;
    }
    
    // CHECK FOR ANY AGE 18+ (required in all channels)
    const hasAdultAge = /(?:^|\s|,|\.)(1[8-9]|[2-5][0-9])(?:\s|m|f|,|\.|$)/i.test(msg.content);
    
    if (!hasAdultAge) {
      await msg.delete();
      console.log(`🗑️ No age: ${msg.author.tag}`);
      return;
    }
    
    // IF QUICK CHECK SAYS CLEAR ADULT → SKIP AI
    if (quickResult?.is_minor === false) {
      console.log(`✅ Allowed (quick): ${msg.author.tag}`);
      return;
    }
    
    // AI CHECK for uncertain cases
    const aiResult = await analyzeWithAI(msg.content);
    
    if (aiResult.is_minor) {
      await handleMinor(msg, aiResult);
      return;
    }
    
    console.log(`✅ Allowed (AI): ${msg.author.tag}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
});

async function handleMinor(msg, detection) {
  await msg.delete();
  console.log(`🚨 Minor: ${msg.author.tag} - ${detection.reason}`);
  
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
        await member.ban({ reason: `Minor detected by AI` });
        
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

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down...');
  await client.destroy();
  process.exit(0);
});

// ==================== LOGIN ====================
console.log('🔑 Logging in...');
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});
