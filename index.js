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

async function askAI(prompt) {
  for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
    try {
      const groq = new Groq({ apiKey: getCurrentKey() });
      const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });
      
      return JSON.parse(response.choices[0].message.content);
      
    } catch (error) {
      console.log(`❌ Key ${currentKeyIndex} failed`);
      rotateKey();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return { should_delete: true, is_minor: false, confidence: 'low', reason: 'AI failed' };
}

// ==================== REVERSED CODE DETECTION ====================
function isReversedAgeCode(text) {
  const lower = text.toLowerCase();
  
  const patterns = [
    /(41|51|61|71).*(reversed|swap|🔄|🔃|↩|↪|inverted|flipped)/i,
    /(reversed|swap|🔄|🔃|↩|↪|inverted|flipped).*(41|51|61|71)/i,
    /\((?:reversed|swap).*age\)/i,
    /reversed.*age/i,
    /swap.*age/i
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(lower)) {
      const match = lower.match(/(41|51|61|71)/);
      if (match) {
        const code = match[1];
        const realAge = { '41': 14, '51': 15, '61': 16, '71': 17 }[code];
        return {
          detected: true,
          code: code,
          realAge: realAge,
          reason: `Reversed code ${code} = ${realAge} years old`
        };
      }
    }
  }
  
  return { detected: false };
}

// ==================== QUICK CHECK FOR DATING MESSAGES ====================
function isDatingMessage(text) {
  const lower = text.toLowerCase();
  const datingPhrases = [
    'dms open', 'dm me', 'dm open', 'looking for', 'searching for', 
    'want', 'need', 'hmu', 'hit me up', 'message me', 'anyone', 
    'someone', 'buds', 'buddies', 'friends', 'fun', 'play', 
    'jerk', 'sext', 'sex', 'nsfw', 'kinky', 'horny', 'bottom',
    'top', 'vers', 'sub', 'dom', 'daddy', 'boy', 'girl'
  ];
  
  return datingPhrases.some(phrase => lower.includes(phrase));
}

// ==================== AGE CHECK ====================
async function checkMessage(messageText) {
  // 1. CHECK FOR REVERSED CODES
  const reversedCheck = isReversedAgeCode(messageText);
  if (reversedCheck.detected) {
    console.log(`🚨 REVERSED CODE: ${reversedCheck.reason}`);
    return { should_delete: true, is_minor: true, confidence: 'high', reason: reversedCheck.reason };
  }
  
  // 2. CHECK FOR "18" (AUTO APPROVE)
  if (/\b18\b/i.test(messageText)) {
    console.log(`✅ AUTO-APPROVE: Contains "18"`);
    return { should_delete: false, is_minor: false, confidence: 'high', reason: 'Age 18 mentioned' };
  }
  
  // 3. CHECK FOR CLEAR ADULT AGES (19-59)
  if (/\b(?:19|2[0-9]|[3-5][0-9])\s*(?:m|f|yo|y\.o|years|anni)\b/i.test(messageText)) {
    console.log(`✅ CLEAR ADULT: Adult age mentioned`);
    return { should_delete: false, is_minor: false, confidence: 'high', reason: 'Clear adult age' };
  }
  
  // 4. ASK AI FOR EVERYTHING ELSE
  const prompt = `Message: "${messageText}"
  
  Analyze this Discord message in a dating/NSFW server.
  
  Questions:
  1. Should this message be deleted? (YES if: under 18, no age mentioned in dating context)
  2. If deleted, is it because user is a minor? (YES if: age < 18 mentioned)
  
  Rules:
  - Dating messages MUST include age (18+)
  - "DMs open", "looking for" without age = DELETE
  - "23m", "25f" with age = KEEP
  - "15", "16" = DELETE + MINOR
  - "hello", general chat = KEEP (if not dating)
  
  Return JSON: {
    should_delete: boolean,
    is_minor: boolean (true if age < 18),
    confidence: 'high/medium/low',
    reason: 'explanation'
  }`;
  
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
  client.user.setActivity('Age Check', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  if (!msg.content || msg.content.trim().length < 2) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // SPECIAL CHANNEL: Needs attachment
    if (isSpecialChannel && !hasAttachment(msg.attachments)) {
      await msg.delete();
      return;
    }
    
    // CHECK MESSAGE
    const check = await checkMessage(msg.content);
    console.log(`🤖 "${msg.content.substring(0, 40)}..." → Delete: ${check.should_delete}, Minor: ${check.is_minor}`);
    
    if (check.should_delete) {
      await msg.delete();
      
      // ONLY LOG IF CERTAIN MINOR
      if (check.is_minor && check.confidence === 'high') {
        await logMinorDetection(msg, check);
      } else {
        console.log('🗑️ Deleted (not logged)');
      }
    }
    // If should_delete = false, message stays
    
  } catch (error) {
    console.error('Error:', error.message);
  }
});

// ==================== LOGGING ====================
async function logMinorDetection(msg, check) {
  if (!check.is_minor || check.confidence !== 'high') return;
  if (!msg.content || msg.content.trim().length < 5) return;
  
  const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return;
  
  console.log(`📋 LOGGING MINOR: ${check.reason}`);
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🚨 MINOR DETECTED')
    .setAuthor({
      name: msg.author.tag,
      iconURL: msg.author.displayAvatarURL({ dynamic: true })
    })
    .setDescription(`**Message:**\n\`\`\`${msg.content.substring(0, 1000)}\`\`\``)
    .addFields(
      { name: 'Reason', value: check.reason, inline: false },
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
        await member.ban({ reason: `Minor - banned by ${interaction.user.tag}` });
        
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFooter({ text: `Banned by ${interaction.user.tag}` });
        
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: '✅ Banned' });
      }
    }
    else if (action === 'ignore') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ text: `Ignored by ${interaction.user.tag}` });
      
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
    bot: client.user?.tag || 'Starting...'
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Server on port ${PORT}`);
});

// ==================== LOGIN ====================
console.log('🔑 Logging in...');
client.login(process.env.BOT_TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
  process.exit(1);
});
