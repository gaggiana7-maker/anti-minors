const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 Discord AI Bot Starting...');

// ==================== CONFIGURATION ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1461799833890328607';
const SPECIAL_CHANNEL_ID = '1447208095217619055';

// ==================== GROQ API KEY ROTATION SYSTEM ====================
class GroqKeyManager {
  constructor() {
    // 5 keys totali: 1 attuale + 4 nuove
    this.keys = [
      process.env.GROQ_KEY_1,  // Key attualmente in uso
      process.env.GROQ_KEY_2,  // Nuova key 1
      process.env.GROQ_KEY_3,  // Nuova key 2
      process.env.GROQ_KEY_4,  // Nuova key 3
      process.env.GROQ_KEY_5   // Nuova key 4
    ].filter(key => key && key.trim() !== '');
    
    console.log(`🔑 Loaded ${this.keys.length} API keys`);
    
    this.currentIndex = 0;
    this.failures = {};
    this.cooldowns = {};
    this.requestsCount = {};
    this.maxFailures = 3;
    this.cooldownTime = 5 * 60 * 1000; // 5 minuti
    
    // Inizializza contatori
    this.keys.forEach((_, i) => {
      this.requestsCount[i] = 0;
    });
    
    // Log delle keys (primi e ultimi caratteri per sicurezza)
    this.keys.forEach((key, i) => {
      const masked = key ? `${key.substring(0, 10)}...${key.substring(key.length - 5)}` : 'MISSING';
      console.log(`  Key ${i}: ${masked}`);
    });
  }
  
  getCurrentKey() {
    return this.keys[this.currentIndex];
  }
  
  rotateKey() {
    const oldIndex = this.currentIndex;
    let attempts = 0;
    
    // Prova tutte le keys fino a trovarne una disponibile
    while (attempts < this.keys.length) {
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      attempts++;
      
      if (this.isKeyAvailable(this.currentIndex)) {
        console.log(`🔄 Rotated: ${oldIndex} → ${this.currentIndex}`);
        return this.getCurrentKey();
      }
    }
    
    // Se nessuna disponibile, resetta failures e usa la prossima
    console.log('🔄 No available keys, resetting failures...');
    this.failures = {};
    this.cooldowns = {};
    this.currentIndex = (oldIndex + 1) % this.keys.length;
    
    return this.getCurrentKey();
  }
  
  markFailure(keyIndex) {
    const key = this.keys[keyIndex];
    if (!key) return;
    
    if (!this.failures[key]) {
      this.failures[key] = 0;
    }
    
    this.failures[key]++;
    this.cooldowns[key] = Date.now();
    
    console.log(`❌ Key ${keyIndex} failure ${this.failures[key]}/${this.maxFailures}`);
    
    if (this.failures[key] >= this.maxFailures) {
      console.log(`⏸️ Key ${keyIndex} in cooldown for 5 minutes`);
      setTimeout(() => {
        delete this.failures[key];
        delete this.cooldowns[key];
        console.log(`✅ Key ${keyIndex} cooldown finished`);
      }, this.cooldownTime);
    }
  }
  
  markSuccess(keyIndex) {
    this.requestsCount[keyIndex] = (this.requestsCount[keyIndex] || 0) + 1;
    
    const key = this.keys[keyIndex];
    if (key && this.failures[key]) {
      delete this.failures[key];
      delete this.cooldowns[key];
    }
  }
  
  isKeyAvailable(keyIndex) {
    const key = this.keys[keyIndex];
    if (!key) return false;
    
    // Check cooldown
    if (this.cooldowns[key]) {
      const timeSinceFailure = Date.now() - this.cooldowns[key];
      return timeSinceFailure > this.cooldownTime;
    }
    
    // Check failure count
    return !this.failures[key] || this.failures[key] < this.maxFailures;
  }
  
  getKeyStatus(keyIndex) {
    const key = this.keys[keyIndex];
    if (!key) return 'MISSING';
    
    const isCurrent = keyIndex === this.currentIndex;
    const failures = this.failures[key] || 0;
    const requests = this.requestsCount[keyIndex] || 0;
    const available = this.isKeyAvailable(keyIndex);
    
    return {
      index: keyIndex,
      isCurrent,
      available,
      failures,
      requests,
      shortKey: `${key.substring(0, 8)}...${key.substring(key.length - 4)}`
    };
  }
  
  getAllStatus() {
    return this.keys.map((_, i) => this.getKeyStatus(i));
  }
  
  async withRetry(apiCall) {
    const maxRetries = this.keys.length * 2;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const keyIndex = this.currentIndex;
      const key = this.getCurrentKey();
      
      if (!key) {
        console.log(`❌ Key ${keyIndex} is empty, rotating...`);
        this.rotateKey();
        continue;
      }
      
      if (!this.isKeyAvailable(keyIndex)) {
        console.log(`⏭️ Key ${keyIndex} not available, rotating...`);
        this.rotateKey();
        continue;
      }
      
      try {
        console.log(`🔑 Using key ${keyIndex} (attempt ${attempt + 1}/${maxRetries})`);
        
        const groq = new Groq({ apiKey: key });
        const result = await apiCall(groq);
        
        this.markSuccess(keyIndex);
        return result;
        
      } catch (error) {
        console.error(`❌ Key ${keyIndex} failed:`, error.message);
        this.markFailure(keyIndex);
        
        // Rotate to next key
        this.rotateKey();
        
        // Wait before next attempt
        await new Promise(resolve => 
          setTimeout(resolve, Math.min(1000 * Math.pow(1.5, attempt), 3000))
        );
      }
    }
    
    throw new Error(`All ${this.keys.length} API keys exhausted`);
  }
}

// Initialize key manager
const keyManager = new GroqKeyManager();

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

// ==================== AI FUNCTIONS ====================
async function analyzeMinorWithAI(text) {
  return keyManager.withRetry(async (groq) => {
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
      max_tokens: 100,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(completion.choices[0].message.content);
  });
}

async function detectIllegalContentWithAI(text) {
  return keyManager.withRetry(async (groq) => {
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
      max_tokens: 150,
      response_format: { type: "json_object" }
    });
    
    return JSON.parse(completion.choices[0].message.content);
  });
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
  
  const status = keyManager.getAllStatus();
  console.log(`🔑 API Keys Status:`);
  status.forEach(s => {
    console.log(`  ${s.isCurrent ? '▶️' : '  '} Key ${s.index}: ${s.available ? '✅' : '❌'} (req: ${s.requests}, fails: ${s.failures})`);
  });
  
  client.user.setActivity(`${keyManager.keys.length} keys 🔄`, { type: 'WATCHING' });
  
  // Log status ogni 10 minuti
  setInterval(() => {
    console.log('📊 Key Status Update:');
    const status = keyManager.getAllStatus();
    status.forEach(s => {
      console.log(`  Key ${s.index}: ${s.available ? '🟢' : '🔴'} ${s.isCurrent ? '[ACTIVE]' : ''} Req:${s.requests} Fail:${s.failures}`);
    });
  }, 10 * 60 * 1000);
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
    try {
      const illegalCheck = await detectIllegalContentWithAI(msg.content);
      if (illegalCheck.is_illegal && illegalCheck.confidence === 'high') {
        await handleIllegalContent(msg, illegalCheck);
        return;
      }
    } catch (error) {
      console.error('❌ Illegal check failed:', error.message);
    }
    
    // IF QUICK CHECK SAYS CLEAR ADULT → SKIP AI
    if (quickResult?.type === 'adult') {
      return;
    }
    
    // AI MINOR CHECK
    try {
      const aiResult = await analyzeMinorWithAI(msg.content);
      if (aiResult.is_minor) {
        await handleMinor(msg, aiResult);
        return;
      }
    } catch (error) {
      console.error('❌ AI minor check failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error in message handler:', error.message);
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
      .addFields(
        { name: 'Age Detected', value: detection.age ? `${detection.age}` : 'Unknown', inline: true },
        { name: 'Detection Method', value: detection.reason || 'AI', inline: true }
      )
      .setFooter({
        text: `id: ${msg.author.id} | underage | ${timestamp}`
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
        `**Content:**\n\`\`\`${msg.content.substring(0, 1000)}\`\`\`\n\n` +
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
  const status = keyManager.getAllStatus();
  
  res.json({ 
    status: 'online',
    bot: client.user?.tag || 'Starting...',
    keys: {
      total: keyManager.keys.length,
      active_index: keyManager.currentIndex,
      details: status
    },
    total_requests: Object.values(keyManager.requestsCount).reduce((a, b) => a + b, 0),
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
