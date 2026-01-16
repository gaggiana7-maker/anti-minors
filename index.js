const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 Discord AI Bot Starting...');

// ==================== CONFIGURATION ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1461799833890328607';
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

// ==================== DISCORD CLIENT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ==================== GROQ SETUP ====================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || process.env.GROQ_KEY_1
});

// ==================== AI FUNCTIONS ====================
async function analyzeMinorWithAI(text) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{
        role: "system",
        content: `Analyze if user mentions being under 18. Return JSON: {"is_minor": boolean, "age": number or null, "reason": "short"}`
      }, {
        role: "user",
        content: `Message: ${text.substring(0, 300)}`
      }],
      model: "llama3-70b-8192",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('❌ AI error:', error.message);
    return { is_minor: false, age: null, reason: 'AI error' };
  }
}

async function detectIllegalContentWithAI(text) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [{
        role: "system",
        content: `Detect ILLEGAL content. Return JSON: {"is_illegal": boolean, "category": "cp/seller/rape/animal/snuff/invite/none", "confidence": "high/medium/low", "reason": "Italian explanation"}`
      }, {
        role: "user",
        content: `Content: ${text.substring(0, 500)}`
      }],
      model: "llama3-70b-8192",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('❌ Illegal AI error:', error.message);
    return { is_illegal: false, category: 'error', confidence: 'low', reason: 'AI error' };
  }
}

// ==================== QUICK CHECK ====================
function quickCheck(text) {
  const t = text.toLowerCase();
  
  // MINORS
  if (/(?:^|\s)(?:51|61|71)\s*(?:reversed|swap|🔄|🔃)/.test(t)) {
    return { type: 'minor', age: 15, reason: 'swapped number' };
  }
  if (/\bu18\b/.test(t) || /\bunder\s*18\b/.test(t)) {
    return { type: 'minor', age: null, reason: 'u18' };
  }
  
  // ADULTS
  if (/(?:^|\s|,|\.)(1[8-9]|[2-5][0-9])(?:\s|m|f|,|\.|$)/i.test(t)) {
    return { type: 'adult', age: null, reason: 'adult age' };
  }
  
  return null;
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

// ==================== BOT READY ====================
client.once('ready', () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);
  client.user.setActivity('AI moderation ⚠️', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // SPECIAL CHANNEL: PHOTO/VIDEO REQUIRED
    if (isSpecialChannel) {
      if (!checkAttachments(msg.attachments)) {
        await msg.delete();
        return;
      }
    }
    
    // QUICK CHECK
    const quickResult = quickCheck(msg.content);
    if (quickResult?.type === 'minor') {
      await handleMinor(msg, quickResult);
      return;
    }
    
    // CHECK FOR AGE 18+
    if (!/(?:^|\s|,|\.)(1[8-9]|[2-5][0-9])(?:\s|m|f|,|\.|$)/i.test(msg.content)) {
      await msg.delete();
      return;
    }
    
    // ILLEGAL CONTENT CHECK
    const illegalCheck = await detectIllegalContentWithAI(msg.content);
    if (illegalCheck.is_illegal && illegalCheck.confidence === 'high') {
      await handleIllegalContent(msg, illegalCheck);
      return;
    }
    
    // IF QUICK CHECK SAYS CLEAR ADULT → SKIP AI
    if (quickResult?.type === 'adult') {
      return;
    }
    
    // AI MINOR CHECK
    const aiResult = await analyzeMinorWithAI(msg.content);
    if (aiResult.is_minor) {
      await handleMinor(msg, aiResult);
      return;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
});

// ==================== HANDLE MINOR ====================
async function handleMinor(msg, detection) {
  await msg.delete();
  
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

// ==================== HANDLE ILLEGAL CONTENT ====================
async function handleIllegalContent(msg, detection) {
  await msg.delete();
  
  let banned = false;
  try {
    await msg.member.ban({ 
      reason: `ILLEGAL: ${detection.category}`,
      days: 7
    });
    banned = true;
  } catch (error) {}
  
  const logChannel = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel) {
    const timestamp = getFormattedTimestamp();
    
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 ILLEGAL CONTENT - AUTO-BANNED')
      .setDescription(
        `**User:** ${msg.author.username} (${msg.author.id})\n` +
        `**Category:** ${detection.category.toUpperCase()}\n` +
        `**Confidence:** ${detection.confidence}\n` +
        `**Channel:** <#${msg.channel.id}>\n` +
        `**Time:** ${timestamp}\n\n` +
        `**Content:**\n\`\`\`${msg.content}\`\`\`\n\n` +
        `**AI Analysis:** ${detection.reason}`
      )
      .setFooter({ text: `AUTO-BANNED ${banned ? '✅' : '❌'}` })
      .setTimestamp();
    
    if (banned) {
      const actionRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`unban_${msg.author.id}_${Date.now()}`)
            .setLabel('unban')
            .setStyle(ButtonStyle.Success)
        );
      
      await logChannel.send({ embeds: [embed], components: [actionRow] });
    } else {
      await logChannel.send({ embeds: [embed] });
    }
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
        await member.ban({ reason: `Minor - by ${interaction.user.tag}` });
        
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
    else if (action === 'unban') {
      await interaction.guild.members.unban(userId, `Unbanned by ${interaction.user.tag}`);
      
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#00FF00')
        .setFooter({ 
          text: `id: ${userId} | ${timestamp} • UNBANNED by @${interaction.user.username}` 
        });
      
      await interaction.message.edit({ embeds: [embed], components: [] });
      await interaction.editReply({ content: `✅ Unbanned` });
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
