// ==================== AI LIMIT TRACKER ====================
let aiRequests = 0;
let aiLimitReached = false;
const AI_LIMIT_ALERT_CHANNEL = '1461799833890328607'; // Stesso log channel
const AI_LIMIT_WARNING = 8000; // Avvisa a 8k richieste
const AI_LIMIT_MAX = 10000;    // Limite massimo

// ==================== AI WRAPPER WITH LIMIT CHECK ====================
async function callAIWithLimit(aiFunction, text, type) {
  if (aiLimitReached) {
    console.log(`⚠️ AI limit reached, skipping ${type} check`);
    return type === 'minor' 
      ? { is_minor: false, age: null, reason: 'AI limit reached' }
      : { is_illegal: false, category: 'none', confidence: 'low', reason: 'AI limit reached' };
  }
  
  aiRequests++;
  console.log(`🤖 AI Request #${aiRequests}: ${type}`);
  
  // Check limit
  if (aiRequests >= AI_LIMIT_MAX) {
    aiLimitReached = true;
    await sendAILimitAlert('LIMIT REACHED');
  } else if (aiRequests >= AI_LIMIT_WARNING) {
    await sendAILimitAlert('WARNING');
  }
  
  return await aiFunction(text);
}

// ==================== SEND AI LIMIT ALERT ====================
async function sendAILimitAlert(type) {
  try {
    const client = require('./index.js').client; // O passa client diversamente
    const guild = client.guilds.cache.get(SERVER_ID);
    if (!guild) return;
    
    const alertChannel = guild.channels.cache.get(AI_LIMIT_ALERT_CHANNEL);
    if (!alertChannel) return;
    
    const timestamp = getFormattedTimestamp();
    
    if (type === 'WARNING') {
      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ AI LIMIT WARNING')
        .setDescription(
          `**Groq AI limit approaching!**\n\n` +
          `**Requests used:** ${aiRequests}/${AI_LIMIT_MAX}\n` +
          `**Remaining:** ${AI_LIMIT_MAX - aiRequests} requests\n` +
          `**Time:** ${timestamp}\n\n` +
          `Bot will switch to regex-only mode when limit is reached.\n` +
          `Consider upgrading Groq plan or switching AI provider.`
        )
        .setTimestamp();
      
      await alertChannel.send({ embeds: [embed] });
      console.log(`⚠️ AI limit warning sent: ${aiRequests}/${AI_LIMIT_MAX}`);
    }
    else if (type === 'LIMIT REACHED') {
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🚨 AI LIMIT REACHED')
        .setDescription(
          `**Groq AI FREE tier limit REACHED!**\n\n` +
          `**Total requests:** ${aiRequests}\n` +
          `**Limit:** ${AI_LIMIT_MAX} requests/month\n` +
          `**Time:** ${timestamp}\n\n` +
          `**BOT IS NOW IN REGEX-ONLY MODE**\n` +
          `AI detection disabled. Bot will still detect:\n` +
          `• "51 reversed", "61 🔄", "71 swap"\n` +
          `• "u18", "under 18"\n` +
          `• Ages 1-17 (basic detection)\n\n` +
          `**To restore AI:**\n` +
          `1. Wait for next month reset\n` +
          `2. Upgrade Groq plan\n` +
          `3. Switch to different AI provider`
        )
        .setTimestamp();
      
      await alertChannel.send({ embeds: [embed] });
      console.log(`🚨 AI limit reached alert sent!`);
    }
  } catch (error) {
    console.error('❌ AI alert error:', error.message);
  }
}

// ==================== MODIFIED AI FUNCTIONS WITH LIMIT ====================
async function analyzeMinorWithAI(text) {
  if (aiLimitReached) {
    return { is_minor: false, age: null, reason: 'AI limit reached' };
  }
  
  return await callAIWithLimit(async (text) => {
    // Original AI code here
    try {
      const completion = await groq.chat.completions.create({
        messages: [{
          role: "system",
          content: `Analyze if user mentions being under 18...`
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
      // If API error, maybe limit reached
      if (error.message.includes('quota') || error.message.includes('limit')) {
        aiLimitReached = true;
        await sendAILimitAlert('LIMIT REACHED');
      }
      return { is_minor: false, age: null, reason: 'error' };
    }
  }, text, 'minor');
}

async function detectIllegalContentWithAI(text) {
  if (aiLimitReached) {
    return { is_illegal: false, category: 'none', confidence: 'low', reason: 'AI limit reached' };
  }
  
  return await callAIWithLimit(async (text) => {
    // Original illegal content AI code here
    try {
      const completion = await groq.chat.completions.create({
        messages: [{
          role: "system",
          content: `Detect ILLEGAL content...`
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
      if (error.message.includes('quota') || error.message.includes('limit')) {
        aiLimitReached = true;
        await sendAILimitAlert('LIMIT REACHED');
      }
      return { is_illegal: false, category: 'error', confidence: 'low', reason: 'AI error' };
    }
  }, text, 'illegal');
}

// ==================== ADD TO BOT READY ====================
client.once('ready', () => {
  console.log(`✅ Bot Online: ${client.user.tag}`);
  console.log(`🤖 AI Requests this session: ${aiRequests}`);
  console.log(`📊 AI Limit: ${aiLimitReached ? 'REACHED ⚠️' : 'OK ✅'}`);
  
  client.user.setActivity('AI moderation ⚠️', { type: 'WATCHING' });
  
  // Send startup status
  setTimeout(async () => {
    const guild = client.guilds.cache.get(SERVER_ID);
    if (guild) {
      const alertChannel = guild.channels.cache.get(AI_LIMIT_ALERT_CHANNEL);
      if (alertChannel) {
        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🤖 AI STATUS')
          .setDescription(
            `**Bot started successfully**\n\n` +
            `**AI Provider:** Groq (Llama 3 70B)\n` +
            `**Free Limit:** ${AI_LIMIT_MAX} requests/month\n` +
            `**Used:** ${aiRequests} requests\n` +
            `**Status:** ${aiLimitReached ? 'LIMIT REACHED ⚠️' : 'ACTIVE ✅'}\n\n` +
            `You will be notified when approaching/ reaching limit.`
          )
          .setTimestamp();
        
        await alertChannel.send({ embeds: [embed] });
      }
    }
  }, 5000);
});

// ==================== COMMAND TO CHECK AI STATUS ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  // Command: !ai-status
  if (msg.content === '!ai-status' && msg.member.permissions.has('ADMINISTRATOR')) {
    await msg.delete();
    
    const embed = new EmbedBuilder()
      .setColor(aiLimitReached ? '#FF0000' : (aiRequests >= AI_LIMIT_WARNING ? '#FFA500' : '#00FF00'))
      .setTitle('🤖 AI USAGE STATUS')
      .setDescription(
        `**Provider:** Groq\n` +
        `**Model:** Llama 3 70B\n` +
        `**Free Limit:** ${AI_LIMIT_MAX} requests/month\n` +
        `**Used:** ${aiRequests} requests\n` +
        `**Remaining:** ${AI_LIMIT_MAX - aiRequests} requests\n` +
        `**Status:** ${aiLimitReached ? '❌ LIMIT REACHED' : (aiRequests >= AI_LIMIT_WARNING ? '⚠️ WARNING' : '✅ ACTIVE')}\n\n` +
        `**Detection Modes:**\n` +
        `• AI Active: ${!aiLimitReached ? '✅' : '❌'}\n` +
        `• Regex Basic: ✅ Always\n` +
        `• Quick Check: ✅ Always`
      )
      .setTimestamp();
    
    await msg.channel.send({ embeds: [embed] });
  }
});
