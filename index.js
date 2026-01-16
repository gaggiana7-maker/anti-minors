const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 FINAL Age Check Bot Starting...');

// ==================== CONFIGURATION ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1461799833890328607';
const SPECIAL_CHANNEL_ID = '1447208095217619055';

// ==================== 5 API KEYS ROTATION ====================
const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5
].filter(key => key && key.trim() !== '');

console.log(`🔑 Loaded ${API_KEYS.length} API keys`);
if (API_KEYS.length === 0) {
  console.error('❌ ERROR: No API keys found! Check environment variables.');
}

let currentKeyIndex = 0;
const keyStats = {};

function getCurrentKey() { 
  return API_KEYS[currentKeyIndex]; 
}

function rotateKey() {
  const oldIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.log(`🔄 Rotated: Key ${oldIndex} → Key ${currentKeyIndex}`);
  return getCurrentKey();
}

async function callAIWithRetry(prompt, functionName = "AI Call") {
  for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
    const keyIndex = currentKeyIndex;
    const key = getCurrentKey();
    
    console.log(`🔑 [${functionName}] Attempt ${attempt + 1} with Key ${keyIndex}`);
    
    try {
      // Track usage
      if (!keyStats[keyIndex]) keyStats[keyIndex] = { requests: 0, successes: 0, failures: 0 };
      keyStats[keyIndex].requests++;
      
      const groq = new Groq({ apiKey: key });
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 150
      });
      
      keyStats[keyIndex].successes++;
      const response = completion.choices[0].message.content.trim();
      console.log(`✅ Key ${keyIndex} success: ${response.substring(0, 50)}...`);
      
      return response;
      
    } catch (error) {
      const errorMsg = error.message || String(error);
      console.error(`❌ Key ${keyIndex} failed:`, errorMsg.substring(0, 100));
      
      if (keyStats[keyIndex]) keyStats[keyIndex].failures++;
      
      // Rotate to next key
      rotateKey();
      
      // Small delay before retry
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  throw new Error(`All ${API_KEYS.length} keys failed`);
}

// ==================== SMART AGE DETECTION ====================
async function isUser18OrOlder(messageText) {
  const prompt = `Analyze this Discord message carefully: "${messageText}"
  
  YOUR TASK: Determine if the user mentions or implies they are 18 years old or OLDER.
  
  THINK STEP BY STEP:
  1. Look for ALL numbers in the message
  2. For each number, ask: Could this represent someone's AGE?
  3. Consider CONTEXT clues:
     - Numbers with: top/bottom/vers/m/f/male/female → LIKELY AGE
     - Numbers with: yo/years/anni/old → LIKELY AGE
     - "I'm X", "I am X", "age X", "età X" → LIKELY AGE
     - Dating/NSFW context + number → LIKELY AGE
  
  4. Context clues for NOT AGE:
     - Numbers with: cm/inch/eur/$/€ → NOT AGE (size/money)
     - Quantities: "give me X", "I want X" → NOT AGE
     - Measurements, prices, counts → NOT AGE
  
  CRITICAL RULE: When unsure, assume number 18+ IS AGE (safer to allow than delete wrong).
  
  Examples:
  • "18top looking" → YES (clearly age)
  • "M23 bottom" → YES (clearly age)
  • "f25 dom" → YES (clearly age)
  • "I'm 20" → YES (clearly age)
  • "19, versatile" → YES (clearly age)
  • "41 reversed" → NO (means 14)
  • "15 looking" → NO (under 18)
  • "my dick is 20cm" → NO (size, not age)
  • "I want 50€" → NO (money, not age)
  • "hello" → NO (no age)
  
  Final decision for the message above: Answer ONLY with "YES" or "NO"`;
  
  try {
    const response = await callAIWithRetry(prompt, "Age Check");
    const answer = response.trim().toUpperCase();
    
    // Parse response
    if (answer.includes('YES') || answer === 'Y') return 'YES';
    if (answer.includes('NO') || answer === 'N') return 'NO';
    
    // If AI gives unclear answer, default to YES (prevent false deletions)
    console.log(`⚠️ AI unclear response: "${response}", defaulting to YES`);
    return 'YES';
    
  } catch (error) {
    console.error('❌ Age check failed:', error.message);
    return 'YES'; // Default to YES on error (safer)
  }
}

// ==================== ILLEGAL CONTENT CHECK (Optional) ====================
async function checkIllegalContent(text) {
  try {
    const prompt = `Check for illegal content: "${text.substring(0, 300)}"
    Return ONLY: "SAFE" or "ILLEGAL"`;
    
    const response = await callAIWithRetry(prompt, "Illegal Check");
    return response.trim().toUpperCase();
  } catch (error) {
    console.log('⚠️ Illegal check skipped');
    return 'SAFE';
  }
}

// ==================== ATTACHMENT CHECK ====================
function hasAttachment(attachments) {
  if (!attachments || attachments.size === 0) return false;
  return Array.from(attachments.values()).some(att => 
    att.contentType?.startsWith('image/') || 
    att.contentType?.startsWith('video/')
  );
}

// ==================== TIME FUNCTIONS ====================
function getFormattedTimestamp() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
  return `Today at ${time}`;
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
  console.log(`🔑 Using ${API_KEYS.length} API keys (Current: Key ${currentKeyIndex})`);
  
  // Log key statistics
  Object.keys(keyStats).forEach(index => {
    const stats = keyStats[index];
    console.log(`  Key ${index}: Requests ${stats.requests}, ✓ ${stats.successes}, ✗ ${stats.failures}`);
  });
  
  client.user.setActivity('Age 18+ Check 🔞', { type: 'WATCHING' });
});

// ==================== MESSAGE HANDLER ====================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild || msg.guild.id !== SERVER_ID) return;
  
  try {
    const isSpecialChannel = msg.channel.id === SPECIAL_CHANNEL_ID;
    
    // 1. SPECIAL CHANNEL: Photo/Video required
    if (isSpecialChannel) {
      if (!hasAttachment(msg.attachments)) {
        await msg.delete();
        console.log('🗑️ Deleted: No attachment in special channel');
        return;
      }
    }
    
    // 2. OPTIONAL: Check for illegal content
    const illegalCheck = await checkIllegalContent(msg.content);
    if (illegalCheck === 'ILLEGAL') {
      console.log('🚨 Illegal content detected, deleting...');
      await handleIllegalContent(msg);
      return;
    }
    
    // 3. MAIN CHECK: Is user 18+?
    const ageResult = await isUser18OrOlder(msg.content);
    console.log(`🤖 "${msg.content.substring(0, 50)}..." → ${ageResult}`);
    
    if (ageResult === 'YES') {
      // User is 18+ → Message stays
      console.log('✅ Kept: User is 18+');
    } else {
      // User is under 18 or no age → Delete + Log
      await msg.delete();
      console.log('🗑️ Deleted: Under 18 or no age');
      
      // Log to moderation channel
      await logMinorDetection(msg, ageResult);
    }
    
  } catch (error) {
    console.error('❌ Error in message handler:', error.message);
    // On error, delete to be safe
    try { await msg.delete(); } catch {}
  }
});

// ==================== LOG MINOR DETECTION ====================
async function logMinorDetection(msg, ageResult) {
  const logChannel = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!logChannel) return;
  
  const timestamp = getFormattedTimestamp();
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setAuthor({
      name: `${msg.author.username}`,
      iconURL: msg.author.displayAvatarURL({ dynamic: true })
    })
    .setDescription(`\`\`\`${msg.content}\`\`\``)
    .addFields(
      { name: 'Detection', value: ageResult === 'NO' ? 'No age/Under 18' : 'AI Decision', inline: true },
      { name: 'Channel', value: `<#${msg.channel.id}>`, inline: true }
    )
    .setFooter({
      text: `ID: ${msg.author.id} | ${timestamp}`
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

// ==================== HANDLE ILLEGAL CONTENT ====================
async function handleIllegalContent(msg) {
  await msg.delete();
  
  let banned = false;
  try {
    await msg.member.ban({ 
      reason: `Illegal content - Auto-banned`,
      days: 7
    });
    banned = true;
  } catch (error) {
    console.error('Failed to ban:', error.message);
  }
  
  const logChannel = msg.guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 ILLEGAL CONTENT - AUTO-BANNED')
      .setDescription(
        `**User:** ${msg.author.username} (${msg.author.id})\n` +
        `**Channel:** <#${msg.channel.id}>\n` +
        `**Time:** ${getFormattedTimestamp()}\n\n` +
        `**Content:**\n\`\`\`${msg.content.substring(0, 800)}\`\`\``
      )
      .setFooter({ text: `AUTO-BANNED ${banned ? '✅' : '❌'}` })
      .setTimestamp();
    
    await logChannel.send({ embeds: [embed] });
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
            text: `ID: ${userId} | ${timestamp} • BANNED by @${interaction.user.username}` 
          });
        
        await interaction.message.edit({ embeds: [embed], components: [] });
        await interaction.editReply({ content: `✅ Banned` });
      }
    }
    else if (action === 'ignore') {
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setFooter({ 
          text: `ID: ${userId} | ${timestamp} • IGNORED by @${interaction.user.username}` 
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
    keys: {
      total: API_KEYS.length,
      current: currentKeyIndex,
      stats: keyStats
    },
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

// ==================== ERROR HANDLING ====================
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
